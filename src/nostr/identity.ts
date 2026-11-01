import { verifyEvent, type Event, type EventTemplate } from 'nostr-tools/pure'

export type Signer = { signEvent: (event: EventTemplate) => Promise<Event> }

declare global {
  interface Window {
    nostr?: Signer
  }
}

// NIP-42 の認証用 kind。署名はここで確かめるだけで、リレーには送らない
const AUTH_KIND = 22242

export async function proveOwnership(pubkey: string, signer: Signer) {
  const challenge = crypto.randomUUID()
  const event = await signer.signEvent({
    kind: AUTH_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', challenge]],
    content: 'じぶん分析 for Nostr の本人確認',
  })
  const answered = event.tags.some((t) => t[0] === 'challenge' && t[1] === challenge)
  return answered && event.kind === AUTH_KIND && event.pubkey === pubkey && verifyEvent(event)
}
