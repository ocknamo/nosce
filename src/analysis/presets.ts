import {
  db,
  getAccount,
  ownPosts,
  postsInRange,
  profileNames,
  type NewspaperMeta,
  type Post,
  type ResultBody,
  type ResultKind,
} from '../db'
import { PostIndex, SYSTEM_PROMPT, postsBlock, statsSummary } from './prompt'
import { dedupe, evenSample, matchKeywords, selfMentions, stratifiedSample } from './sampling'
import { computePower, computeStats, wordRanking } from './stats'
import type { LlmRequest } from './llm'

export type Prepared = {
  request: LlmRequest
  citations: Record<string, string>
  postCount: number
  kind?: ResultKind
  meta?: NewspaperMeta
}

export type Preset = {
  id: string
  title: string
  desc: string
  free?: boolean
  prepare?: () => Promise<Prepared>
  run?: () => Promise<ResultBody>
}

const DAY = 86400
const now = () => Math.floor(Date.now() / 1000)

export async function context() {
  const [own, incoming, names, account] = await Promise.all([
    ownPosts(),
    db.incoming.toArray(),
    profileNames(),
    getAccount(),
  ])
  const others = [...names].filter(([pubkey]) => pubkey !== account).map(([, name]) => name)
  return { own, stats: computeStats(own, incoming), index: new PostIndex(others) }
}

export function build(
  index: PostIndex,
  intro: string,
  task: string,
  schema?: Record<string, unknown>,
  kind?: ResultKind,
): Prepared {
  return {
    request: { system: SYSTEM_PROMPT, user: `${intro}\n\n${task}`, schema },
    citations: index.citations,
    postCount: index.count,
    kind,
  }
}

export const STRING = { type: 'string' }
export const INTEGER = { type: 'integer' }
export const EVIDENCE = { type: 'array', items: STRING }
export const STRINGS = EVIDENCE

export const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})

export const listOf = (properties: Record<string, unknown>) => ({ type: 'array', items: obj(properties) })

export const AWARD_SCHEMA = obj({
  title: STRING,
  citation: STRING,
  evidence: EVIDENCE,
  runnersUp: listOf({ name: STRING, reason: STRING }),
})

const DRIFT_EXAMPLE = { quote: STRING, evidence: STRING }

export const DRIFT_SCHEMA = obj({
  score: INTEGER,
  verdict: STRING,
  flowed: INTEGER,
  own: INTEGER,
  neutral: INTEGER,
  comment: STRING,
  flowedExamples: listOf(DRIFT_EXAMPLE),
  ownExamples: listOf(DRIFT_EXAMPLE),
})

export const DIALOGUE_SCHEMA = obj({
  title: STRING,
  lead: STRING,
  lines: listOf({ speaker: { type: 'string', enum: ['past', 'now'] }, text: STRING }),
  closing: STRING,
  evidence: EVIDENCE,
})

export const APPRAISAL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'value', 'reason', 'confidence', 'evidence'],
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          reason: { type: 'string' },
          confidence: { type: 'string', enum: ['高', '中', '低', '不明'] },
          evidence: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

export const NEWSPAPER_SCHEMA = obj({
  headline: STRING,
  subhead: STRING,
  lead: STRING,
  leadEvidence: EVIDENCE,
  articles: listOf({ section: STRING, title: STRING, body: STRING, evidence: EVIDENCE }),
  column: obj({ title: STRING, body: STRING, evidence: EVIDENCE }),
  weather: STRING,
  letter: obj({ from: STRING, body: STRING }),
})

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export const PRESETS: Preset[] = [
  { id: 'power', title: 'Nostr戦闘力', desc: '投稿の傾向をRPGのステータスに', free: true },
  { id: 'words', title: 'My流行語大賞', desc: '毎年の定番は殿堂入り、その年の言葉で大賞を決める', free: true },
  {
    id: 'newspaper',
    title: '週刊じぶん新聞',
    desc: '今週の自分を新聞に',
    prepare: async () => {
      const { own, index } = await context()
      const end = now()
      const start = end - 7 * DAY
      const week = await postsInRange('me', start, end)
      const mine = evenSample(week, 300)
      const tl = evenSample(await postsInRange('tl', start, end), 150)
      const intro = [
        postsBlock('今週の自分の投稿', dedupe(mine).map((p) => index.line(p))),
        postsBlock('今週のTLの一部', dedupe(tl).map((p) => index.line(p))),
      ].join('\n')
      const daily = Array.from({ length: 7 }, (_, i) => {
        const from = end - (7 - i) * DAY
        return {
          label: WEEKDAYS[new Date((from + DAY - 1) * 1000).getDay()],
          count: week.filter((p) => p.created_at > from && p.created_at <= from + DAY).length,
        }
      })
      const first = own[0]?.created_at ?? end
      return {
        ...build(
          index,
          intro,
          `今週の「私」を題材に、一流紙の記者として本物の新聞の紙面を書いてください。「私」は「本紙の筆者」ではなく、世間を騒がせる人物として三人称で「同氏」と書いてください。
文体は新聞の報道調で、ささいな出来事ほど大事件のように重々しく書いてください。

- headline: 一面の大見出し。14字以内
- subhead: 一面の袖見出し。20字以内
- lead: 一面トップ記事の本文。800字前後
- articles: 3本。section は「社会」「文化」「スポーツ」などの面の名前、title は14字以内、body は350字前後
- column: 一面コラム。title は5字以内、body は300字前後
- weather: 今週の私の心模様を天気予報にしたもの。50字以内
- letter: TLの空気を反映した読者投稿。from は「神奈川県 無職 匿名(42)」のような架空の投稿者、body は80字以内

本文に [P12] のような番号は書かず、根拠の番号は leadEvidence と各 evidence に "P12" の形式で入れてください。段落は分けず、改行も入れないでください。紙面は縦書きなので、数字は漢数字で書いてください。`,
          NEWSPAPER_SCHEMA,
          'newspaper',
        ),
        meta: { issueNo: Math.floor((end - first) / (7 * DAY)) + 1, daily },
      }
    },
  },
  {
    id: 'nickname',
    title: '二つ名授与',
    desc: '称号を根拠つきで授ける',
    prepare: async () => {
      const { own, stats, index } = await context()
      const intro = `${statsSummary(stats)}\n\n${postsBlock(
        '全期間から均等に抽出した自分の投稿',
        stratifiedSample(own, 800).map((p) => index.line(p)),
      )}`
      return build(
        index,
        intro,
        `「深夜のラーメン哲学者」のような、私にぴったりの二つ名を1つ授けてください。

- title: 二つ名。14字以内
- citation: 賞状の本文。「右の者は」で始め、「ここに二つ名を授与し これを賞する」で結ぶ、格調高い表彰文。200字前後。「ここに」の前に投稿から読み取れる功績を具体的に書いてください
- evidence: 根拠の番号を "P12" の形式で
- runnersUp: 次点の二つ名を3つ。name は14字以内、reason は30字以内

本文に [P12] のような番号は書かないでください。賞状は縦書きなので、数字は漢数字で書いてください。`,
        AWARD_SCHEMA,
        'award',
      )
    },
  },
  {
    id: 'drift',
    title: 'TL流され度診断',
    desc: 'TLの話題に乗った割合を判定',
    prepare: async () => {
      const { index } = await context()
      const end = now()
      const start = end - 30 * DAY
      const mine = evenSample(await postsInRange('me', start, end), 120).sort((a, b) => a.created_at - b.created_at)
      const groups: string[] = []
      for (const p of mine) {
        const tl = (await postsInRange('tl', p.created_at - 1800, p.created_at - 1)).slice(-4)
        groups.push(`--\n${tl.map((x) => index.line(x)).join('\n')}\n→ ${index.line(p)}`)
      }
      return build(
        index,
        postsBlock('自分の投稿(→の行)と、その直前30分のTL', groups),
        `TL内科の専門医として、各投稿を「TLに流された」「自分発」「どちらとも言えない」に分類し、診断書を書いてください。

- score: 流され度。0〜100の整数
- verdict: 判定名。「慢性TL追従症」「孤高の自律投稿」のような架空の診断名。実在の病名は使わない。10字以内
- flowed, own, neutral: それぞれの分類の投稿数
- comment: 医師の所見。カルテの口調で150字前後
- flowedExamples: 特に流された投稿を2つ。quote は投稿の短い引用で40字以内、evidence は "P12" の形式
- ownExamples: TLを無視して我が道を行った投稿を2つ。形式は同じ

本文に [P12] のような番号は書かないでください。`,
        DRIFT_SCHEMA,
        'drift',
      )
    },
  },
  {
    id: 'dialogue',
    title: '4年前の私と対談',
    desc: '昔の自分と今の自分が話す',
    prepare: async () => {
      const { own, index } = await context()
      if (!own.length) return build(index, '', '')
      const oldest = Math.min(...own.slice(0, 1000).map((p) => p.created_at))
      const past = own.filter((p) => p.created_at < oldest + 365 * DAY)
      const recent = own.filter((p) => p.created_at > now() - 180 * DAY)
      const intro = [
        postsBlock('昔の私(最初の1年)', dedupe(evenSample(past, 300)).map((p) => index.line(p))),
        postsBlock('今の私(直近半年)', dedupe(evenSample(recent, 300)).map((p) => index.line(p))),
      ].join('\n')
      return build(
        index,
        intro,
        `雑誌の特別対談として、昔の私と今の私の対談を書いてください。それぞれの投稿から文体と関心を再現し、変わったこと、変わらないこと、昔の私が今の私に言いたいことを話題にしてください。

- title: 記事の見出し。発言の一部を切り取ったような、20字以内の言葉
- lead: 編集部によるリード文。100字前後
- lines: 発言を16〜24個。speaker は昔の私が past、今の私が now、text は1発言80字以内
- closing: 編集後記。60字前後
- evidence: 再現の根拠にした投稿の番号を "P12" の形式で5つまで

本文に [P12] のような番号は書かないでください。`,
        DIALOGUE_SCHEMA,
        'dialogue',
      )
    },
  },
  {
    id: 'appraisal',
    title: '私の鑑定書',
    desc: '年齢や性格などを推定して答え合わせ',
    prepare: async () => {
      const { own, stats, index } = await context()
      const posts = dedupe([...stratifiedSample(own, 900), ...selfMentions(own, 300)])
      const intro = `${statsSummary(stats)}\n\n${postsBlock(
        '全期間から抽出した自分の投稿',
        posts.map((p) => index.line(p)),
      )}`
      return build(
        index,
        intro,
        `投稿から私を評価してください。項目は次の順番で、この名前のままにしてください。
性別、実年齢、精神年齢、趣味、性格、長所、短所、IQ、言語理解、知覚推理、ワーキングメモリー、処理速度、私を表す形容詞、ぶっ飛び度(1〜100)

- 分からない項目は value を「不明」、confidence を「不明」にし、reason に理由を書いてください。
- IQと各指数、精神年齢、ぶっ飛び度は「不明」にせず、熟練の鑑定士として数値を言い切り、もっともらしい理由を書いてください。
- evidence には根拠の番号を "P12" の形式で入れてください。`,
        APPRAISAL_SCHEMA,
        'appraisal',
      )
    },
  },
]

export async function runFreePreset(id: string) {
  const own = await ownPosts()
  if (id === 'words') return { type: 'words' as const, data: wordRanking(own) }
  const incoming = await db.incoming.toArray()
  return { type: 'power' as const, data: computePower(computeStats(own, incoming)) }
}

export type QuestionPlan = {
  mode: 'focused' | 'overview'
  from: string | null
  to: string | null
  scope: 'me' | 'tl' | 'both'
  keywords: string[]
}

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['mode', 'from', 'to', 'scope', 'keywords'],
  properties: {
    mode: { type: 'string', enum: ['focused', 'overview'] },
    from: { type: ['string', 'null'] },
    to: { type: ['string', 'null'] },
    scope: { type: 'string', enum: ['me', 'tl', 'both'] },
    keywords: { type: 'array', items: { type: 'string' } },
  },
}

export function planRequest(question: string, today: string): LlmRequest {
  return {
    system: `Nostrの投稿データベースから、質問に答えるために読む投稿の条件を決めてください。
mode は、特定の話題や時期の質問なら focused、自分全体の評価や傾向の質問なら overview です。
from と to は YYYY-MM-DD 形式で、期間の指定がなければ null です。
scope は読む対象で、me は自分の投稿、tl はフォロー中の人の投稿、both は両方です。
keywords は投稿の検索語です。言い換えも含めて5個以内にし、絞る必要がなければ空にしてください。`,
    user: `今日は ${today} です。\n質問: ${question}`,
    schema: PLAN_SCHEMA,
  }
}

const toTime = (date: string | null, fallback: number, endOfDay = false) => {
  if (!date) return fallback
  const t = new Date(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}`).getTime() / 1000
  return Number.isNaN(t) ? fallback : t
}

export async function prepareQuestion(question: string, plan: QuestionPlan): Promise<Prepared> {
  const { own, stats, index } = await context()
  const from = toTime(plan.from, 0)
  const to = toTime(plan.to, now(), true)
  const inRange = (p: Post) => p.created_at >= from && p.created_at <= to

  const blocks: string[] = []
  if (plan.scope !== 'tl') {
    const scoped = own.filter(inRange)
    const picked =
      plan.mode === 'overview'
        ? dedupe([...stratifiedSample(scoped, 900), ...selfMentions(scoped, 300)])
        : stratifiedSample(matchKeywords(scoped, plan.keywords), 600)
    blocks.push(postsBlock('自分の投稿', picked.map((p) => index.line(p))))
  }
  if (plan.scope !== 'me') {
    const tl = await postsInRange('tl', from, to)
    const picked = stratifiedSample(matchKeywords(tl, plan.keywords), 400)
    blocks.push(postsBlock('TLの投稿', picked.map((p) => index.line(p))))
  }
  return build(index, `${statsSummary(stats)}\n\n${blocks.join('\n')}`, `質問: ${question}`)
}
