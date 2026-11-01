import type { AppraisalItem, NewspaperMeta, ResultBody, ResultKind } from '../db'

// モデルによっては JSON を ``` で囲んだり前置きを付けたりする
export function parseJson(text: string) {
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
}

// 構造化出力を画面用の形に変換する。kind のない依頼は本文のまま
export function toBody(text: string, kind?: ResultKind, meta?: NewspaperMeta): ResultBody {
  if (!kind) return { type: 'text', text }
  const parsed = parseJson(text)
  switch (kind) {
    case 'newspaper':
      return { type: kind, paper: parsed, ...meta! }
    case 'appraisal':
      return { type: kind, items: parsed.items }
    case 'award':
      return { type: kind, award: parsed }
    case 'drift':
      return { type: kind, drift: parsed }
    case 'dialogue':
      return { type: kind, dialogue: parsed }
  }
}

const NUMBER_TAG = /\s*\[P\d+\]/g

export const stripTags = (text: string) => text.replace(NUMBER_TAG, '')

const DIGITS = '〇一二三四五六七八九'
const positional = (digits: string) => [...digits].map((d) => DIGITS[Number(d)]).join('')

function underTenThousand(n: number) {
  return [
    [1000, '千'],
    [100, '百'],
    [10, '十'],
  ].reduce(
    (out, [place, unit]) => {
      const digit = Math.floor(out.rest / (place as number))
      const head = digit === 0 ? '' : (digit === 1 ? '' : DIGITS[digit]) + unit
      return { text: out.text + head, rest: out.rest % (place as number) }
    },
    { text: '', rest: n },
  )
}

// 120 → 百二十、12000 → 一万二千。0始まりや桁の多い数字は読み上げず一桁ずつ置き換える
export function kanjiNumber(digits: string) {
  if (digits.length > 12 || (digits.length > 1 && digits.startsWith('0'))) return positional(digits)
  if (Number(digits) === 0) return '〇'
  let rest = Number(digits)
  let out = ''
  for (const [size, unit] of [[1e8, '億'], [1e4, '万'], [1, '']] as const) {
    const part = Math.floor(rest / size)
    rest %= size
    if (!part) continue
    const { text, rest: ones } = underTenThousand(part)
    out += text + (ones ? DIGITS[ones] : '') + unit
  }
  return out
}

const toAsciiDigits = (text: string) => text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

// 縦書きでは数字を漢数字にする。年は 二〇二六年、時刻は 二十三時四十一分 と書く
function kanjiNumbers(text: string) {
  return toAsciiDigits(text)
    .replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => `${kanjiNumber(h)}時${m === '00' ? '' : `${kanjiNumber(String(Number(m)))}分`}`)
    .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g, (match, offset: number, all: string) => {
      const [whole, decimal] = match.replace(/,/g, '').split('.')
      const isYear = whole.length === 4 && all[offset + match.length] === '年'
      return (isYear ? positional(whole) : kanjiNumber(whole)) + (decimal ? `・${positional(decimal)}` : '')
    })
}

// 縦書きで横倒しにならないよう、残った英字と記号は全角にする
export function tate(text: string) {
  return kanjiNumbers(stripTags(text)).replace(/[A-Za-z%!?]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
}

export type RichPart = { type: 'text'; text: string } | { type: 'cite'; tag: string }

// 本文中の [P12] を根拠リンクにする。実在しない番号はそのまま文字として残す
export function splitCitations(text: string, citations: Record<string, string>): RichPart[] {
  const parts: RichPart[] = []
  let last = 0
  for (const m of text.matchAll(/\[(P\d+)\]/g)) {
    if (!citations[m[1]]) continue
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) })
    parts.push({ type: 'cite', tag: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', text: text.slice(last) })
  return parts
}

export function hitRate(items: AppraisalItem[]) {
  const checked = items.filter((i) => i.check)
  return { hits: checked.filter((i) => i.check === 'hit').length, checked: checked.length }
}
