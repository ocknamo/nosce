import type { SyncState } from '../App'
import type { Phase } from '../nostr/sync'

const LABELS: [Phase, string][] = [
  ['discovery', 'フォローとプロフィール'],
  ['me', '自分の投稿'],
  ['incoming', '自分への反応'],
  ['tl', 'TL'],
]

export function SyncPanel({ sync }: { sync: SyncState }) {
  return (
    <div className="sync">
      {LABELS.map(([phase, label]) => {
        const p = sync.phases[phase]
        return (
          <div key={phase}>
            <div className="sync-line">
              <span>{label}</span>
              <span className="muted">
                {!p
                  ? '待機中'
                  : phase === 'discovery'
                    ? `${p.count}人`
                    : `${p.count.toLocaleString()}件追加 ・ ${(p.scanned ?? 0).toLocaleString()}件確認 ・ リレー ${p.jobsDone ?? 0}/${p.jobs ?? 0}`}
              </span>
            </div>
            <div className="bar">
              <i style={{ width: `${Math.round((p?.ratio ?? 0) * 100)}%` }} />
            </div>
          </div>
        )
      })}
      <p className="muted small">閉じても次回は続きから取得します。取得中も、集まった分は分析できます。</p>
    </div>
  )
}
