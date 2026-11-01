import { AbstractRelay } from 'nostr-tools/abstract-relay'
import type { Event } from 'nostr-tools/pure'
import type { Filter } from 'nostr-tools/filter'

const TIMEOUT_MS = 20_000
const RETRY_WAIT_MS = [2_000, 6_000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class RelayPool {
  private conns = new Map<string, AbstractRelay>()

  private async connect(url: string) {
    const cur = this.conns.get(url)
    if (cur?.connected) return cur
    // 署名検証は未保存分だけ saveEvents で行う
    const relay = new AbstractRelay(url, { verifyEvent: () => true, enableReconnect: false })
    await relay.connect({ timeout: TIMEOUT_MS })
    this.conns.set(url, relay)
    return relay
  }

  // EOSEを受けたときだけ成功にする。失敗を空ページと区別しないと、読み切ったと誤認する
  private async once(url: string, filter: Filter): Promise<Event[]> {
    const relay = await this.connect(url)
    return new Promise((resolve, reject) => {
      const events: Event[] = []
      let settled = false
      let timer: ReturnType<typeof setTimeout>
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sub.close()
        fn()
      }
      const arm = () => {
        clearTimeout(timer)
        timer = setTimeout(() => finish(() => reject(new Error('timeout'))), TIMEOUT_MS)
      }
      const sub = relay.subscribe([filter], {
        eoseTimeout: TIMEOUT_MS * 10,
        onevent: (e) => {
          events.push(e)
          arm()
        },
        oneose: () => finish(() => resolve(events)),
        onclose: (reason) => finish(() => reject(new Error(reason))),
      })
      arm()
    })
  }

  async query(url: string, filter: Filter): Promise<Event[]> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.once(url, filter)
      } catch (err) {
        if (attempt >= RETRY_WAIT_MS.length) throw err
        await sleep(RETRY_WAIT_MS[attempt])
      }
    }
  }

  // プロフィール等の取得用。応答しないリレーは無視する
  async queryAny(urls: string[], filter: Filter): Promise<Event[]> {
    const pages = await Promise.allSettled(urls.map((u) => this.once(u, filter)))
    const byId = new Map<string, Event>()
    for (const p of pages) {
      if (p.status === 'fulfilled') for (const e of p.value) byId.set(e.id, e)
    }
    return [...byId.values()]
  }

  close() {
    for (const r of this.conns.values()) r.close()
    this.conns.clear()
  }
}
