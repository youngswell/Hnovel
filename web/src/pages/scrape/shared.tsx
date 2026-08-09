import type { ReactNode } from 'react'
import { ModalPortal } from '../../components/ModalPortal'
import { Icon } from '../../components/Icon'

// 状态徽章
const BADGE: Record<string, { label: string; className: string }> = {
  idle: { label: '空闲', className: 'bg-bg-dark text-text-muted border border-border' },
  scraping: { label: '抓取中', className: 'bg-primary-bg text-primary border border-primary/25' },
  running: { label: '抓取中', className: 'bg-primary-bg text-primary border border-primary/25' },
  queued: { label: '排队中', className: 'bg-bg-dark text-text-muted border border-border' },
  done: { label: '已完成', className: 'bg-green-500/10 text-green-600 border border-green-500/30' },
  completed: { label: '已完成', className: 'bg-green-500/10 text-green-600 border border-green-500/30' },
  failed: { label: '失败', className: 'bg-red-500/10 text-red-600 border border-red-500/30' },
  cancelled: { label: '已取消', className: 'bg-amber-500/10 text-amber-600 border border-amber-500/30' },
}

export function StatusBadge({ status }: { status: string }) {
  const s = BADGE[status] || { label: status, className: 'bg-bg-dark text-text-muted border border-border' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${s.className}`}>
      {s.label}
    </span>
  )
}

// 模态框
export function Modal({
  title,
  onClose,
  children,
  width = 'max-w-lg',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  return (
    <ModalPortal>
      <div className={`w-full ${width} bg-bg-card rounded-xl border border-border shadow-xl modal-enter max-h-[85vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-muted hover:bg-bg-dark hover:text-text-primary transition-colors">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </ModalPortal>
  )
}

// 表单字段
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}

export const inputClass =
  'w-full px-3 py-2 rounded-lg border border-border bg-bg-dark focus:border-primary focus:outline-none text-text-primary'

// 进度条
export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-bg-dark overflow-hidden border border-border">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">{done}/{total} ({pct}%)</span>
    </div>
  )
}

// 空态
export function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-text-muted text-sm border border-dashed border-border rounded-xl bg-bg-card/40">
      {text}
    </div>
  )
}
