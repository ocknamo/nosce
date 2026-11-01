import { hitRate, stripTags, tate } from '../analysis/result'
import type { Power, WordYear } from '../analysis/stats'
import type { AppraisalItem, Award, Dialogue, Drift } from '../db'
import { Fit, ScaledSheet, formatDate } from './sheet'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function Heatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat())
  return (
    <div className="heat" role="img" aria-label="曜日と時間帯ごとの投稿数">
      <span />
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} className="heat-h">
          {h % 6 === 0 ? h : ''}
        </span>
      ))}
      {data.map((row, d) => (
        <div key={d} className="heat-row">
          <span className="heat-d">{WEEK[d]}</span>
          {row.map((n, h) => (
            <i key={h} title={`${WEEK[d]} ${h}時: ${n}件`} style={{ opacity: n ? 0.15 + (n / max) * 0.85 : 0.05 }} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PowerSheet({ data, name }: { data: Power; name: string }) {
  const s = data.summary
  return (
    <ScaledSheet width={1000} className="rpg">
      <div className="rpg-top">
        <div className="rpg-win rpg-name">
          <b>{name}</b>
          <span>{data.title}</span>
        </div>
        <div className="rpg-win rpg-level">
          <span>レベル</span>
          <b>{data.level}</b>
        </div>
      </div>
      <div className="rpg-win">
        <h2>つよさ</h2>
        {data.stats.map((st) => (
          <div key={st.label} className="rpg-stat">
            <span>{st.label}</span>
            <div className="rpg-bar">
              <i style={{ width: `${(st.value / 999) * 100}%` }} />
            </div>
            <b>{st.value}</b>
            <small>{st.meaning}</small>
          </div>
        ))}
      </div>
      <div className="rpg-win">
        <h2>こうどうパターン</h2>
        <Heatmap data={s.heatmap} />
      </div>
      <div className="rpg-win rpg-log">
        <h2>ぼうけんのしょ</h2>
        <p>そうとうこうすう {s.total.toLocaleString()}</p>
        <p>1にちへいきん {s.perDay.toFixed(1)}</p>
        <p>さいちょうれんぞく {s.longestStreak}にち</p>
        <p>へんしんりつ {(s.replyRate * 100).toFixed(0)}%</p>
        <p>しんやりつ {(s.nightRate * 100).toFixed(0)}%</p>
        <p>かつどうにっすう {s.activeDays.toLocaleString()}</p>
      </div>
    </ScaledSheet>
  )
}

export function WordsSheet({ data, name }: { data: WordYear[]; name: string }) {
  const years = [...data].reverse().filter((y) => y.words.length)
  return (
    <ScaledSheet width={1000} className="award-show">
      <header>
        <small>{name} 選出</small>
        <h1>My流行語大賞</h1>
      </header>
      {years.map((y) => (
        <section key={y.year} className="as-year">
          <div className="as-grand">
            <span>{y.year}年 年間大賞</span>
            <b>{y.words[0].word}</b>
            <small>{y.words[0].count.toLocaleString()}回</small>
          </div>
          <ol start={2}>
            {y.words.slice(1, 10).map((w) => (
              <li key={w.word}>
                {w.word} <small>{w.count.toLocaleString()}回</small>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </ScaledSheet>
  )
}

export function AwardSheet({ award, name, createdAt }: { award: Award; name: string; createdAt: number }) {
  return (
    <ScaledSheet width={1000} className="certificate">
      <div className="c-frame">
        <div className="c-body">
          <h1>賞状</h1>
          <p className="c-name">{tate(name)} 殿</p>
          <p className="c-title">{tate(award.title)}</p>
          <Fit className="c-text" max={28} min={16}>
            {tate(award.citation)}
          </Fit>
          <p className="c-date">{tate(formatDate(createdAt))}</p>
          <p className="c-issuer">Ｎｏｓｔｒ二つ名審議会　会長</p>
        </div>
        <span className="seal c-seal">審議会印</span>
      </div>
      <footer className="c-runners">
        <h4>次点</h4>
        {award.runnersUp.slice(0, 3).map((r) => (
          <p key={r.name}>
            <b>{stripTags(r.name)}</b> {stripTags(r.reason)}
          </p>
        ))}
      </footer>
    </ScaledSheet>
  )
}

function Examples({ title, items }: { title: string; items: Drift['ownExamples'] }) {
  return (
    <div>
      <h4>{title}</h4>
      {items.slice(0, 2).map((e, i) => (
        <p key={i}>「{stripTags(e.quote)}」</p>
      ))}
    </div>
  )
}

export function DriftSheet({ drift, name, createdAt }: { drift: Drift; name: string; createdAt: number }) {
  const score = Math.max(0, Math.min(100, Math.round(drift.score)))
  return (
    <ScaledSheet width={1000} className="chart-doc">
      <header>
        <h1>診 断 書</h1>
        <span>カルテ番号 {String(createdAt).slice(-6)}</span>
      </header>
      <table>
        <tbody>
          <tr>
            <th>受診者</th>
            <td>{name} 様</td>
            <th>検査日</th>
            <td>{formatDate(createdAt)}</td>
          </tr>
          <tr>
            <th>病名</th>
            <td colSpan={3} className="d-verdict">
              {stripTags(drift.verdict)}
            </td>
          </tr>
        </tbody>
      </table>
      <section className="d-result">
        <h4>TL流され度</h4>
        <b>
          {score}
          <small>%</small>
        </b>
        <div className="d-gauge">
          <i style={{ left: `${score}%` }} />
        </div>
        <div className="d-scale">
          <span>自律</span>
          <span>基準値</span>
          <span>重度</span>
        </div>
      </section>
      <table className="d-count">
        <thead>
          <tr>
            <th>流された投稿</th>
            <th>自分発の投稿</th>
            <th>判定不能</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{drift.flowed}件</td>
            <td>{drift.own}件</td>
            <td>{drift.neutral}件</td>
          </tr>
        </tbody>
      </table>
      <section className="d-notes">
        <h4>所見</h4>
        <p>{stripTags(drift.comment)}</p>
      </section>
      <section className="d-examples">
        <Examples title="主な症例" items={drift.flowedExamples} />
        <Examples title="自律の兆候" items={drift.ownExamples} />
      </section>
      <footer>
        <p>上記の通り診断します。</p>
        <p>{formatDate(createdAt)}</p>
        <p>ノストル総合病院 TL内科</p>
        <p>主治医 人工知能</p>
        <span className="seal">TL内科</span>
      </footer>
    </ScaledSheet>
  )
}

// 昔の私は殻を破ったばかりのヒナ、今の私は同じヒナが丸めがねと蝶ネクタイで大人になった姿にする
function PastIcon() {
  return (
    <svg className="m-icon" viewBox="0 0 64 64" role="img" aria-label="昔の私">
      <circle cx="32" cy="34" r="23" fill="#ffdb6e" />
      <path d="M32 11c-1-6 3-8 5-7-3 1-3 4-2 7m-3 0c-3-4-1-7 1-8" fill="none" stroke="#e9a93a" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M9 41l8 5 7-6 8 6 8-6 7 6 8-5c1 12-9 20-23 20S8 53 9 41z" fill="#fffaf0" stroke="#e7dcc4" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="22" cy="29" r="4.5" fill="#3b2a1a" />
      <circle cx="42" cy="29" r="4.5" fill="#3b2a1a" />
      <circle cx="23.5" cy="27.5" r="1.6" fill="#fff" />
      <circle cx="43.5" cy="27.5" r="1.6" fill="#fff" />
      <ellipse cx="15" cy="36" rx="4.5" ry="3" fill="#ffaaa0" />
      <ellipse cx="49" cy="36" rx="4.5" ry="3" fill="#ffaaa0" />
      <path d="M27 34h10l-5 6z" fill="#ff9d3c" strokeLinejoin="round" stroke="#ff9d3c" strokeWidth="2" />
    </svg>
  )
}

function NowIcon() {
  return (
    <svg className="m-icon" viewBox="0 0 64 64" role="img" aria-label="今の私">
      <path d="M32 11c-3-5-1-9 2-9 0 2 1 3 3 3-1 2-1 3 0 4 2-1 4-1 5 1-4 0-7 0-10 1z" fill="#f3a03b" />
      <circle cx="32" cy="33" r="25" fill="#ffc15e" />
      <ellipse cx="9" cy="39" rx="4.5" ry="9" fill="#f3a03b" transform="rotate(14 9 39)" />
      <ellipse cx="55" cy="39" rx="4.5" ry="9" fill="#f3a03b" transform="rotate(-14 55 39)" />
      <circle cx="21" cy="27" r="3.8" fill="#3b2a1a" />
      <circle cx="43" cy="27" r="3.8" fill="#3b2a1a" />
      <circle cx="22.2" cy="25.8" r="1.3" fill="#fff" />
      <circle cx="44.2" cy="25.8" r="1.3" fill="#fff" />
      <circle cx="21" cy="27" r="8.5" fill="none" stroke="#6b4a2b" strokeWidth="2" />
      <circle cx="43" cy="27" r="8.5" fill="none" stroke="#6b4a2b" strokeWidth="2" />
      <path d="M29.5 27h5" stroke="#6b4a2b" strokeWidth="2" />
      <ellipse cx="13" cy="38" rx="4" ry="2.6" fill="#ff9f8f" />
      <ellipse cx="51" cy="38" rx="4" ry="2.6" fill="#ff9f8f" />
      <path d="M27 33h10l-5 6z" fill="#f2792b" strokeLinejoin="round" stroke="#f2792b" strokeWidth="2" />
      <path d="M32 50l-9-5v10zM32 50l9-5v10z" fill="#d94f5c" strokeLinejoin="round" stroke="#d94f5c" strokeWidth="2" />
      <circle cx="32" cy="50" r="2.6" fill="#b83a48" />
    </svg>
  )
}

export function DialogueSheet({ dialogue, name }: { dialogue: Dialogue; name: string }) {
  return (
    <ScaledSheet width={1000} className="magazine">
      <header>
        <span>特別対談</span>
        <PastIcon />
        <p>昔の{name}</p>
        <i>×</i>
        <NowIcon />
        <p>今の{name}</p>
      </header>
      <h1>{stripTags(dialogue.title)}</h1>
      <p className="m-lead">{stripTags(dialogue.lead)}</p>
      <div className="m-talk">
        {dialogue.lines.map((line, i) => (
          <div key={i} className="m-line">
            {line.speaker === 'past' ? <PastIcon /> : <NowIcon />}
            <p>{stripTags(line.text)}</p>
          </div>
        ))}
      </div>
      <footer>{stripTags(dialogue.closing)}</footer>
    </ScaledSheet>
  )
}

const MARK: Record<AppraisalItem['confidence'], string> = { 高: '◎', 中: '○', 低: '△', 不明: '−' }

export function AppraisalSheet({ items, name, createdAt }: { items: AppraisalItem[]; name: string; createdAt: number }) {
  const { hits, checked } = hitRate(items)
  return (
    <ScaledSheet width={1000} className="appraisal-doc">
      <div className="a-frame">
        <h1>鑑 定 書</h1>
        <p className="a-no">鑑定番号 第{String(createdAt).slice(-7)}号</p>
        <p className="a-to">依頼者 {name} 殿</p>
        <table>
          <thead>
            <tr>
              <th>鑑定項目</th>
              <th>鑑定結果</th>
              <th>確度</th>
              <th>所見</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.label}>
                <th>{item.label}</th>
                <td className="a-value">{stripTags(item.value)}</td>
                <td className="a-mark">{MARK[item.confidence]}</td>
                <td className="a-reason">{stripTags(item.reason)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>上記の通り鑑定いたします。</p>
        <footer>
          <div>
            <p>{formatDate(createdAt)}</p>
            <p>Nostr鑑定協会 主任鑑定士</p>
            {checked > 0 && (
              <p>
                依頼者確認済 的中 {hits}/{checked}
              </p>
            )}
          </div>
          <span className="seal">鑑定</span>
        </footer>
      </div>
    </ScaledSheet>
  )
}
