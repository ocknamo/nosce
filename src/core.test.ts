import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { finalizeEvent, generateSecretKey, getPublicKey, type Event } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import { db, type Post } from './db'
import { parseAccount, saveEvents } from './nostr/events'
import { proveOwnership } from './nostr/identity'
import { normalizeRelays, planRelays } from './nostr/relays'
import { nextAfterIdle } from './nostr/sync'
import { walkRange, type FetchPage } from './nostr/walk'
import { computeStats, computePower, wordRanking } from './analysis/stats'
import { stratifiedSample } from './analysis/sampling'
import { PostIndex, clip } from './analysis/prompt'
import { hitRate, kanjiNumber, splitCitations, tate, toBody } from './analysis/result'

const sk = generateSecretKey()
const me = getPublicKey(sk)
const sign = (kind: number, content: string, created_at: number, tags: string[][] = []) =>
  finalizeEvent({ kind, content, created_at, tags }, sk)

const post = (over: Partial<Post>): Post => ({
  id: Math.random().toString(36),
  pubkey: me,
  created_at: 1_700_000_000,
  content: '',
  source: 'me',
  mentions: [],
  ...over,
})

function fakeRelay(all: Event[], cap: number): FetchPage {
  return async (f) =>
    all
      .filter((e) => e.created_at >= f.since! && e.created_at <= f.until!)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, cap)
}

describe('parseAccount', () => {
  it('npub と hex を受け付ける', () => {
    expect(parseAccount(nip19.npubEncode(me))).toBe(me)
    expect(parseAccount(me)).toBe(me)
  })
  it('nsec は拒否する', () => {
    expect(() => parseAccount(nip19.nsecEncode(sk))).toThrow('秘密鍵')
  })
  it('壊れた入力は日本語のエラーにする', () => {
    expect(() => parseAccount('hello')).toThrow('npub')
  })
})

describe('walkRange', () => {
  it('上限の小さいリレーでも全件読み切る', async () => {
    const all = Array.from({ length: 95 }, (_, i) => sign(1, `p${i}`, 1000 + i))
    const got = new Set<string>()
    await walkRange(fakeRelay(all, 10), { kinds: [1] }, 2000, 0, async (ev) => ev.forEach((e) => got.add(e.id)))
    expect(got.size).toBe(95)
  })
  it('同じ秒に投稿が集中しても止まらず読み切る', async () => {
    const all = [...Array.from({ length: 8 }, (_, i) => sign(1, `s${i}`, 1500)), sign(1, 'old', 1000)]
    const got = new Set<string>()
    await walkRange(fakeRelay(all, 5), { kinds: [1] }, 2000, 0, async (ev) => ev.forEach((e) => got.add(e.id)))
    expect(got.has(all[8].id)).toBe(true)
  })
})

describe('walkRange の終了条件', () => {
  it('until を無視して同じページを返すリレーでも終わる', async () => {
    const all = Array.from({ length: 5 }, (_, i) => sign(1, `p${i}`, 1000 + i))
    let pages = 0
    await walkRange(
      async () => {
        if (++pages > 20) throw new Error('終わらない')
        return all
      },
      { kinds: [1] },
      2000,
      0,
      async () => {},
    )
    expect(pages).toBeLessThanOrEqual(3)
  })
  it('onPage の指定した時刻まで飛ばす', async () => {
    const all = Array.from({ length: 100 }, (_, i) => sign(1, `p${i}`, 1000 + i))
    const got: number[] = []
    let jumped = false
    await walkRange(fakeRelay(all, 10), { kinds: [1] }, 2000, 0, async (events) => {
      got.push(...events.map((e) => e.created_at))
      if (jumped) return
      jumped = true
      return 1005
    })
    expect(got).toContain(1000)
    expect(got).not.toContain(1050)
  })
})

describe('重複だけのページが続いたとき', () => {
  it('続いたら取得済みの一番古い時刻へ飛ぶ', () => {
    expect(nextAfterIdle(6, 5000, 1000)).toBe(1000)
  })
  it('まだ続いていなければ飛ばない', () => {
    expect(nextAfterIdle(5, 5000, 1000)).toBeUndefined()
  })
  it('取得済みより古い範囲を読んでいるときは飛ばない', () => {
    expect(nextAfterIdle(6, 900, 1000)).toBeUndefined()
    expect(nextAfterIdle(6, 5000, undefined)).toBeUndefined()
  })
})

describe('planRelays', () => {
  it('多くの作者を覆うリレーを優先し、リストのない作者は既定へ回す', () => {
    const write = new Map([
      ['a', ['wss://x.example/', 'wss://y.example/']],
      ['b', ['wss://x.example/', 'wss://y.example/']],
      ['c', ['wss://z.example/']],
    ])
    const plan = planRelays(['a', 'b', 'c', 'd'], write, ['wss://base.example/'])
    expect(plan[0].authors).toEqual(['a', 'b'])
    expect(plan.find((p) => p.relay === 'wss://base.example/')?.authors).toEqual(['d'])
  })
  it('wss 以外は除外する', () => {
    expect(normalizeRelays(['ws://a.example', 'wss://b.example', 'nope'])).toEqual(['wss://b.example/'])
  })
})

describe('saveEvents', () => {
  beforeEach(async () => {
    await Promise.all([db.posts.clear(), db.tombstones.clear()])
  })
  const target = { store: 'posts' as const, source: 'me' as const, accept: (e: Event) => e.pubkey === me }

  it('署名の不正な投稿は保存しない', async () => {
    const good = sign(1, 'good', 1000)
    // 検証済みの印が残らないよう、リレーから届くのと同じJSON経由で作る
    const bad = { ...JSON.parse(JSON.stringify(sign(1, 'bad', 1000))), content: '改ざん' }
    expect(await saveEvents([good, bad], target)).toBe(1)
    expect(await db.posts.count()).toBe(1)
  })
  it('削除イベントは先でも後でも効く', async () => {
    const a = sign(1, 'a', 1000)
    const b = sign(1, 'b', 1000)
    await saveEvents([a], target)
    await saveEvents([sign(5, '', 1100, [['e', a.id]]), sign(5, '', 1100, [['e', b.id]])], target)
    await saveEvents([b], target)
    expect(await db.posts.count()).toBe(0)
  })
})

describe('proveOwnership', () => {
  const signer = (key: Uint8Array) => ({
    signEvent: async (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent(template, key),
  })

  it('本人の署名を受け入れる', async () => {
    expect(await proveOwnership(me, signer(sk))).toBe(true)
  })
  it('別の鍵の署名は拒否する', async () => {
    expect(await proveOwnership(me, signer(generateSecretKey()))).toBe(false)
  })
  it('使い回した署名は拒否する', async () => {
    const old = finalizeEvent({ kind: 22242, created_at: 1, tags: [['challenge', 'old']], content: '' }, sk)
    expect(await proveOwnership(me, { signEvent: async () => old })).toBe(false)
  })
  it('改ざんされた署名は拒否する', async () => {
    const forged = {
      signEvent: async (t: Parameters<typeof finalizeEvent>[0]) => ({
        ...JSON.parse(JSON.stringify(finalizeEvent({ ...t, content: '別の内容' }, sk))),
        content: t.content,
      }),
    }
    expect(await proveOwnership(me, forged)).toBe(false)
  })
})

describe('統計', () => {
  it('空でも落ちない', () => {
    expect(computePower(computeStats([], [])).stats).toHaveLength(6)
  })
  it('返信率と反応数を数える', () => {
    const a = post({ id: 'a' })
    const b = post({ id: 'b', replyTo: 'x' })
    const s = computeStats([a, b], [{ id: 'r', kind: 7, pubkey: 'p', created_at: 1, target: 'a' }])
    expect(s.replyRate).toBe(0.5)
    expect(s.reactionsPerPost).toBe(0.5)
  })
  it('毎年上位の言葉は殿堂入りにし、残りを回数の多い順に並べる', () => {
    const y2023 = Date.UTC(2023, 5, 1) / 1000
    const y2024 = Date.UTC(2024, 5, 1) / 1000
    const posts = [
      ...Array.from({ length: 5 }, () => post({ content: 'ラーメン カレー https://a.example/ソバ', created_at: y2023 })),
      ...Array.from({ length: 3 }, () => post({ content: 'ラーメン パスタ', created_at: y2023 })),
      ...Array.from({ length: 5 }, () => post({ content: 'ラーメン ﾍﾟ', created_at: y2024 })),
    ]
    const { years, hall } = wordRanking(posts)
    expect(hall).toEqual([{ word: 'ラーメン', count: 13 }])
    expect(years.map((y) => y.year)).toEqual(['2023', '2024'])
    expect(years[0].words).toEqual([
      { word: 'カレー', count: 5 },
      { word: 'パスタ', count: 3 },
    ])
    expect(years[1].words).toEqual([{ word: 'ﾍﾟ', count: 5 }])
  })
  it('1年分しかなければ殿堂入りを作らない', () => {
    const created_at = Date.UTC(2023, 5, 1) / 1000
    const { years, hall } = wordRanking(Array.from({ length: 3 }, () => post({ content: 'ラーメン', created_at })))
    expect(hall).toEqual([])
    expect(years[0].words[0].word).toBe('ラーメン')
  })
})

describe('抽出と引用', () => {
  it('投稿の多い時期に偏らない', () => {
    const old = Array.from({ length: 50 }, () => post({ created_at: Date.UTC(2022, 1, 1) / 1000 }))
    const recent = Array.from({ length: 5000 }, () => post({ created_at: Date.UTC(2026, 1, 1) / 1000 }))
    const picked = stratifiedSample([...old, ...recent], 100)
    expect(picked).toHaveLength(100)
    expect(picked.filter((p) => old.includes(p)).length).toBe(50)
  })
  it('同じ投稿には同じ番号を振る', () => {
    const index = new PostIndex(new Map())
    const p = post({ content: 'こんにちは' })
    expect(index.line(p)).toBe(index.line(p))
    expect(index.count).toBe(1)
    expect(index.citations.P1).toBe(p.id)
  })
  it('長い投稿は切り詰める', () => {
    expect(clip('あ'.repeat(500)).length).toBe(281)
  })
  it('存在しない番号はリンクにしない', () => {
    const parts = splitCitations('根拠[P1]と[P9]', { P1: 'id1' })
    expect(parts.filter((p) => p.type === 'cite')).toHaveLength(1)
    expect(parts.at(-1)).toEqual({ type: 'text', text: 'と[P9]' })
  })
  it('縦書き用に数字を漢数字、英字を全角にし、根拠番号を消す', () => {
    expect(tate('Nostrで120件[P3]')).toBe('Ｎｏｓｔｒで百二十件')
  })
  it.each([
    ['0', '〇'],
    ['7', '七'],
    ['10', '十'],
    ['11', '十一'],
    ['20', '二十'],
    ['101', '百一'],
    ['120', '百二十'],
    ['1000', '千'],
    ['1500', '千五百'],
    ['10000', '一万'],
    ['12000', '一万二千'],
    ['100000000', '一億'],
    ['007', '〇〇七'],
  ])('%s を漢数字にする', (digits, kanji) => {
    expect(kanjiNumber(digits)).toBe(kanji)
  })
  it.each([
    ['2026年11月1日', '二〇二六年十一月一日'],
    ['23:41に投稿', '二十三時四十一分に投稿'],
    ['23:00', '二十三時'],
    ['1,200件', '千二百件'],
    ['12.5%', '十二・五％'],
    ['１２０回', '百二十回'],
    ['3km', '三ｋｍ'],
  ])('%s を縦書き用にする', (text, expected) => {
    expect(tate(text)).toBe(expected)
  })
  it('構造化出力を種類ごとの本文にする', () => {
    expect(toBody('こんにちは')).toEqual({ type: 'text', text: 'こんにちは' })
    expect(toBody('{"items":[]}', 'appraisal')).toEqual({ type: 'appraisal', items: [] })
    expect(toBody('{"headline":"号外"}', 'newspaper', { issueNo: 3, daily: [] })).toMatchObject({ type: 'newspaper', issueNo: 3 })
    expect(toBody('{"title":"賢者"}', 'award')).toEqual({ type: 'award', award: { title: '賢者' } })
    expect(toBody('{"score":40}', 'drift')).toEqual({ type: 'drift', drift: { score: 40 } })
    expect(toBody('{"title":"対談"}', 'dialogue')).toEqual({ type: 'dialogue', dialogue: { title: '対談' } })
  })
  it('的中率を数える', () => {
    const item = { label: '', value: '', reason: '', confidence: '高' as const, evidence: [] }
    expect(hitRate([{ ...item, check: 'hit' }, { ...item, check: 'miss' }, item])).toEqual({ hits: 1, checked: 2 })
  })
})
