import { useEffect, useRef, useState } from 'react'
import { identify, type Signer } from '../nostr/identity'
import { explainNosskeyError, nosskeySigner, NOSSKEY_URL } from '../nostr/nosskey'
import { connectBunker, createConnectRequest, waitForSigner } from '../nostr/remoteSigner'

const NOT_OWNER = 'このアカウントの鍵で署名してください。'

export function SignerLogin({ expected, onDone }: { expected?: string; onDone: (pubkey: string) => void }) {
  const [connectUri, setConnectUri] = useState('')
  const [bunker, setBunker] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [needKey, setNeedKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => () => abort.current?.abort(), [])

  const finish = async (signer: Signer) => {
    setBusy('署名を承認してください…')
    const pubkey = await identify(signer, expected)
    if (pubkey) onDone(pubkey)
    else setError(NOT_OWNER)
  }

  const run = async (start: () => Promise<void>) => {
    setError('')
    setNeedKey(false)
    try {
      await start()
    } catch (err) {
      if (abort.current?.signal.aborted) return
      const nosskey = explainNosskeyError(err)
      if (nosskey) {
        setError(nosskey.message)
        setNeedKey(nosskey.needKey)
        return
      }
      setError(err instanceof Error && /[ぁ-ん]/.test(err.message) ? err.message : '確認できませんでした。もう一度試してください。')
    } finally {
      setBusy('')
    }
  }

  const useExtension = () =>
    run(async () => {
      if (!window.nostr) throw new Error('NIP-07対応の拡張機能が見つかりません。')
      await finish(window.nostr)
    })

  // iframe はページを閉じるまで残す(作り直すとストレージの許可を聞き直すことになる)
  // 二度押しで承認画面を重ねて出さない
  const passkeyRunning = useRef(false)
  const usePasskey = async () => {
    if (passkeyRunning.current) return
    passkeyRunning.current = true
    await run(async () => {
      setBusy('nosskey.appの画面で承認してください…')
      await finish(await nosskeySigner())
    })
    passkeyRunning.current = false
  }

  const useApp = () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const request = createConnectRequest()
    setConnectUri(request.uri)
    void run(async () => {
      setBusy('署名アプリの接続を待っています…')
      const signer = await waitForSigner(request, controller.signal)
      await finish(signer)
      await signer.close()
    })
  }

  const useBunker = () =>
    run(async () => {
      setBusy('接続しています…')
      const signer = await connectBunker(bunker)
      await finish(signer)
      await signer.close()
    })

  const copy = async () => {
    await navigator.clipboard.writeText(connectUri)
    setCopied(true)
  }

  return (
    <div className="signer">
      <div className="row wrap">
        <button className="primary" onClick={useExtension}>
          拡張機能で確認
        </button>
        <button onClick={useApp}>署名アプリで確認</button>
        <button onClick={usePasskey}>パスキーで確認</button>
      </div>
      <p className="muted small">
        パソコンはNIP-07の拡張機能、スマホはAmberなどの署名アプリが使えます。パスキーは nosskey.app に保存したもの(Nosskey)を使います。
      </p>

      {connectUri && (
        <div className="signer-connect">
          <a className="signer-open" href={connectUri}>
            署名アプリを開く
          </a>
          <button onClick={copy}>{copied ? 'コピーしました' : '接続用の文字列をコピー'}</button>
          <p className="muted small">アプリで承認したら、この画面に戻ってください。</p>
        </div>
      )}

      <details>
        <summary className="muted small">bunker:// で接続する</summary>
        <div className="row">
          <input
            value={bunker}
            onChange={(e) => setBunker(e.target.value)}
            placeholder="bunker://..."
            aria-label="bunker接続文字列"
            autoComplete="off"
          />
          <button onClick={useBunker}>接続</button>
        </div>
      </details>

      {busy && <p className="small">{busy}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
          {needKey && (
            <>
              {' '}
              <a href={NOSSKEY_URL} target="_blank" rel="noopener noreferrer">
                nosskey.appを開く
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
