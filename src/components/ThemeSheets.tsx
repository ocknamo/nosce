import { stripTags, tate } from '../analysis/result'
import { ScaledSheet, formatDate } from './sheet'

// 紙面ごとの中身の形はAIへの依頼側のスキーマで決めている
type Props = { data: any; name: string; createdAt: number }

const c = stripTags

function Ingredients({ data, name }: Props) {
  return (
    <ScaledSheet width={800} className="th-label">
      <h1>{c(data.productName)}</h1>
      <table>
        <tbody>
          <tr>
            <th>名称</th>
            <td>{name}</td>
          </tr>
          <tr>
            <th>原材料名</th>
            <td>{data.items.map((i: any) => c(i.name)).join('、')}</td>
          </tr>
          <tr>
            <th>内容量</th>
            <td>1アカウント</td>
          </tr>
          <tr>
            <th>保存方法</th>
            <td>直射日光と炎上を避けて保存してください</td>
          </tr>
        </tbody>
      </table>
      <section className="l-facts">
        <h2>成分表示</h2>
        {data.items.map((i: any) => (
          <div key={i.name}>
            <span>{c(i.name)}</span>
            <i style={{ width: `${Math.min(i.percent, 100)}%` }} />
            <b>{i.percent}%</b>
          </div>
        ))}
      </section>
      <p className="l-allergen">
        <b>特定原材料:</b> {data.allergens.map(c).join('、')}
      </p>
      <p className="l-note">{c(data.note)}</p>
    </ScaledSheet>
  )
}

function Dig({ data, createdAt }: Props) {
  return (
    <ScaledSheet width={1000} className="th-dig">
      <header>
        <small>発掘調査報告書 第1集</small>
        <h1>{c(data.site)}</h1>
        <p>
          調査対象 {c(data.period)} ・ 報告 {formatDate(createdAt)}
        </p>
      </header>
      <section>
        <h2>第1章 調査の概要</h2>
        <p>{c(data.summary)}</p>
      </section>
      <section>
        <h2>第2章 出土遺物</h2>
        <div className="d-finds">
          {data.finds.slice(0, 4).map((f: any, i: number) => (
            <article key={i}>
              <h3>
                遺物{i + 1} {c(f.name)}
              </h3>
              <small>{c(f.era)}</small>
              <blockquote>{c(f.quote)}</blockquote>
              <p>{c(f.note)}</p>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>第3章 結論</h2>
        <p>{c(data.conclusion)}</p>
      </section>
    </ScaledSheet>
  )
}

function History({ data, name }: Props) {
  return (
    <ScaledSheet width={1000} className="th-history">
      <h1>{name}の歴史</h1>
      <p className="h-sub">教科書 第1章 Nostrの時代</p>
      <div className="h-line">
        {data.eras.map((e: any, i: number) => (
          <article key={i}>
            <span>{c(e.period)}</span>
            <div>
              <h2>{c(e.name)}</h2>
              <p>{c(e.summary)}</p>
              <p className="h-event">できごと: {c(e.event)}</p>
            </div>
          </article>
        ))}
      </div>
    </ScaledSheet>
  )
}

function Omikuji({ data, name }: Props) {
  return (
    <ScaledSheet width={560} className="th-omikuji">
      <p className="o-head">第{(name.length * 7) % 90 || 8}番 おみくじ</p>
      <h1>{tate(data.fortune)}</h1>
      <div className="o-body">
        <p className="o-waka">{tate(data.waka)}</p>
        <div className="o-items">
          {data.items.map((i: any) => (
            <p key={i.label}>
              <b>{tate(i.label)}</b> {tate(i.text)}
            </p>
          ))}
        </div>
        <p className="o-advice">{tate(data.advice)}</p>
      </div>
    </ScaledSheet>
  )
}

function Pyre({ data, createdAt }: Props) {
  return (
    <ScaledSheet width={800} className="th-pyre">
      <div className="p2-tablet">
        <small>{tate('不遇投稿之霊位')}</small>
        <h1>{tate(data.posthumous)}</h1>
        <small>{tate(formatDate(createdAt))}</small>
      </div>
      <section>
        <h2>ご法話</h2>
        <p>{c(data.sermon)}</p>
        <h2>供養された投稿</h2>
        {data.items.slice(0, 3).map((i: any, n: number) => (
          <div key={n} className="p2-item">
            <blockquote>{c(i.quote)}</blockquote>
            <p>{c(i.review)}</p>
          </div>
        ))}
        <span className="seal">南無</span>
      </section>
    </ScaledSheet>
  )
}

function Manual({ data, name }: Props) {
  return (
    <ScaledSheet width={1000} className="th-manual">
      <header>
        <span>取扱説明書</span>
        <h1>{name}</h1>
        <p>型番 {c(data.model)}</p>
      </header>
      <p className="m2-intro">{c(data.intro)}</p>
      <div className="m2-warning">
        <b>警告</b>
        {data.warning.map((w: string) => (
          <p key={w}>{c(w)}</p>
        ))}
      </div>
      <h2>仕様</h2>
      <table>
        <tbody>
          {data.spec.map((s: any) => (
            <tr key={s.label}>
              <th>{c(s.label)}</th>
              <td>{c(s.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>正しいお手入れ</h2>
      <ol>
        {data.care.map((t: string) => (
          <li key={t}>{c(t)}</li>
        ))}
      </ol>
      <h2>故障かな?と思ったら</h2>
      <table>
        <thead>
          <tr>
            <th>症状</th>
            <th>原因</th>
            <th>対処</th>
          </tr>
        </thead>
        <tbody>
          {data.trouble.map((t: any) => (
            <tr key={t.symptom}>
              <td>{c(t.symptom)}</td>
              <td>{c(t.cause)}</td>
              <td>{c(t.fix)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScaledSheet>
  )
}

const SPEAKER: Record<string, string> = { day: '昼の私', night: '深夜の私', judge: '裁判長' }

function Court({ data, createdAt }: Props) {
  return (
    <ScaledSheet width={1000} className="th-court">
      <header>
        <p>{formatDate(createdAt)} 判決言渡</p>
        <h1>判 決 書</h1>
        <p>{c(data.caseName)}</p>
      </header>
      <h2>請求の趣旨</h2>
      <p>{c(data.claim)}</p>
      <h2>口頭弁論の記録</h2>
      <div className="c2-talk">
        {data.lines.map((l: any, i: number) => (
          <p key={i}>
            <b className={l.speaker}>{SPEAKER[l.speaker]}</b>
            <span>{c(l.text)}</span>
          </p>
        ))}
      </div>
      <div className="c2-verdict">
        <h2>主文</h2>
        <p>{c(data.verdict)}</p>
      </div>
      <h2>理由</h2>
      <p>{c(data.reason)}</p>
      <footer>
        Nostr地方裁判所 第一民事部 <span className="seal">裁判所</span>
      </footer>
    </ScaledSheet>
  )
}

function Bot({ data }: Props) {
  return (
    <ScaledSheet width={1000} className="th-bot">
      <small>NEW RELEASE</small>
      <h1>{c(data.productName)}</h1>
      <p className="b-tag">{c(data.tagline)}</p>
      <div className="b-grid">
        {data.specs.map((s: any) => (
          <div key={s.label}>
            <small>{c(s.label)}</small>
            <b>{c(s.value)}</b>
          </div>
        ))}
      </div>
      <h2>学習した文体</h2>
      <ul>
        {data.tone.map((t: string) => (
          <li key={t}>{c(t)}</li>
        ))}
      </ul>
      <h2>次に言いそうなこと</h2>
      {data.predictions.map((t: string) => (
        <p key={t} className="b-chat">
          {c(t)}
        </p>
      ))}
    </ScaledSheet>
  )
}

function Encyclopedia({ data, name }: Props) {
  return (
    <ScaledSheet width={1000} className="th-encyclopedia">
      <h1>{name}</h1>
      <p className="e-from">出典: じぶん百科事典</p>
      <aside>
        <h3>{name}</h3>
        <table>
          <tbody>
            {data.infobox.map((i: any) => (
              <tr key={i.label}>
                <th>{c(i.label)}</th>
                <td>{c(i.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>
      <p>
        <b>{name}</b>は、{c(data.summary)}
      </p>
      {data.sections.map((s: any) => (
        <section key={s.heading}>
          <h2>{c(s.heading)}</h2>
          <p>{c(s.body)}</p>
        </section>
      ))}
      <h2>関連項目</h2>
      <ul>
        {data.related.map((r: string) => (
          <li key={r}>{c(r)}</li>
        ))}
      </ul>
    </ScaledSheet>
  )
}

function Resume({ data, name, createdAt }: Props) {
  const rows = (items: any[]) =>
    items.map((r, i) => (
      <tr key={i}>
        <td className="r-date">{c(r.date)}</td>
        <td>{c(r.text)}</td>
      </tr>
    ))
  return (
    <ScaledSheet width={1000} className="th-resume">
      <header>
        <h1>履 歴 書</h1>
        <p>{formatDate(createdAt)} 現在</p>
      </header>
      <table>
        <tbody>
          <tr>
            <th>氏名</th>
            <td className="r-name">{name}</td>
          </tr>
        </tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th className="r-date">年月</th>
            <th>学歴・職歴</th>
          </tr>
        </thead>
        <tbody>{rows(data.history)}</tbody>
      </table>
      <table>
        <thead>
          <tr>
            <th className="r-date">年月</th>
            <th>免許・資格</th>
          </tr>
        </thead>
        <tbody>{rows(data.licenses)}</tbody>
      </table>
      <table>
        <tbody>
          <tr>
            <th>志望の動機</th>
            <td>{c(data.motive)}</td>
          </tr>
          <tr>
            <th>趣味・特技</th>
            <td>{c(data.hobbies)}</td>
          </tr>
          <tr>
            <th>本人希望記入欄</th>
            <td>{c(data.note)}</td>
          </tr>
        </tbody>
      </table>
    </ScaledSheet>
  )
}

const ICONS: Record<string, string> = { sun: '☀', cloud: '☁', rain: '☂', storm: '⚡', snow: '❄' }

function Weather({ data, createdAt }: Props) {
  return (
    <ScaledSheet width={1000} className="th-weather">
      <header>
        <small>{formatDate(createdAt)} TL気象台 発表</small>
        <h1>{c(data.headline)}</h1>
      </header>
      <div className="w-grid">
        {data.periods.slice(0, 4).map((p: any) => (
          <div key={p.time}>
            <h2>{c(p.time)}</h2>
            <span>{ICONS[p.icon] ?? ICONS.cloud}</span>
            <p>{c(p.text)}</p>
          </div>
        ))}
      </div>
      <p className="w-warning">{c(data.warning)}</p>
      <p className="w-comment">{c(data.comment)}</p>
    </ScaledSheet>
  )
}

function Calendar({ data, name }: Props) {
  const years = [...new Set(Object.keys(data.counts).map((k) => k.slice(0, 4)))].sort().reverse()
  const level = (n: number) => (!n ? 0 : n < 20 ? 1 : n < 60 ? 2 : n < 120 ? 3 : 4)
  const cells = (year: number) => {
    const start = new Date(year, 0, 1)
    const offset = start.getDay()
    const out: { key: string; n: number }[] = []
    for (let i = 0; i < offset; i++) out.push({ key: `blank-${i}`, n: -1 })
    for (const d = new Date(start); d.getFullYear() === year; d.setDate(d.getDate() + 1)) {
      const key = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ key, n: data.counts[key] ?? 0 })
    }
    return out
  }
  return (
    <ScaledSheet width={1100} className="th-calendar">
      <h1>{name} の投稿カレンダー</h1>
      <p>
        {data.total.toLocaleString()}投稿 ・ 活動{data.days.toLocaleString()}日
        {data.best && ` ・ 最多 ${data.best.date}(${data.best.count}件)`}
      </p>
      {years.map((y) => (
        <section key={y}>
          <h2>{y}</h2>
          <div className="k-grid">
            {cells(Number(y)).map((cell) => (
              <i key={cell.key} className={cell.n < 0 ? 'blank' : `l${level(cell.n)}`} title={`${cell.key}: ${cell.n}件`} />
            ))}
          </div>
        </section>
      ))}
      <div className="k-legend">
        少ない
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`l${l}`} />
        ))}
        多い
      </div>
    </ScaledSheet>
  )
}

function Report({ data, name, createdAt }: Props) {
  return (
    <ScaledSheet width={1000} className="th-report">
      <header>
        <h1>あゆみ</h1>
        <p>Nostr小学校 {new Date(createdAt).getFullYear()}年度</p>
        <p>なまえ {name}</p>
      </header>
      <table>
        <thead>
          <tr>
            <th>学習のようす</th>
            {[1, 2, 3, 4, 5].map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((i: any) => (
            <tr key={i.label}>
              <td>{i.label}</td>
              {[1, 2, 3, 4, 5].map((n) => (
                <td key={n} className="r2-cell">
                  {n === i.score ? '○' : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="r2-att">
        <span>登校すべき日数 {data.attendance.days.toLocaleString()}日</span>
        <span>登校した日数 {data.attendance.active.toLocaleString()}日</span>
        <span>連続登校 {data.attendance.streak}日</span>
      </div>
      <section>
        <h2>先生から</h2>
        <p>{data.comment}</p>
      </section>
      <span className="seal">担任</span>
    </ScaledSheet>
  )
}

function Household({ data, name }: Props) {
  return (
    <ScaledSheet width={1000} className="th-household">
      <h1>{name} 家の家計簿</h1>
      <p className="k2-rule">投稿1円の支出、リアクション1円、返信3円、リポスト5円、zap10円の収入で計算</p>
      <table>
        <thead>
          <tr>
            <th>月</th>
            <th>収入</th>
            <th>支出</th>
            <th>収支</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r: any) => (
            <tr key={r.month}>
              <td>{r.month}</td>
              <td>{r.income.toLocaleString()}円</td>
              <td>{r.expense.toLocaleString()}円</td>
              <td className={r.income < r.expense ? 'minus' : ''}>{(r.income - r.expense).toLocaleString()}円</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>合計</th>
            <th>{data.income.toLocaleString()}円</th>
            <th>{data.expense.toLocaleString()}円</th>
            <th className={data.balance < 0 ? 'minus' : ''}>{data.balance.toLocaleString()}円</th>
          </tr>
        </tfoot>
      </table>
      <p className="k2-sum">{data.balance >= 0 ? '今年は黒字でした。' : '今年は赤字でした。'}</p>
    </ScaledSheet>
  )
}

function Greeting({ data, name }: Props) {
  return (
    <ScaledSheet width={800} className="th-greeting">
      <div className="g-body">
        <h1>{tate('謹賀新年')}</h1>
        <p>{tate(`昨年は${data.total}件の投稿にお付き合いいただき`)}</p>
        <p>{tate('誠にありがとうございました')}</p>
        <p>{tate(`活動した日は${data.activeDays}日 深夜の投稿は${Math.round(data.nightRate * 100)}%でした`)}</p>
        {data.topWord && <p>{tate(`昨年の一文字ならぬ一言は「${data.topWord}」です`)}</p>}
        <p>{tate('本年もよろしくお願い申し上げます')}</p>
        <p className="g-date">{tate(`${data.nextYear}年 元旦`)}</p>
        <p className="g-name">{tate(name)}</p>
      </div>
      <span className="g-sun" />
    </ScaledSheet>
  )
}

function Stamp({ data, name }: Props) {
  return (
    <ScaledSheet width={700} className="th-stamp">
      <div className="s-stamp">
        <small>NOSTR じぶん郵便</small>
        <h1>初投稿記念</h1>
        <p className="s-date">{data.firstDate}</p>
        <blockquote>{data.firstText}</blockquote>
        <p>{name}</p>
        <b>
          {data.days.toLocaleString()}
          <small>日</small>
        </b>
      </div>
      <p className="s-foot">通算 {data.total.toLocaleString()} 投稿</p>
    </ScaledSheet>
  )
}

function Trend({ data, name }: Props) {
  const list = (title: string, items: any[]) => (
    <section>
      <h2>{title}</h2>
      <ol>
        {items.map((w) => (
          <li key={w.word}>
            {w.word} <small>{w.count.toLocaleString()}回</small>
          </li>
        ))}
      </ol>
    </section>
  )
  return (
    <ScaledSheet width={1000} className="award-show th-trend">
      <header>
        <small>直近30日 {name} 調べ</small>
        <h1>TL流行語くらべ</h1>
      </header>
      <div className="t2-grid">
        {list('TLの流行', data.tlTop)}
        {list('自分だけ乗らなかった', data.ignored)}
        {list('自分だけ言っていた', data.onlyMine)}
      </div>
    </ScaledSheet>
  )
}

const THEMES: Record<string, (props: Props) => React.JSX.Element> = {
  ingredients: Ingredients,
  dig: Dig,
  history: History,
  omikuji: Omikuji,
  pyre: Pyre,
  manual: Manual,
  court: Court,
  bot: Bot,
  encyclopedia: Encyclopedia,
  resume: Resume,
  weather: Weather,
  calendar: Calendar,
  report: Report,
  household: Household,
  greeting: Greeting,
  stamp: Stamp,
  trend: Trend,
}

export function ThemeSheet({ id, ...props }: Props & { id?: string }) {
  const Theme = id ? THEMES[id] : undefined
  return Theme ? <Theme {...props} /> : null
}
