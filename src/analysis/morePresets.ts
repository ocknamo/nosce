import { db, getAccount, ownPosts, postsInRange, profileNames, type Incoming, type Post, type ResultBody } from '../db'
import {
  EVIDENCE,
  INTEGER,
  PRESETS,
  STRING,
  STRINGS,
  build,
  context,
  listOf,
  obj,
  type Prepared,
  type Preset,
} from './presets'
import { formatTime, postsBlock, statsSummary, type PostIndex } from './prompt'
import { dedupe, evenSample, selfMentions, stratifiedSample } from './sampling'
import { computeStats, countWords, wordRanking, type Stats } from './stats'

const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)
const EVIDENCE_NOTE = '本文に [P12] のような番号は書かず、根拠の番号は evidence に "P12" の形式で入れてください。'

const lines = (index: PostIndex, posts: Post[]) => posts.map((p) => index.line(p))

function overview(own: Post[]) {
  return dedupe([...stratifiedSample(own, 700), ...selfMentions(own, 200)])
}

type Ctx = Awaited<ReturnType<typeof context>>

function sheetPreset(
  id: string,
  title: string,
  desc: string,
  intro: (ctx: Ctx) => string | Promise<string>,
  task: string,
  properties: Record<string, unknown>,
): Preset {
  return {
    id,
    title,
    desc,
    prepare: async (): Promise<Prepared> => {
      const ctx = await context()
      const text = await intro(ctx)
      return build(ctx.index, text, `${task}\n\n${EVIDENCE_NOTE}`, obj({ ...properties, evidence: EVIDENCE }), 'sheet')
    },
  }
}

const withStats = ({ own, stats, index }: Ctx) =>
  `${statsSummary(stats)}\n\n${postsBlock('全期間から抽出した自分の投稿', lines(index, overview(own)))}`

function yearlyWords(own: Post[]) {
  return wordRanking(own, 5)
    .years.map((y) => `${y.year}年の特徴語: ${y.words.map((w) => w.word).join('、')}`)
    .join('\n')
}

const AI_PRESETS: Preset[] = [
  sheetPreset(
    'ingredients',
    '成分表示',
    '自分の成分を食品ラベルに',
    (ctx) => `${yearlyWords(ctx.own)}\n\n${withStats(ctx)}`,
    `私を食品に見立てて成分表示を作ってください。
- productName: 商品名。「ぺぇ(清涼飲料水)」のように名称を付ける
- items: 成分を6〜8個。name は「ダーツ」「虚無」のように投稿から読み取れるもの、percent は合計100の整数
- allergens: 「特定原材料」として扱う、気をつけるべき話題を3つ
- note: 使用上の注意。60字以内`,
    { productName: STRING, items: listOf({ name: STRING, percent: INTEGER }), allergens: STRINGS, note: STRING },
  ),
  sheetPreset(
    'dig',
    '黒歴史発掘調査報告書',
    '古い投稿を出土品として解説',
    ({ own, index }) =>
      postsBlock('初期の自分の投稿', lines(index, stratifiedSample(own.slice(0, Math.ceil(own.length * 0.4)), 600))),
    `考古学者として、私の古い投稿を発掘した調査報告書を書いてください。学術的で大真面目な文体にしてください。
- site: 遺跡名。「ぺぇ遺跡 第一次調査」のように
- period: 調査した年代
- summary: 調査の概要。120字前後
- finds: 出土品を4つ。name は「深夜の叫び型土器」のような名前、era は投稿の年月、quote は30字以内の短い引用、note は考察で80字前後
- conclusion: 結論。80字前後`,
    {
      site: STRING,
      period: STRING,
      summary: STRING,
      finds: listOf({ name: STRING, era: STRING, quote: STRING, note: STRING }),
      conclusion: STRING,
    },
  ),
  sheetPreset(
    'history',
    'じぶん年表',
    '4年間を時代区分する',
    ({ own, index }) => `${yearlyWords(own)}\n\n${postsBlock('全期間の自分の投稿', lines(index, stratifiedSample(own, 900)))}`,
    `歴史の教科書の執筆者として、私のNostrの歩みを年表にしてください。
- eras: 時代区分を4〜6個。name は「ラーメン時代」「引っ越しの乱」のような名前、period は年月の範囲、summary は60字前後、event はその時代の代表的な出来事で30字以内`,
    { eras: listOf({ name: STRING, period: STRING, summary: STRING, event: STRING }) },
  ),
  sheetPreset(
    'omikuji',
    'おみくじ',
    '今週の投稿から運勢を占う',
    async ({ own, index }) => {
      const week = await postsInRange('me', now() - 7 * DAY, now())
      return postsBlock('最近の自分の投稿', lines(index, evenSample(week.length ? week : own.slice(-200), 200)))
    },
    `神社のおみくじを書いてください。投稿の内容に合わせた運勢にしてください。
- fortune: 大吉、中吉、小吉、吉、末吉、凶のどれか
- waka: 運勢を詠んだ短い歌。31字以内
- items: 願望、待人、失物、旅行、商売、学問の6項目。label は項目名、text は20字以内
- advice: 神様からのひとこと。50字以内`,
    { fortune: STRING, waka: STRING, items: listOf({ label: STRING, text: STRING }), advice: STRING },
  ),
  sheetPreset(
    'pyre',
    '不遇の名作お焚き上げ',
    '反応のなかった投稿を供養する',
    async ({ own, index }) => {
      const incoming = await db.incoming.toArray()
      const reacted = new Set(incoming.map((i) => i.target))
      const lonely = own.filter((p) => !p.replyTo && !reacted.has(p.id) && [...p.content].length >= 20)
      return postsBlock('反応のなかった自分の投稿', lines(index, stratifiedSample(lonely, 300)))
    },
    `住職として、反応のなかった投稿を供養してください。
- posthumous: 投稿たちに授ける戒名。「深夜院虚空独言居士」のように
- sermon: 法話。120字前後
- items: 特に惜しまれる投稿を3つ。quote は30字以内の短い引用、review は住職の講評で50字以内`,
    { posthumous: STRING, sermon: STRING, items: listOf({ quote: STRING, review: STRING }) },
  ),
  sheetPreset(
    'manual',
    '私のトリセツ',
    '家電の説明書として書く',
    withStats,
    `私を家電に見立てて、取扱説明書を書いてください。
- model: 型番。「PEE-2022」のように
- intro: はじめに。60字前後
- spec: 仕様を5つ。label は項目名、value は値
- care: 正しいお手入れを3つ。各30字以内
- trouble: 故障かな?と思ったらを4つ。symptom は症状、cause は原因、fix は対処で、各25字以内
- warning: 警告を2つ。各30字以内`,
    {
      model: STRING,
      intro: STRING,
      spec: listOf({ label: STRING, value: STRING }),
      care: STRINGS,
      trouble: listOf({ symptom: STRING, cause: STRING, fix: STRING }),
      warning: STRINGS,
    },
  ),
  sheetPreset(
    'court',
    '深夜の私 vs 昼の私',
    '2人の自分が法廷で争う',
    ({ own, index }) => {
      const hour = (p: Post) => new Date(p.created_at * 1000).getHours()
      return [
        postsBlock('深夜0〜5時の投稿', lines(index, stratifiedSample(own.filter((p) => hour(p) < 5), 300))),
        postsBlock('昼10〜17時の投稿', lines(index, stratifiedSample(own.filter((p) => hour(p) >= 10 && hour(p) < 18), 300))),
      ].join('\n')
    },
    `昼の私が深夜の私を訴えた裁判の記録を書いてください。それぞれの投稿から文体を再現してください。
- caseName: 事件名。「令和○年(ワ)第○号 深夜投稿差止請求事件」のように
- claim: 訴えの内容。60字前後
- lines: 法廷でのやり取りを10〜14個。speaker は day、night、judge のどれか、text は60字以内
- verdict: 判決の主文。50字以内
- reason: 判決理由。100字前後`,
    {
      caseName: STRING,
      claim: STRING,
      lines: listOf({ speaker: { type: 'string', enum: ['day', 'night', 'judge'] }, text: STRING }),
      verdict: STRING,
      reason: STRING,
    },
  ),
  sheetPreset(
    'bot',
    '私bot仕様書',
    '文体を分析して次の投稿を予測',
    withStats,
    `私の投稿を学習した会話ボットを発売するつもりで、製品カタログを書いてください。
- productName: 製品名
- tagline: キャッチコピー。25字以内
- specs: 性能を4つ。label は項目名、value は値
- tone: 文体の特徴を3つ。各30字以内
- predictions: 私が次に言いそうな投稿を3つ。私の文体で各40字以内`,
    {
      productName: STRING,
      tagline: STRING,
      specs: listOf({ label: STRING, value: STRING }),
      tone: STRINGS,
      predictions: STRINGS,
    },
  ),
  sheetPreset(
    'encyclopedia',
    'じぶん百科事典',
    '百科事典の項目として真面目に書く',
    withStats,
    `百科事典の編集者として、私の項目を中立的で真面目な文体で書いてください。
- summary: 冒頭の定義文。80字前後
- infobox: 基本情報を6つ。label は項目名、value は値
- sections: 節を3〜4個。heading は「人物」「来歴」「エピソード」のような見出し、body は120字前後
- related: 関連項目を4つ`,
    {
      summary: STRING,
      infobox: listOf({ label: STRING, value: STRING }),
      sections: listOf({ heading: STRING, body: STRING }),
      related: STRINGS,
    },
  ),
  sheetPreset(
    'resume',
    'Nostr履歴書',
    'Nostr歴を職歴にする',
    withStats,
    `Nostrでの活動を職歴に見立てて、大真面目に履歴書を書いてください。
- history: 職歴を5つ。date は「2023年4月」の形式、text は「深夜投稿部 入部」のような内容
- licenses: 免許、資格を3つ。date は同じ形式、text は「普通ダーツ免許 取得」のような架空の資格
- motive: 志望動機。100字前後
- hobbies: 趣味、特技。40字以内
- note: 本人希望記入欄。40字以内`,
    {
      history: listOf({ date: STRING, text: STRING }),
      licenses: listOf({ date: STRING, text: STRING }),
      motive: STRING,
      hobbies: STRING,
      note: STRING,
    },
  ),
  sheetPreset(
    'weather',
    'TL天気予報',
    '今日のTLの空気を予報する',
    async ({ index }) => {
      const recent = await postsInRange('tl', now() - DAY, now())
      const tl = recent.length ? recent : (await postsInRange('tl', 0, now())).slice(-300)
      return postsBlock('最近のTLの投稿', lines(index, evenSample(tl, 250)))
    },
    `気象予報士として、TL全体の空気を天気予報にしてください。特定の人には触れず、全体の雰囲気だけを伝えてください。
- headline: 見出し。25字以内
- periods: 朝、昼、夕方、深夜の4つ。time は時間帯、icon は sun、cloud、rain、storm、snow のどれか、text は「ポエム注意報」のような予報で30字以内
- warning: 注意報。30字以内
- comment: 予報士のひとこと。60字前後`,
    {
      headline: STRING,
      periods: listOf({ time: STRING, icon: { type: 'string', enum: ['sun', 'cloud', 'rain', 'storm', 'snow'] }, text: STRING }),
      warning: STRING,
      comment: STRING,
    },
  ),
]

export const pad2 = (n: number) => String(n).padStart(2, '0')

export function dateKey(t: number) {
  const d = new Date(t * 1000)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

const grade = (value: number, steps: number[]) => 5 - steps.filter((s) => value < s).length

export function reportCard(s: Stats) {
  const items = [
    { label: '継続する力', score: grade(s.spanDays ? s.activeDays / s.spanDays : 0, [0.9, 0.7, 0.5, 0.3]) },
    { label: '早寝早起き', score: grade(1 - s.nightRate, [0.97, 0.92, 0.85, 0.75]) },
    { label: '発言の量', score: grade(s.perDay, [100, 30, 10, 3]) },
    { label: 'みんなとの交流', score: grade(s.replyRate, [0.5, 0.3, 0.15, 0.05]) },
    { label: '文章を書く力', score: grade(s.avgLength, [80, 50, 30, 15]) },
    { label: 'みんなからの人気', score: grade(s.reactionsPerPost, [3, 1.5, 0.7, 0.2]) },
  ]
  const sorted = [...items].sort((a, b) => b.score - a.score)
  return {
    items,
    attendance: { days: s.spanDays, active: s.activeDays, streak: s.longestStreak },
    comment: `${sorted[0].label}は大変よくできました。${sorted.at(-1)!.label}はもう少しがんばりましょう。`,
  }
}

export function calendarData(posts: Post[]) {
  const counts: Record<string, number> = {}
  for (const p of posts) {
    const key = dateKey(p.created_at)
    counts[key] = (counts[key] ?? 0) + 1
  }
  const best = Object.entries(counts).sort(([, a], [, b]) => b - a)[0]
  return { counts, total: posts.length, days: Object.keys(counts).length, best: best ? { date: best[0], count: best[1] } : null }
}

const YEN = { post: 1, reaction: 1, repost: 5, reply: 3, zap: 10 }

export function householdData(posts: Post[], incoming: Incoming[], at: Date) {
  const months: string[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(at.getFullYear(), at.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`)
  }
  const earn = (i: Incoming) =>
    i.kind === 7 ? YEN.reaction : i.kind === 6 ? YEN.repost : i.kind === 9735 ? YEN.zap : YEN.reply
  const rows = months.map((month) => ({ month, income: 0, expense: 0 }))
  const find = (t: number) => rows.find((r) => r.month === dateKey(t).slice(0, 7))
  for (const p of posts) {
    const row = find(p.created_at)
    if (row) row.expense += YEN.post
  }
  for (const i of incoming) {
    const row = find(i.created_at)
    if (row) row.income += earn(i)
  }
  const income = rows.reduce((a, r) => a + r.income, 0)
  const expense = rows.reduce((a, r) => a + r.expense, 0)
  return { rows, income, expense, balance: income - expense }
}

export function greetingData(posts: Post[], incoming: Incoming[]) {
  const year = new Date((posts.at(-1)?.created_at ?? now()) * 1000).getFullYear()
  const inYear = posts.filter((p) => new Date(p.created_at * 1000).getFullYear() === year)
  const s = computeStats(inYear, incoming)
  const top = [...countWords(inYear)].sort(([, a], [, b]) => b - a)[0]
  return { year, nextYear: year + 1, total: s.total, activeDays: s.activeDays, nightRate: s.nightRate, topWord: top?.[0] ?? '' }
}

export function stampData(posts: Post[], at: number) {
  const first = posts[0]
  if (!first) return { firstDate: '', firstText: '', days: 0, total: 0 }
  return {
    firstDate: formatTime(first.created_at).slice(0, 10),
    firstText: first.content.slice(0, 60),
    days: Math.floor((at - first.created_at) / DAY) + 1,
    total: posts.length,
  }
}

export function trendWords(mine: Map<string, number>, tl: Map<string, number>, hidden: string[] = [], size = 8) {
  const isHidden = (word: string) => hidden.some((n) => n.toLowerCase() === word)
  const ranked = (m: Map<string, number>) =>
    [...m].filter(([w]) => !isHidden(w)).sort(([, a], [, b]) => b - a)
  const tlTop = ranked(tl)
  const mineTop = ranked(mine)
  return {
    tlTop: tlTop.slice(0, size).map(([word, count]) => ({ word, count })),
    ignored: tlTop
      .filter(([w]) => !mine.get(w))
      .slice(0, size)
      .map(([word, count]) => ({ word, count })),
    onlyMine: mineTop
      .filter(([w]) => !tl.get(w))
      .slice(0, size)
      .map(([word, count]) => ({ word, count })),
  }
}

const freePreset = (id: string, title: string, desc: string, make: () => Promise<unknown>): Preset => ({
  id,
  title,
  desc,
  free: true,
  run: async (): Promise<ResultBody> => ({ type: 'sheet', data: await make() }),
})

const FREE_PRESETS: Preset[] = [
  freePreset('calendar', '投稿カレンダー', '4年分の投稿を1枚の草にする', async () => calendarData(await ownPosts())),
  freePreset('report', '生活リズム通知表', '投稿の習慣を5段階で評価', async () => {
    const [own, incoming] = await Promise.all([ownPosts(), db.incoming.toArray()])
    return reportCard(computeStats(own, incoming))
  }),
  freePreset('household', 'Nostr家計簿', '投稿を支出、反応を収入に', async () => {
    const [own, incoming] = await Promise.all([ownPosts(), db.incoming.toArray()])
    return householdData(own, incoming, new Date())
  }),
  freePreset('greeting', 'Nostr年賀状', '1年の活動を年賀状に', async () => {
    const [own, incoming] = await Promise.all([ownPosts(), db.incoming.toArray()])
    return greetingData(own, incoming)
  }),
  freePreset('stamp', '初投稿記念切手', '最初の投稿を記念切手に', async () => stampData(await ownPosts(), now())),
  freePreset('trend', 'TL流行語くらべ', 'TLの流行と自分の言葉を比べる', async () => {
    const start = now() - 30 * DAY
    const [mine, tl, names, account] = await Promise.all([
      postsInRange('me', start, now()),
      postsInRange('tl', start, now()),
      profileNames(),
      getAccount(),
    ])
    const hidden = [...names].filter(([key]) => key !== account).map(([, name]) => name)
    return trendWords(countWords(mine), countWords(tl), hidden)
  }),
]

export const ALL_PRESETS: Preset[] = [...PRESETS, ...FREE_PRESETS, ...AI_PRESETS]
