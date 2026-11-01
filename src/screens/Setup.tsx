import { useState } from 'react'
import { parseAccount } from '../nostr/events'

export function Setup({ onStart, onAbout }: { onStart: (pubkey: string) => void; onAbout: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    try {
      onStart(parseAccount(text))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="card setup">
      <h1>じぶん分析 for Nostr</h1>
      <p className="muted">自分の投稿とTLから、自分をネタにして遊ぶアプリです。必要なのはnpubだけです。</p>
      <div className="row">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="npub1..."
          aria-label="npub"
        />
        <button className="primary" onClick={submit}>
          取得を開始
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <p className="muted small setup-note">
        投稿はこのブラウザの中だけに保存します。
        <button className="link" onClick={onAbout}>
          データの扱いと注意事項
        </button>
      </p>
    </section>
  )
}
