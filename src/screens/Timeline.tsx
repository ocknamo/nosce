import { useEffect, useMemo, useRef, useState } from 'react'
import { db, postsInRange, profileNames, type Post } from '../db'
import { clip, formatTime } from '../analysis/prompt'

const AROUND = 1800

const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime() / 1000

export function Timeline({ focus }: { focus?: string }) {
  const [date, setDate] = useState(formatTime(Date.now() / 1000).slice(0, 10))
  const [posts, setPosts] = useState<Post[]>([])
  const [names, setNames] = useState(new Map<string, string>())
  const [onlyAround, setOnlyAround] = useState(true)
  const [target, setTarget] = useState(focus)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Post[]>([])
  const focused = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void profileNames().then(setNames)
    void (async () => {
      const start = target ? (await db.posts.get(target))?.created_at : undefined
      if (start) {
        setDate(formatTime(start).slice(0, 10))
        setOnlyAround(false)
        return
      }
      // 開いたときは、自分が最後に投稿した日を表示する
      const last = await db.posts.where('[source+created_at]').between(['me', 0], ['me', Infinity]).last()
      if (last) setDate(formatTime(last.created_at).slice(0, 10))
    })()
  }, [target])

  useEffect(() => {
    const start = dayStart(date)
    if (Number.isNaN(start)) return
    const end = start + 86399
    void Promise.all([postsInRange('me', start, end), postsInRange('tl', start, end)]).then(([me, tl]) =>
      setPosts([...me, ...tl].sort((a, b) => a.created_at - b.created_at)),
    )
  }, [date])

  useEffect(() => {
    focused.current?.scrollIntoView({ block: 'center' })
  }, [posts, onlyAround])

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      void db.posts
        .where('[source+created_at]')
        .between(['me', 0], ['me', Infinity])
        .reverse()
        .filter((p) => p.content.toLowerCase().includes(q))
        .limit(30)
        .toArray()
        .then(setHits)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const rows = useMemo(() => {
    if (!onlyAround) return posts
    const mine = posts.filter((p) => p.source === 'me').map((p) => p.created_at)
    if (!mine.length) return posts
    return posts.filter((p) => p.source === 'me' || mine.some((t) => p.created_at >= t - AROUND && p.created_at <= t + AROUND))
  }, [posts, onlyAround])

  return (
    <section className="card">
      <div className="row wrap">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="日付" className="date" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="自分の投稿を検索" aria-label="検索" />
        <label className="check">
          <input type="checkbox" checked={onlyAround} onChange={(e) => setOnlyAround(e.target.checked)} />
          自分の前後30分だけ
        </label>
      </div>

      {hits.length > 0 && (
        <div className="list hits">
          {hits.map((p) => (
            <button
              key={p.id}
              className="list-row"
              onClick={() => {
                setTarget(p.id)
                setQuery('')
              }}
            >
              <span>{clip(p.content)}</span>
              <span className="muted small">{formatTime(p.created_at).slice(0, 10)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="tl-head">
        <span />
        <span>自分</span>
        <span>その時のTL</span>
      </div>
      {!rows.length && <p className="muted">この日の投稿はありません。TLは直近の分だけ取得しています。</p>}
      {rows.map((p) => (
        <div key={p.id} className={p.id === target ? 'tl-row focus' : 'tl-row'} ref={p.id === target ? focused : undefined}>
          <span className="muted small">{formatTime(p.created_at).slice(11)}</span>
          {p.source === 'me' ? (
            <>
              <span className="mine">{p.content}</span>
              <span />
            </>
          ) : (
            <>
              <span />
              <span className="other">
                <b>{names.get(p.pubkey) ?? p.pubkey.slice(0, 8)}</b> {p.content}
              </span>
            </>
          )}
        </div>
      ))}
    </section>
  )
}
