import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  createScrapeBook,
  deleteScrapeBook,
  fetchScrapeBooks,
  fetchScrapeSources,
  getApiErrorMessage,
  scanScrapeBook,
  startScrapeTask,
  updateScrapeBook,
} from '../../lib/api'
import type { ScrapeBook } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { Empty, Field, inputClass, Modal, ProgressBar, StatusBadge } from './shared'

const EMPTY_FORM = { source_id: '', title: '', book_url: '' }

export function ScrapeBooksTab() {
  const queryClient = useQueryClient()
  const booksQuery = useQuery({ queryKey: ['scrape-books'], queryFn: fetchScrapeBooks })
  const sourcesQuery = useQuery({ queryKey: ['scrape-sources'], queryFn: fetchScrapeSources })

  const [editing, setEditing] = useState<ScrapeBook | 'new' | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [message, setMessage] = useState('')

  // 开始抓取
  const [startBook, setStartBook] = useState<ScrapeBook | null>(null)
  const [startChapter, setStartChapter] = useState(1)
  const [startMessage, setStartMessage] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scrape-books'] })
    queryClient.invalidateQueries({ queryKey: ['scrape-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['scrape-sources'] })
  }

  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: typeof EMPTY_FORM }) =>
      payload.id ? updateScrapeBook(payload.id, payload.data) : createScrapeBook(payload.data),
    onSuccess: () => {
      invalidate()
      setEditing(null)
      setMessage('已保存')
    },
    onError: (error) => setMessage(`保存失败：${getApiErrorMessage(error)}`),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScrapeBook(id),
    onSuccess: () => invalidate(),
    onError: (error) => setMessage(`删除失败：${getApiErrorMessage(error)}`),
  })

  const scanMutation = useMutation({
    mutationFn: (id: string) => scanScrapeBook(id),
    onSuccess: (data) => {
      invalidate()
      setMessage(`《${booksQuery.data?.find((b) => b.id === data.book_id)?.title || ''}》目录识别到 ${data.count} 个章节链接。`)
    },
    onError: (error) => setMessage(`扫描失败：${getApiErrorMessage(error)}`),
  })

  const startMutation = useMutation({
    mutationFn: (payload: { bookId: string; startChapter: number }) =>
      startScrapeTask(payload.bookId, payload.startChapter),
    onSuccess: () => {
      invalidate()
      setStartBook(null)
      setStartMessage('任务已创建并开始抓取。可在「抓取任务」页查看进度。')
    },
    onError: (error) => setStartMessage(`启动失败：${getApiErrorMessage(error)}`),
  })

  const openEdit = (book: ScrapeBook | 'new') => {
    setMessage('')
    if (book === 'new') {
      setForm({ source_id: sourcesQuery.data?.[0]?.id || '', title: '', book_url: '' })
    } else {
      setForm({ source_id: book.source_id, title: book.title, book_url: book.book_url })
    }
    setEditing(book)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">
          已抓取的书籍列表。添加书籍后点击「扫描」确认章节数，再「开始抓取」导入到故事库。
        </p>
        <button
          onClick={() => openEdit('new')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Icon name="plus" className="w-4 h-4" /> 新增书籍
        </button>
      </div>

      {message && <p className="text-sm text-primary">{message}</p>}

      {booksQuery.isLoading ? (
        <Empty text="加载中…" />
      ) : booksQuery.data?.length === 0 ? (
        <Empty text="还没有书籍。先确认已有网站源，再新增书籍并抓取。" />
      ) : (
        <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-border">
                <th className="px-4 py-2.5 font-medium">书名</th>
                <th className="px-4 py-2.5 font-medium">网站源</th>
                <th className="px-4 py-2.5 font-medium">状态</th>
                <th className="px-4 py-2.5 font-medium">进度</th>
                <th className="px-4 py-2.5 font-medium">关联故事</th>
                <th className="px-4 py-2.5 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {booksQuery.data?.map((book) => (
                <tr key={book.id} className="border-b border-border last:border-0 hover:bg-bg-dark/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text-primary">{book.title}</p>
                    <p className="text-xs text-text-muted truncate max-w-xs">{book.book_url}</p>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{book.source_name || '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={book.status} /></td>
                  <td className="px-4 py-3 min-w-40">
                    {book.total_chapters > 0 ? (
                      <ProgressBar done={book.imported_chapters} total={book.total_chapters} />
                    ) : (
                      <span className="text-xs text-text-muted">未扫描</span>
                    )}
                    {book.error && <p className="text-xs text-red-500 mt-1 truncate max-w-48">{book.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {book.story_id ? (
                      <Link to={`/story/${book.story_id}`} className="text-primary hover:underline text-xs">
                        {book.story_title || '查看故事'}
                      </Link>
                    ) : (
                      <span className="text-xs text-text-muted">未创建</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => scanMutation.mutate(book.id)}
                        disabled={book.status === 'scraping'}
                        className="px-2 py-1.5 rounded-lg text-xs text-text-muted hover:bg-bg-dark hover:text-text-primary disabled:opacity-40 transition-colors"
                        title="扫描章节数"
                      >
                        <Icon name="refresh" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setStartBook(book); setStartChapter(1); setStartMessage('') }}
                        disabled={book.status === 'scraping'}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-40 transition-colors"
                        title="开始抓取"
                      >
                        抓取
                      </button>
                      <button
                        onClick={() => openEdit(book)}
                        disabled={book.status === 'scraping'}
                        className="p-2 rounded-lg text-text-muted hover:bg-bg-dark hover:text-text-primary disabled:opacity-40 transition-colors"
                        title="编辑"
                      >
                        <Icon name="edit" className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm(`确认删除书籍「${book.title}」？其抓取任务会被删除（故事正文不受影响）。`)) deleteMutation.mutate(book.id) }}
                        disabled={book.status === 'scraping'}
                        className="p-2 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40 transition-colors"
                        title="删除"
                      >
                        <Icon name="trash" className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 新增 / 编辑 */}
      {editing && (
        <Modal title={editing === 'new' ? '新增书籍' : '编辑书籍'} onClose={() => setEditing(null)}>
          <div className="space-y-4">
            <Field label="网站源">
              <select
                className={inputClass}
                value={form.source_id}
                onChange={(e) => setForm({ ...form, source_id: e.target.value })}
              >
                {sourcesQuery.data?.length === 0 && <option value="">（请先创建网站源）</option>}
                {sourcesQuery.data?.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field label="书名">
              <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="如：乡村美少妇" />
            </Field>
            <Field label="目录页地址">
              <input className={inputClass} value={form.book_url} onChange={(e) => setForm({ ...form, book_url: e.target.value })} placeholder="如：http://www.daomuxiaoshuo.net/xiangcun/meishaofu/" />
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

      {/* 开始抓取 */}
      {startBook && (
        <Modal title={`开始抓取 - ${startBook.title}`} onClose={() => setStartBook(null)}>
          <div className="space-y-4">
            <Field label="起始章节号">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={startChapter}
                onChange={(e) => setStartChapter(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <p className="text-xs text-text-muted">
              已存在的章节会自动跳过；任务创建后立即开始，可在「抓取任务」页实时查看进度，支持同时抓取多本。
            </p>
            {startMessage && <p className="text-sm text-primary">{startMessage}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setStartBook(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-dark transition-colors">
                取消
              </button>
              <button
                onClick={() => startMutation.mutate({ bookId: startBook.id, startChapter })}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
              >
                开始抓取
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
