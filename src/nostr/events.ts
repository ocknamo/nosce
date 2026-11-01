import { nip10, nip19 } from 'nostr-tools'
import { verifyEvent, type Event } from 'nostr-tools/pure'
import { db, type Incoming, type Post } from '../db'

const HEX64 = /^[0-9a-f]{64}$/

export function parseAccount(input: string): string {
  const text = input.trim()
  if (text.startsWith('nsec')) {
    throw new Error('nsecは秘密鍵です。入力せず、npubを使ってください。')
  }
  if (HEX64.test(text)) return text
  const decoded = (() => {
    try {
      return nip19.decode(text)
    } catch {
      throw new Error('npubの形式が正しくありません。')
    }
  })()
  if (decoded.type === 'npub') return decoded.data
  if (decoded.type === 'nprofile') return decoded.data.pubkey
  throw new Error('npubを入力してください。')
}

export function toPost(e: Event, source: Post['source']): Post {
  const refs = nip10.parse(e)
  return {
    id: e.id,
    pubkey: e.pubkey,
    created_at: e.created_at,
    content: e.content,
    source,
    replyTo: refs.reply?.id ?? refs.root?.id,
    mentions: e.tags.filter((t) => t[0] === 'p' && HEX64.test(t[1] ?? '')).map((t) => t[1]),
  }
}

export function toIncoming(e: Event): Incoming {
  const lastE = e.tags.filter((t) => t[0] === 'e').at(-1)?.[1]
  const target = e.kind === 1 ? nip10.parse(e).reply?.id ?? nip10.parse(e).root?.id : lastE
  return {
    id: e.id,
    kind: e.kind,
    pubkey: e.pubkey,
    created_at: e.created_at,
    target,
    content: e.kind === 1 ? e.content : undefined,
  }
}

export function parseFollows(e: Event): string[] {
  return [...new Set(e.tags.filter((t) => t[0] === 'p' && HEX64.test(t[1] ?? '')).map((t) => t[1]))]
}

export function displayName(e: Event): string | undefined {
  try {
    const meta = JSON.parse(e.content)
    const name = meta.display_name || meta.displayName || meta.name
    return typeof name === 'string' && name ? name : undefined
  } catch {
    return undefined
  }
}

export function newest(events: Event[]): Map<string, Event> {
  const map = new Map<string, Event>()
  for (const e of events) {
    const cur = map.get(e.pubkey)
    if (!cur || e.created_at > cur.created_at) map.set(e.pubkey, e)
  }
  return map
}

type SaveTarget = {
  // リレーが無関係な投稿を返しても混ざらないようにする判定
  accept: (e: Event) => boolean
  store: 'posts' | 'incoming'
  source?: Post['source']
}

// 検証は未保存の投稿だけに行う。同じ投稿を複数リレーから受け取るため、全件検証すると重い
export async function saveEvents(events: Event[], target: SaveTarget): Promise<number> {
  const table = target.store === 'posts' ? db.posts : db.incoming
  const ids = events.map((e) => e.id)
  const [existing, dead] = await Promise.all([table.bulkGet(ids), db.tombstones.bulkGet(ids)])
  const fresh = events.filter(
    (e, i) => !existing[i] && !(dead[i] && dead[i]!.pubkey === e.pubkey) && target.accept(e) && verifyEvent(e),
  )
  const deletions = fresh.filter((e) => e.kind === 5)
  const contents = fresh.filter((e) => e.kind !== 5)

  await db.transaction('rw', db.posts, db.incoming, db.tombstones, async () => {
    if (target.store === 'posts') {
      await db.posts.bulkPut(contents.map((e) => toPost(e, target.source ?? 'tl')))
    } else {
      await db.incoming.bulkPut(contents.map(toIncoming))
    }
    for (const d of deletions) {
      const targets = d.tags.filter((t) => t[0] === 'e' && t[1]).map((t) => t[1])
      await db.tombstones.bulkPut(targets.map((id) => ({ id, pubkey: d.pubkey })))
      const hit = await db.posts.bulkGet(targets)
      await db.posts.bulkDelete(hit.filter((p) => p?.pubkey === d.pubkey).map((p) => p!.id))
    }
  })
  return contents.length
}
