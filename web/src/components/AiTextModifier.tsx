import { useState, useEffect, useCallback, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { Icon } from './Icon'
import { DiffModal } from './DiffModal'
import { modifyText } from '../lib/api'
import type { ModifyMode, TextModifyResponse } from '../lib/types'

interface AiTextModifierProps {
  editor: Editor | null
  storyId: string
  onTextReplaced?: () => void
}

interface SelectionState {
  text: string
  from: number
  to: number
  x: number
  y: number
}

const MODES: { key: ModifyMode; label: string; icon: string }[] = [
  { key: 'rewrite', label: '改写', icon: 'refresh' },
  { key: 'expand', label: '扩写', icon: 'plus' },
  { key: 'condense', label: '缩写', icon: 'minus' },
  { key: 'polish', label: '润色', icon: 'sparkle' },
  { key: 'custom', label: '自定义', icon: 'edit' },
]

export function AiTextModifier({ editor, storyId, onTextReplaced }: AiTextModifierProps) {
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [showCustom, setShowCustom] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<TextModifyResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  // 获取选区位置
  const getSelectionPosition = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    }
  }, [])

  // 监听编辑器选区变化
  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      const { from, to } = editor.state.selection
      if (from === to) {
        setSelection(null)
        setShowCustom(false)
        return
      }

      const selectedText = editor.state.doc.textBetween(from, to, '\n')
      if (!selectedText.trim()) {
        setSelection(null)
        return
      }

      const pos = getSelectionPosition()
      if (pos) {
        setSelection({
          text: selectedText,
          from,
          to,
          x: pos.x,
          y: pos.y,
        })
      }
    }

    editor.on('selectionUpdate', handleSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor, getSelectionPosition])

  // 点击外部关闭工具栏
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setSelection(null)
        setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 获取上下文（选中段落前后各500字）
  const getContext = useCallback(() => {
    if (!editor || !selection) return { before: '', after: '' }
    const docSize = editor.state.doc.content.size
    const beforeFrom = Math.max(0, selection.from - 500)
    const beforeTo = selection.from
    const afterFrom = selection.to
    const afterTo = Math.min(docSize, selection.to + 500)

    return {
      before: beforeFrom < beforeTo ? editor.state.doc.textBetween(beforeFrom, beforeTo, '\n') : '',
      after: afterFrom < afterTo ? editor.state.doc.textBetween(afterFrom, afterTo, '\n') : '',
    }
  }, [editor, selection])

  // 执行AI修改
  const handleModify = useCallback(async (mode: ModifyMode, prompt: string) => {
    if (!editor || !selection) return

    setLoading(true)
    setError(null)

    try {
      const context = getContext()
      const response = await modifyText(storyId, {
        selectedText: selection.text,
        prompt,
        mode,
        context,
      })
      setResult(response)
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'AI修改失败')
    } finally {
      setLoading(false)
    }
  }, [editor, selection, storyId, getContext])

  // 确认替换
  const handleConfirmReplace = useCallback(() => {
    if (!editor || !result || !selection) return

    editor.chain().focus().insertContentAt(
      { from: selection.from, to: selection.to },
      result.modifiedText,
    ).run()

    setSelection(null)
    setResult(null)
    setShowCustom(false)
    setCustomPrompt('')
    onTextReplaced?.()
  }, [editor, result, selection, onTextReplaced])

  // 取消
  const handleCancel = useCallback(() => {
    setResult(null)
    setShowCustom(false)
    setCustomPrompt('')
  }, [])

  if (!selection && !result) return null

  return (
    <>
      {/* 浮动工具栏 */}
      {selection && !result && (
        <div
          ref={toolbarRef}
          className="fixed z-40 bg-bg-card border border-border rounded-xl shadow-lg px-2 py-1.5 flex items-center gap-1 animate-scale-in"
          style={{
            left: `${Math.min(Math.max(selection.x - 100, 10), window.innerWidth - 220)}px`,
            top: `${Math.max(selection.y - 50, 10)}px`,
            transform: 'translateX(-50%)',
          }}
        >
          {MODES.map(mode => (
            <button
              key={mode.key}
              type="button"
              onClick={() => {
                if (mode.key === 'custom') {
                  setShowCustom(true)
                } else {
                  handleModify(mode.key, '')
                }
              }}
              disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary-bg rounded-lg transition-all disabled:opacity-40"
              title={mode.label}
            >
              <Icon name={mode.icon} className="w-3.5 h-3.5" />
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* 自定义提示词输入 */}
      {showCustom && !result && (
        <div
          ref={toolbarRef}
          className="fixed z-40 bg-bg-card border border-border rounded-xl shadow-lg p-4 w-80 animate-scale-in"
          style={{
            left: `${Math.min(Math.max(selection!.x - 160, 10), window.innerWidth - 340)}px`,
            top: `${Math.max(selection!.y - 100, 10)}px`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-primary">自定义修改指令</span>
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="text-text-muted hover:text-text-primary"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>
          <textarea
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
            placeholder="描述你希望如何修改选中的文字..."
            rows={3}
            autoFocus
            className="w-full px-3 py-2 bg-bg-dark border border-border rounded-lg text-xs focus:border-primary focus:outline-none resize-none placeholder:text-text-muted"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => handleModify('custom', customPrompt)}
              disabled={!customPrompt.trim() || loading}
              className="flex-1 px-3 py-2 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <><div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> 修改中...</>
              ) : (
                <><Icon name="sparkle" className="w-3.5 h-3.5" /> 发送</>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowCustom(false)}
              className="px-3 py-2 border border-border hover:bg-bg-dark text-text-secondary rounded-lg text-xs transition-all"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 max-w-sm animate-slide-down">
          <div className="flex items-start gap-2">
            <Icon name="flame" className="w-4 h-4 text-danger mt-0.5" />
            <div>
              <p className="text-xs font-medium text-danger">AI修改失败</p>
              <p className="text-xs text-text-secondary mt-0.5">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-text-muted hover:text-text-primary"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 对比确认弹窗 */}
      {result && selection && (
        <DiffModal
          originalText={selection.text}
          modifiedText={result.modifiedText}
          mode={result.mode}
          onConfirm={handleConfirmReplace}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}
