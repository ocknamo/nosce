import type { Post } from '../db'

// 再実行で結果がぶれすぎないよう、乱数は固定シードにする
function shuffled<T>(items: T[], seed = 42): T[] {
  const list = [...items]
  let s = seed
  for (let i = list.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

export function evenSample(posts: Post[], n: number, seed?: number): Post[] {
  return posts.length <= n ? [...posts] : shuffled(posts, seed).slice(0, n)
}

// 投稿数の多い時期に偏らないよう、四半期ごとに同じ枠を割り当てる
export function stratifiedSample(posts: Post[], n: number): Post[] {
  const buckets = new Map<string, Post[]>()
  for (const p of posts) {
    const d = new Date(p.created_at * 1000)
    const key = `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3)}`
    buckets.set(key, [...(buckets.get(key) ?? []), p])
  }
  if (!buckets.size) return []
  const perBucket = Math.ceil(n / buckets.size)
  const picked = [...buckets.values()].flatMap((b) => shuffled(b).slice(0, perBucket))
  return evenSample(picked, n).sort((a, b) => a.created_at - b.created_at)
}

const SELF_MENTION = /歳|才|誕生日|年齢|仕事|職場|会社|学校|大学|趣味|実家|結婚|子供|息子|娘|[私僕俺]は|わたし|ぼく/

export function selfMentions(posts: Post[], n: number): Post[] {
  return evenSample(
    posts.filter((p) => !p.replyTo && SELF_MENTION.test(p.content)),
    n,
  )
}

export function dedupe(posts: Post[]): Post[] {
  return [...new Map(posts.map((p) => [p.id, p])).values()].sort((a, b) => a.created_at - b.created_at)
}

export function matchKeywords(posts: Post[], keywords: string[]): Post[] {
  const words = keywords.map((k) => k.toLowerCase()).filter(Boolean)
  if (!words.length) return posts
  return posts.filter((p) => {
    const text = p.content.toLowerCase()
    return words.some((w) => text.includes(w))
  })
}
