import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { SITE } from '../site'

// 紙面は固定幅で組み、画面の幅に合わせて縮小して見せる。画像保存は等倍の紙面から作る
export function ScaledSheet({ width, className, children }: { width: number; className: string; children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null)
  const page = useRef<HTMLElement>(null)
  const [size, setSize] = useState({ scale: 0.5, height: 0 })

  useLayoutEffect(() => {
    const measure = () => {
      const scale = frame.current!.clientWidth / width
      setSize({ scale, height: page.current!.offsetHeight * scale })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(frame.current!)
    observer.observe(page.current!)
    return () => observer.disconnect()
  }, [width])

  return (
    <div ref={frame} className="sheet-frame" style={{ height: size.height }}>
      <article
        ref={page}
        data-page
        className={`sheet-page ${className}`}
        style={{ width, transform: `scale(${size.scale})` }}
      >
        {children}
        <p className="sheet-credit">{SITE.url ? `${SITE.name} ${SITE.url}` : SITE.name}</p>
      </article>
    </div>
  )
}

export function Fit({ className, max, min, children }: { className: string; max: number; min: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current!
    let size = max
    el.style.fontSize = `${size}px`
    while (size > min && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) {
      size -= 0.5
      el.style.fontSize = `${size}px`
    }
  }, [max, min, children])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}

export const formatDate = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
