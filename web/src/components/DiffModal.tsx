import { useState } from 'react'
import { ModalPortal } from './ModalPortal'
import { Icon } from './Icon'
import type { ModifyMode } from '../lib/types'

interface DiffModalProps {
  originalText: string
  modifiedText: string
  mode: ModifyMode
  onConfirm: () => void
  onCancel: () => void
}

const MODE_LABELS: Record<ModifyMode, string> = {
  rewrite: '改写',
  expand: '扩写',
  condense: '缩写',
  polish: '润色',
  custom: '自定义',
}

export function DiffModal({ originalText, modifiedText, mode, onConfirm, onCancel }: DiffModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(modifiedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <ModalPortal>
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-4xl max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="sparkle" className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold">AI修改结果</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-bg text-primary">
              {MODE_LABELS[mode]}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted hover:text-text-primary"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {/* Diff view */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Original */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-bg-dark border-b border-border flex items-center gap-2">
              <Icon name="eye" className="w-3.5 h-3.5 text-text-muted" />
              <span className="text-xs font-medium text-text-secondary">原文</span>
            </div>
            <pre className="p-4 text-xs text-text-primary whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
              {originalText}
            </pre>
          </div>

          {/* Modified */}
          <div className="border border-primary/30 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-primary-bg border-b border-primary/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon name="sparkle" className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-medium text-primary">修改后</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-text-muted hover:text-primary flex items-center gap-1"
              >
                <Icon name="clipboard" className="w-3 h-3" />
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <pre className="p-4 text-xs text-text-primary whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
              {modifiedText}
            </pre>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            <Icon name="check" className="w-4 h-4" />
            确认替换
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
          >
            取消
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
