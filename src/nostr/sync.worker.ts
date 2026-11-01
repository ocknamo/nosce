import { runSync, type SyncConfig } from './sync'

// 署名検証が重いので、画面が固まらないようワーカーで取得する
self.onmessage = async (ev: MessageEvent<SyncConfig>) => {
  try {
    const { failed } = await runSync(ev.data, (progress) => self.postMessage({ type: 'progress', progress }))
    self.postMessage({ type: 'done', failed })
  } catch (err) {
    self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
