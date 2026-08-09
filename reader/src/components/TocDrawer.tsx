import { useEffect, useRef } from 'react'
import type { Chapter } from '../lib/types'

interface Props {
  open: boolean
  title: string
  chapters: Chapter[]
  activeNum: number | null
  onSelect: (num: number) => void
  onClose: () => void
}

export default function TocDrawer({ open, title, chapters, activeNum, onSelect, onClose }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // 打开时滚动到当前章节
  useEffect(() => {
    if (!open) return
    const el = listRef.current
    if (!el) return
    const active = el.querySelector('[data-active="true"]')
    if (active) {
      active.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }, [open, activeNum])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />

      {/* 抽屉 */}
      <div className="absolute inset-y-0 right-0 flex w-[82%] max-w-sm flex-col bg-bg-card shadow-lg animate-toc-in">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 pt-[env(safe-area-inset-top)]">
          <h2 className="truncate text-base font-semibold text-text-primary">{title}</h2>
          <button onClick={onClose} className="px-1 text-xl text-text-muted active:opacity-60" aria-label="关闭目录">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-text-muted">
          <span>共 {chapters.length} 章</span>
          <span>{activeNum != null ? `当前第 ${activeNum} 章` : ''}</span>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain py-1">
          {chapters.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-text-muted">暂无章节</p>
          )}
          {chapters.map(ch => {
            const active = ch.chapter_number === activeNum
            return (
              <button
                key={ch.id}
                data-active={active}
                onClick={() => onSelect(ch.chapter_number)}
                className={`flex w-full items-baseline gap-2 px-4 py-2.5 text-left text-sm transition active:bg-primary-light/50 ${
                  active ? 'bg-primary-light/60 text-primary-dark' : 'text-text-secondary'
                }`}
              >
                <span className={`shrink-0 text-xs ${active ? 'font-bold text-primary-dark' : 'text-text-muted'}`}>
                  {ch.chapter_number}
                </span>
                <span className={`truncate ${active ? 'font-semibold' : ''}`}>{ch.title}</span>
                {active && <span className="ml-auto shrink-0 text-primary-dark">●</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
