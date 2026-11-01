import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { tate } from '../analysis/result'
import type { NewspaperMeta, Paper } from '../db'
import { Fit, ScaledSheet } from './sheet'

const PAPER_WIDTH = 1240

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

// .p-text の文字組みと合わせる。文字は固定し、段の字数と段数を本文の長さから決めて紙面を埋める
const FONT = 16
const LINE = FONT * 1.35
const ROW_GAP = 18
const MIN_CHARS = 11
const MAX_CHARS = 16
// 禁則処理で行末が空く分
const SLACK = 1.06

const LEAD_WIDTH = 984
const ARTICLES_WIDTH = 870
const COLUMN_WIDTH = 430

function layoutFor(length: number, width: number, minChars: number, maxChars: number) {
  const lines = Math.floor(width / LINE)
  const needed = length * SLACK
  const rows = Math.max(1, Math.ceil(needed / (lines * maxChars)))
  return { rows, chars: Math.max(minChars, Math.ceil(needed / (rows * lines))) }
}

// 収まらなかったら1段の字数を増やす。字数は減らさないので、1行が MIN_CHARS を下回らない
function useRowLayout(length: number, width: number, minChars = MIN_CHARS, maxChars = MAX_CHARS) {
  const box = useRef<HTMLDivElement>(null)
  const start = layoutFor(length, width, minChars, maxChars)
  const [chars, setChars] = useState(start.chars)

  useLayoutEffect(() => {
    const over = [...box.current!.querySelectorAll('.p-text')].some((e) => e.scrollHeight > e.clientHeight + 1)
    if (over) setChars((c) => c + 1)
  }, [chars])

  const style: CSSProperties = {
    columnCount: start.rows,
    height: start.rows * chars * FONT + (start.rows - 1) * ROW_GAP,
  }
  return { box, style }
}

function Bars({ daily }: { daily: NewspaperMeta['daily'] }) {
  const top = Math.max(1, ...daily.map((d) => d.count))
  return (
    <div className="p-chart">
      <h4>今週の投稿数</h4>
      <div className="p-bars">
        {daily.map((d, i) => (
          <div key={i}>
            <span>{d.count}</span>
            <i style={{ height: `${(d.count / top) * 100}px` }} />
            <span>{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Newspaper({ paper, issueNo, daily, createdAt }: { paper: Paper; createdAt: number } & NewspaperMeta) {
  const articles = paper.articles.slice(0, 3).map((a) => ({ ...a, text: tate(a.body), heading: tate(a.title) }))
  const lead = tate(paper.lead)
  const column = tate(paper.column.body)
  const articleChars = articles.reduce((sum, a) => sum + a.text.length, 0)

  const leadLayout = useRowLayout(lead.length, LEAD_WIDTH, 12)
  const articleLayout = useRowLayout(articleChars, ARTICLES_WIDTH)
  // 下段はグラフと高さをそろえるため、1段を長めにする
  const columnLayout = useRowLayout(column.length, COLUMN_WIDTH, 18, 24)

  const d = new Date(createdAt)
  return (
    <ScaledSheet width={PAPER_WIDTH} className="paper">
        <header className="p-mast">
          <h1>じぶん新聞</h1>
          <div className="p-imprint">
            <b>週刊</b>
            <span>{d.getFullYear()}年{d.getMonth() + 1}月{d.getDate()}日</span>
            <span>{WEEK[d.getDay()]}曜日</span>
            <span>第{issueNo.toLocaleString()}号</span>
            <span>発行所 Nostr支局</span>
            <span>定価 0sats</span>
          </div>
        </header>

        <section className="p-top">
          <Fit className="p-headline" max={118} min={56}>
            {paper.headline}
          </Fit>
          <p className="p-subhead">{paper.subhead}</p>
          <div ref={leadLayout.box}>
            <div className="p-text" style={leadLayout.style}>
              {lead}
            </div>
          </div>
        </section>

        <section ref={articleLayout.box} className="p-articles">
          {articles.map((a, i) => (
            <div key={i} className="p-article">
              <span className="p-section">{a.section}</span>
              <h3>{a.heading}</h3>
              {/* 記事の長さに応じて幅を配り、どの記事も同じ段数で埋まるようにする */}
              <div
                className="p-text"
                style={{ ...articleLayout.style, width: Math.round((ARTICLES_WIDTH * a.text.length) / articleChars) }}
              >
                {a.text}
              </div>
            </div>
          ))}
        </section>

        <footer className="p-bottom">
          <div ref={columnLayout.box} className="p-column">
            <h3>{tate(paper.column.title)}</h3>
            <div className="p-text" style={columnLayout.style}>
              {column}
            </div>
          </div>
          <Bars daily={daily} />
          <div className="p-side">
            <h4>じぶんの天気</h4>
            <Fit className="p-small" max={15} min={10}>
              {paper.weather}
            </Fit>
            <h4>読者の声</h4>
            <Fit className="p-small" max={14} min={10}>
              {paper.letter.body}
              <small>{paper.letter.from}</small>
            </Fit>
          </div>
        </footer>
    </ScaledSheet>
  )
}
