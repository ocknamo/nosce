import type { Event } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

export type FetchPage = (filter: Filter) => Promise<Event[]>

export const PAGE_LIMIT = 500

// until を下げながら [low, high] を読み切る。空のページが返るまで続けるのは、
// リレーごとに1回の上限が違い、件数では最後のページを判定できないため。
// onPage が数値を返したら、次はその時刻から読む
export async function walkRange(
  fetchPage: FetchPage,
  filter: Filter,
  high: number,
  low: number,
  onPage: (events: Event[], nextUntil: number) => Promise<number | void>,
): Promise<void> {
  let until = high
  let seen = new Set<string>()
  while (until >= low) {
    const page = await fetchPage({ ...filter, since: low, until, limit: PAGE_LIMIT })
    // until を無視して同じページを返すリレーでも、必ず先へ進んで終わるようにする
    const events = page.filter((e) => e.created_at <= until && e.created_at >= low)
    if (!events.length) return
    const fresh = events.filter((e) => !seen.has(e.id))
    const oldest = Math.min(...events.map((e) => e.created_at))
    // 同じ秒の投稿が多いときは同じ秒を読み直す。新しい投稿がなければ1秒下げる
    const next = fresh.length ? oldest : oldest - 1
    seen = new Set(events.filter((e) => e.created_at === oldest).map((e) => e.id))
    until = (await onPage(fresh, next)) ?? next
  }
}
