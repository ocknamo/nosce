import type { Incoming, Post } from '../db'

export type Stats = {
  total: number
  firstAt: number
  lastAt: number
  activeDays: number
  spanDays: number
  perDay: number
  avgLength: number
  replyRate: number
  nightRate: number
  longestStreak: number
  reactionsPerPost: number
  perYear: Record<string, number>
  // heatmap[曜日 0=日][時]
  heatmap: number[][]
}

const dayKey = (t: number) => {
  const d = new Date(t * 1000)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function computeStats(posts: Post[], incoming: Incoming[]): Stats {
  const heatmap = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const perYear: Record<string, number> = {}
  const days = new Set<string>()
  const ownIds = new Set(posts.map((p) => p.id))
  let chars = 0
  let replies = 0
  let night = 0
  let firstAt = Infinity
  let lastAt = 0

  for (const p of posts) {
    const d = new Date(p.created_at * 1000)
    heatmap[d.getDay()][d.getHours()]++
    const year = String(d.getFullYear())
    perYear[year] = (perYear[year] ?? 0) + 1
    days.add(dayKey(p.created_at))
    chars += [...p.content].length
    if (p.replyTo) replies++
    if (d.getHours() < 5) night++
    firstAt = Math.min(firstAt, p.created_at)
    lastAt = Math.max(lastAt, p.created_at)
  }

  const total = posts.length
  if (!total) firstAt = 0
  const spanDays = total ? Math.ceil((lastAt - firstAt) / 86400) + 1 : 0

  let longestStreak = 0
  let streak = 0
  for (let t = firstAt; total && t <= lastAt + 86400; t += 86400) {
    streak = days.has(dayKey(t)) ? streak + 1 : 0
    longestStreak = Math.max(longestStreak, streak)
  }

  const received = incoming.filter((i) => i.target && ownIds.has(i.target)).length
  return {
    total,
    firstAt,
    lastAt,
    activeDays: days.size,
    spanDays,
    perDay: spanDays ? total / spanDays : 0,
    avgLength: total ? chars / total : 0,
    replyRate: total ? replies / total : 0,
    nightRate: total ? night / total : 0,
    longestStreak,
    reactionsPerPost: total ? received / total : 0,
    perYear,
    heatmap,
  }
}

export type PowerStat = { label: string; meaning: string; value: number }

export type Power = {
  level: number
  title: string
  stats: PowerStat[]
  summary: Stats
}

// 指標ごとの「ここまで行けば999」という基準。遊びなので上限で丸める
const score = (value: number, full: number) => Math.round(Math.min(value / full, 1) * 999)

export function computePower(s: Stats): Power {
  const stats: PowerStat[] = [
    { label: 'HP', meaning: '活動した日数', value: score(s.activeDays, 1500) },
    { label: '攻撃力', meaning: '1日の投稿数', value: score(s.perDay, 150) },
    { label: '魔力', meaning: '平均文字数', value: score(s.avgLength, 120) },
    { label: '素早さ', meaning: '返信の多さ', value: score(s.replyRate, 0.7) },
    { label: '闇の力', meaning: '深夜0〜5時の投稿率', value: score(s.nightRate, 0.3) },
    { label: '魅力', meaning: '1投稿あたりの反応', value: score(s.reactionsPerPost, 3) },
  ]
  const avg = stats.reduce((a, b) => a + b.value, 0) / stats.length
  const top = [...stats].sort((a, b) => b.value - a.value)[0]
  const titles: Record<string, string> = {
    HP: '不眠不休の古参',
    攻撃力: '連投の狂戦士',
    魔力: '長文の賢者',
    素早さ: '即レスの忍者',
    闇の力: '深夜の住人',
    魅力: 'TLの人気者',
  }
  return { level: Math.max(1, Math.round(avg / 10)), title: titles[top.label], stats, summary: s }
}

export type WordYear = { year: string; words: { word: string; count: number }[] }

const URL_RE = /https?:\/\/\S+|nostr:\S+|wss?:\/\/\S+/g
const HIRAGANA_ONLY = /^[\p{Script=Hiragana}ー]+$/u
const NOISE = /^[\d\p{P}\p{S}]+$/u
const STOP = new Set(
  `今日 明日 昨日 自分 時間 感じ 本当 人間 今回 最近 www
  the to of and is it in that you for on with this be are was as at but not have can if or so we they
  my me do no what just like from an will would there about your all has how more one`.split(/\s+/),
)

export function tokenize(text: string, segmenter: Intl.Segmenter): string[] {
  const out: string[] = []
  for (const s of segmenter.segment(text.replace(URL_RE, ' '))) {
    const w = s.segment.toLowerCase()
    if (!s.isWordLike || [...w].length < 2) continue
    if (HIRAGANA_ONLY.test(w) || NOISE.test(w) || STOP.has(w)) continue
    out.push(w)
  }
  return out
}

export function countWords(posts: Post[]) {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
  const counts = new Map<string, number>()
  for (const p of posts) {
    for (const w of tokenize(p.content, segmenter)) counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return counts
}

export type WordCount = { word: string; count: number }

export type WordRanking = { years: WordYear[]; hall: WordCount[] }

// 殿堂入りを判定するときに見る、各年の上位の語数
const HALL_RANGE = 60

// 毎年上位に入る言葉は殿堂入りとして別枠にし、残りの言葉を年ごとに回数の多い順に並べる
export function wordRanking(posts: Post[], top = 10): WordRanking {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' })
  const byYear = new Map<string, Map<string, number>>()
  for (const p of posts) {
    const year = String(new Date(p.created_at * 1000).getFullYear())
    const counts = byYear.get(year) ?? new Map<string, number>()
    byYear.set(year, counts)
    for (const w of tokenize(p.content, segmenter)) {
      counts.set(w, (counts.get(w) ?? 0) + 1)
    }
  }
  const ranked = [...byYear.keys()].sort().map((year) => ({
    year,
    words: [...byYear.get(year)!]
      .filter(([, n]) => n >= 3)
      .sort(([, x], [, y]) => y - x)
      .map(([word, count]) => ({ word, count })),
  }))

  const needed = Math.max(2, Math.ceil(ranked.length / 2))
  const appearances = new Map<string, number>()
  for (const { words } of ranked) {
    for (const { word } of words.slice(0, HALL_RANGE)) {
      appearances.set(word, (appearances.get(word) ?? 0) + 1)
    }
  }
  const isHall = (word: string) => (appearances.get(word) ?? 0) >= needed

  const totals = new Map<string, number>()
  for (const { words } of ranked) {
    for (const { word, count } of words) {
      if (isHall(word)) totals.set(word, (totals.get(word) ?? 0) + count)
    }
  }
  return {
    years: ranked.map(({ year, words }) => ({ year, words: words.filter((w) => !isHall(w.word)).slice(0, top) })),
    hall: [...totals]
      .sort(([, x], [, y]) => y - x)
      .slice(0, top)
      .map(([word, count]) => ({ word, count })),
  }
}
