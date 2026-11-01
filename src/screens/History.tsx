import { useEffect, useState } from 'react'
import { db, type SavedResult } from '../db'
import { formatTime } from '../analysis/prompt'
import type { Route } from '../App'

export function History({ go }: { go: (r: Route) => void }) {
  const [rows, setRows] = useState<SavedResult[]>()

  useEffect(() => {
    void db.results.orderBy('createdAt').reverse().toArray().then(setRows)
  }, [])

  if (!rows) return null
  if (!rows.length) {
    return (
      <section className="card">
        <h2>分析の履歴</h2>
        <p className="muted">ホームでプリセットを実行すると、ここに残ります。</p>
      </section>
    )
  }
  return (
    <section className="card list">
      {rows.map((r) => (
        <button key={r.id} className="list-row" onClick={() => go({ name: 'result', id: r.id! })}>
          <span>{r.title}</span>
          <span className="muted small">{formatTime(r.createdAt / 1000)}</span>
        </button>
      ))}
    </section>
  )
}
