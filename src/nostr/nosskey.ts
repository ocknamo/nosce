import { NosskeyIframeClient, NosskeyIframeError } from 'nosskey-iframe'
import type { Event } from 'nostr-tools/pure'
import type { Signer } from './identity'

// パスキーから鍵を作る Nosskey の署名画面。nosskey.app の iframe を通して NIP-07 と同じ形で使う
// 手順は https://nosskey.app/llms.txt の案内に合わせている
export const NOSSKEY_URL = 'https://nosskey.app'
const IFRAME_URL = `${NOSSKEY_URL}/#/iframe`
// ready() には時間切れがない。nosskey.app 側で保存領域の確認に最大5秒かかるので、読み込みも含めて待つ
const READY_TIMEOUT_MS = 15_000

let clientPromise: Promise<NosskeyIframeClient> | null = null

// 押されたときに初めて作り、ページを閉じるまで使い回す。作り直すとストレージの許可が消えて、もう一度聞かれる
export function getNosskeyClient() {
  clientPromise ??= createClient().catch((err) => {
    clientPromise = null
    throw err
  })
  return clientPromise
}

async function createClient() {
  const overlay = document.createElement('div')
  overlay.className = 'nosskey-overlay'
  // iframe の中は透明なので、背景色とテーマを合わせる。テーマは読み込み時にしか反映されない
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  if (dark) overlay.classList.add('dark')
  document.body.appendChild(overlay)

  const client = new NosskeyIframeClient({
    iframeUrl: IFRAME_URL,
    container: overlay,
    theme: dark ? 'neutral-dark' : 'neutral-light',
    lang: 'ja',
  })

  // 表示の切り替えは iframe の style.display で届くので、背景の暗幕をそれに合わせる
  const observer = new MutationObserver(() => {
    overlay.classList.toggle('visible', client.iframe.style.display !== 'none')
  })
  observer.observe(client.iframe, { attributes: true, attributeFilter: ['style'] })

  try {
    await withTimeout(client.ready(), READY_TIMEOUT_MS)
    return client
  } catch (err) {
    observer.disconnect()
    client.destroy()
    overlay.remove()
    throw err
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Nosskeyの画面を読み込めませんでした。通信状況を確かめてください。')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

export async function nosskeySigner(): Promise<Signer> {
  const client = await getNosskeyClient()
  return {
    getPublicKey: () => client.getPublicKey(),
    // pubkey、id、sig を渡すとそのまま残されるので、署名前の形だけを渡す。届いた署名は identify で検証する
    signEvent: async ({ kind, created_at, tags, content }) =>
      (await client.signEvent({ kind, created_at, tags, content })) as Event,
  }
}

export function explainNosskeyError(err: unknown): { message: string; needKey: boolean } | null {
  if (err instanceof NosskeyIframeError) {
    switch (err.code) {
      case 'NO_KEY':
        return { message: 'Nosskeyのパスキーが見つかりません。nosskey.appでパスキーを作ってから、もう一度試してください。', needKey: true }
      case 'USER_REJECTED':
        return { message: 'Nosskeyで拒否されました。', needKey: false }
      case 'RATE_LIMITED':
        return { message: '失敗が続いたため、しばらく使えません。1分ほど待ってから試してください。', needKey: false }
    }
    return null
  }
  // パスキーの取り消しは INTERNAL で届き、そちらも timed out を含むことがあるので、時間切れは前方一致で見分ける
  if (err instanceof Error && err.message.startsWith('Nosskey iframe request timed out')) {
    return { message: '時間切れになりました。nosskey.appの画面が開いたままなら閉じてから、もう一度試してください。', needKey: false }
  }
  return null
}
