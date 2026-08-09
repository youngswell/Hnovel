import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getApiErrorMessage, importEpub } from '../lib/api'
import type { EpubImportResult } from '../lib/types'
import { ModalPortal } from './ModalPortal'
import { Icon } from './Icon'

export function ImportEpubModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<EpubImportResult | null>(null)

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('请先选择 EPUB 文件')
      return importEpub(
        file,
        { title: title.trim() || undefined },
        (p) => setProgress(p),
      )
    },
    onSuccess: (data) => {
      setResult(data)
      setProgress(100)
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
  })

  const pickFile = (f: File | undefined | null) => {
    if (!f) return
    if (!/\.epub$/i.test(f.name)) {
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      alert('仅支持 EPUB 格式文件')
      return
    }
    setFile(f)
    setProgress(0)
    setResult(null)
  }

  const reset = () => {
    setFile(null)
    setTitle('')
    setProgress(0)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <ModalPortal>
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">导入 EPUB</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        {!result ? (
          <div className="space-y-4">
            {/* 文件选择 */}
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFile(e.dataTransfer.files?.[0]) }}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-primary bg-primary-bg' : 'border-border hover:border-primary/50'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".epub,application/epub+zip"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <Icon name="book" className="w-10 h-10 mx-auto mb-3 text-text-muted" />
              {file ? (
                <p className="text-sm font-medium text-text-primary break-all">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-text-primary">点击选择或拖拽 .epub 文件到这里</p>
                  <p className="text-xs text-text-muted mt-1">当前仅支持 EPUB 格式，暂不支持 mobi / txt</p>
                </>
              )}
            </div>

            {/* 标题覆盖 */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1.5">书名（可选，留空使用 EPUB 内书名）</label>
              <input
                type="text"
                value={title}
                placeholder="留空则自动读取 EPUB 元数据标题"
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 bg-bg-dark border border-border rounded-xl text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none"
              />
            </div>

            {/* 上传进度 */}
            {mutation.isPending && (
              <div>
                <div className="flex justify-between text-xs text-text-muted mb-1">
                  <span>正在上传并解析…</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-bg-dark overflow-hidden border border-border">
                  <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {mutation.isError && (
              <p className="text-sm text-red-500">{getApiErrorMessage(mutation.error)}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                disabled={!file || mutation.isPending}
                onClick={() => mutation.mutate()}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all"
              >
                {mutation.isPending ? '导入中…' : '开始导入'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={mutation.isPending}
                className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-4">
              <span className="w-8 h-8 rounded-full bg-green-500/15 text-green-600 flex items-center justify-center shrink-0">
                <Icon name="check" className="w-5 h-5" />
              </span>
              <div>
                <p className="font-semibold text-text-primary">导入成功</p>
                <p className="text-sm text-text-secondary mt-1">
                  已导入 <span className="font-medium text-primary">{result.imported}</span> / {result.total} 章到故事
                  「{result.story_title}」
                </p>
                {result.creator && <p className="text-xs text-text-muted mt-0.5">作者：{result.creator}</p>}
                {result.first && result.last && (
                  <p className="text-xs text-text-muted mt-1">
                    章节范围：第 {result.first.number} 章「{result.first.title}」～ 第 {result.last.number} 章「{result.last.title}」
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => navigate(`/story/${result.story_id}`)}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-medium transition-all"
              >
                前往故事
              </button>
              <button
                type="button"
                onClick={reset}
                className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
              >
                导入另一本
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  )
}
