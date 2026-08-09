import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createScrapeSource,
  deleteScrapeSource,
  fetchScrapeSources,
  getApiErrorMessage,
  previewScrapeSource,
  updateScrapeSource,
} from '../../lib/api'
import type { ScrapePreview, ScrapeSource } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { Empty, Field, inputClass, Modal, StatusBadge } from './shared'

const EMPTY_FORM = {
  name: '',
  base_url: '',
  link_pattern: '',
  title_selector: 'h2',
  content_selectors: '',
  enabled: true,
}

export function ScrapeSourcesTab() {
  const queryClient = useQueryClient()
  const sourcesQuery = useQuery({ queryKey: ['scrape-sources'], queryFn: fetchScrapeSources })

  const [editing, setEditing] = useState<ScrapeSource | 'new' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState('')

  // 预览状态
  const [previewSource, setPreviewSource] = useState<ScrapeSource | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [preview, setPreview] = useState<ScrapePreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scrape-sources'] })

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: typeof EMPTY_FORM }) => {
      const body = {
        ...payload.data,
        content_selectors: payload.data.content_selectors
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      }
      return payload.id ? updateScrapeSource(payload.id, body) : createScrapeSource(body)
    },
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setMessage('已保存')
    },
    onError: (error) => setMessage(`保存失败：${getApiErrorMessage(error)}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScrapeSource(id),
    onSuccess: () => invalidate(),
    onError: (error) => setMessage(`删除失败：${getApiErrorMessage(error)}`),
  })

  const runPreview = async () => {
    if (!previewSource || !previewUrl.trim()) return
    setPreviewLoading(true)
    setPreview(null)
    try {
      const result = await previewScrapeSource({
        book_url: previewUrl.trim(),
        link_pattern: previewSource.link_pattern,
        title_selector: previewSource.title_selector,
        content_selectors: previewSource.content_selectors,
      })
      setPreview(result)
    } catch (error) {
      setMessage(`预览失败：${getApiErrorMessage(error)}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  const openEdit = (source: ScrapeSource | 'new') => {
    setMessage('')
    if (source === 'new') {
      setForm(EMPTY_FORM)
    } else {
      setForm({
        name: source.name,
        base_url: source.base_url,
        link_pattern: source.link_pattern,
        title_selector: source.title_selector,
        content_selectors: (source.content_selectors || []).join('\n'),
        enabled: source.enabled !== false && source.enabled !== 0,
      })
    }
    setEditing(source)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          管理抓取网站源。不同站点结构不同，可通过「正文选择器」「标题选择器」与「链接正则」分别适配。
        </p>
        <button
          onClick={() => openEdit('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Icon name="plus" className="w-4 h-4" /> 新增网站源
        </button>
      </div>

      {message && <p className="text-sm text-primary">{message}</p>}

      {sourcesQuery.isLoading ? (
        <Empty text="加载中…" />
      ) : sourcesQuery.data?.length === 0 ? (
        <Empty text="还没有网站源，先点击右上角「新增网站源」创建，例如一个小说站点。" />
      ) : (
        <div className="space-y-2">
          {sourcesQuery.data?.map((source) => (
            <div key={source.id} className="bg-bg-card rounded-xl border border-border p-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-text-primary">{source.name}</h3>
                  <StatusBadge status={source.enabled !== false && source.enabled !== 0 ? 'done' : 'cancelled'} />
                  <span className="text-xs text-text-muted">{source.book_count ?? 0} 本书</span>
                </div>
                <p className="text-xs text-text-muted mt-1 truncate">{source.base_url}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-text-secondary">
                  <span>链接正则：<code className="text-text-muted">{source.link_pattern || '自动识别'}</code></span>
                  <span>标题选择器：<code className="text-text-muted">{source.title_selector}</code></span>
                  <span>正文选择器：<code className="text-text-muted">{(source.content_selectors || []).length} 个</code></span>
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  onClick={() => { setPreviewSource(source); setPreviewUrl(''); setPreview(null); setMessage('') }}
                  className="p-2 rounded-lg text-text-muted hover:bg-bg-dark hover:text-text-primary transition-colors"
                  title="用一本书的目录页测试识别效果"
                >
                  <Icon name="search" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => openEdit(source)}
                  className="p-2 rounded-lg text-text-muted hover:bg-bg-dark hover:text-text-primary transition-colors"
                  title="编辑"
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { if (window.confirm(`确认删除网站源「${source.name}」？其下书籍与任务也会被删除。`)) deleteMutation.mutate(source.id) }}
                  className="p-2 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                  title="删除"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新增 / 编辑 */}
      {editing && (
        <Modal title={editing === 'new' ? '新增网站源' : '编辑网站源'} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="源名称">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：示例小说站" />
            </Field>
            <Field label="站点地址（Base URL）">
              <input className={inputClass} value={form.base_url} onChange={(e) => setForm({ ...form, base_url: e.target.value })} placeholder="如：https://example.com" />
            </Field>
            <Field label="章节链接正则（对 href 匹配，留空自动识别“第x章”）">
              <input className={inputClass} value={form.link_pattern} onChange={(e) => setForm({ ...form, link_pattern: e.target.value })} placeholder="如：chapter/\d+\.html" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="章节标题选择器">
                <input className={inputClass} value={form.title_selector} onChange={(e) => setForm({ ...form, title_selector: e.target.value })} placeholder="如：h2" />
              </Field>
              <Field label="启用">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className="mt-1 w-full flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-bg-dark"
                >
                  <span className="text-sm text-text-secondary">{form.enabled ? '启用' : '停用'}</span>
                  <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${form.enabled ? 'bg-primary' : 'bg-bg-dark border border-border'}`}>
                    <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${form.enabled ? 'translate-x-4' : ''}`} />
                  </span>
                </button>
              </Field>
            </div>
            <Field label="正文选择器（每行一个，按顺序尝试）">
              <textarea
                className={`${inputClass} h-28 font-mono text-xs`}
                value={form.content_selectors}
                onChange={(e) => setForm({ ...form, content_selectors: e.target.value })}
                placeholder={'.article\n#content\n.content\n.chapter-content'}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-dark transition-colors">
                取消
              </button>
              <button
                onClick={() => saveMutation.mutate({ id: editing === 'new' ? undefined : editing.id, data: form })}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* 预览测试 */}
      {previewSource && (
        <Modal title={`测试识别 - ${previewSource.name}`} onClose={() => setPreviewSource(null)} width="max-w-xl">
          <div className="space-y-4">
            <Field label="书籍目录页地址">
              <input
                className={inputClass}
                value={previewUrl}
                onChange={(e) => { setPreviewUrl(e.target.value); setPreview(null) }}
                placeholder="如：https://example.com/novel/book/"
              />
            </Field>
            <div className="flex items-center justify-between">
              <p className="text-xs text-text-muted">
                将用该源当前的链接正则与选择器解析目录页。
              </p>
              <button
                onClick={runPreview}
                disabled={previewLoading || !previewUrl.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                {previewLoading ? '解析中…' : '解析目录'}
              </button>
            </div>
            {preview && (
              <div className="rounded-xl border border-border bg-bg-dark p-4 space-y-2">
                <p className="text-sm text-text-primary">
                  书名：<span className="font-medium">{preview.title || '（未识别）'}</span>
                  <span className="ml-3 text-primary font-medium">识别到 {preview.count} 个章节链接</span>
                </p>
                {preview.count > 0 ? (
                  <ul className="text-xs text-text-secondary space-y-1 max-h-48 overflow-y-auto">
                    {preview.sample.map((c) => (
                      <li key={c.url} className="truncate">
                        <span className="text-text-muted">{c.text}</span>
                      </li>
                    ))}
                    {preview.count > preview.sample.length && <li className="text-text-muted">… 还有 {preview.count - preview.sample.length} 章</li>}
                  </ul>
                ) : (
                  <p className="text-xs text-red-500">未识别到章节链接，请调整「章节链接正则」。</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
