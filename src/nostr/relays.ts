import { normalizeURL } from 'nostr-tools/utils'
import type { Event } from 'nostr-tools/pure'

export type RelayList = { read: string[]; write: string[] }

function clean(url: string): string | undefined {
  if (!/^wss:\/\//i.test(url)) return undefined
  try {
    return normalizeURL(url)
  } catch {
    return undefined
  }
}

export function normalizeRelays(urls: string[]): string[] {
  return [...new Set(urls.map(clean).filter((u): u is string => !!u))]
}

export function parseRelayList(e: Event): RelayList {
  const read: string[] = []
  const write: string[] = []
  for (const t of e.tags) {
    if (t[0] !== 'r' || !t[1]) continue
    if (t[2] !== 'write') read.push(t[1])
    if (t[2] !== 'read') write.push(t[1])
  }
  return { read: normalizeRelays(read), write: normalizeRelays(write) }
}

export type RelayPlan = { relay: string; authors: string[] }

// 各作者を2つのリレーで拾えるよう、多くの作者を覆うリレーから順に選ぶ。漏れた作者は既定リレーへ回す
export function planRelays(
  authors: string[],
  writeRelays: Map<string, string[]>,
  fallback: string[],
  maxRelays = 8,
): RelayPlan[] {
  const need = new Map(authors.map((a) => [a, 2]))
  const candidates = new Map<string, string[]>()
  for (const a of authors) {
    for (const r of writeRelays.get(a) ?? []) {
      candidates.set(r, [...(candidates.get(r) ?? []), a])
    }
  }

  const plans: RelayPlan[] = []
  while (plans.length < maxRelays) {
    let best: [string, string[]] | undefined
    for (const [relay, list] of [...candidates].sort(([a], [b]) => a.localeCompare(b))) {
      const useful = list.filter((a) => need.get(a)! > 0)
      if (useful.length && (!best || useful.length > best[1].length)) best = [relay, useful]
    }
    if (!best) break
    candidates.delete(best[0])
    for (const a of best[1]) need.set(a, need.get(a)! - 1)
    plans.push({ relay: best[0], authors: best[1] })
  }

  const rest = authors.filter((a) => need.get(a) === 2 || !writeRelays.get(a)?.length)
  for (const relay of fallback) {
    const plan = plans.find((p) => p.relay === relay)
    if (plan) plan.authors = [...new Set([...plan.authors, ...rest])]
    else if (rest.length) plans.push({ relay, authors: rest })
  }
  return plans
}
