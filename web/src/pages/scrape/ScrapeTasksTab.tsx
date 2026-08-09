import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelScrapeTask,
  deleteScrapeTask,
  fetchScrapeBooks,
  fetchScrapeTasks,
  getApiErrorMessage,
  startScrapeTask,
} from '../../lib/api'
import type { ScrapeTaskStatus } from '../../lib/types'
import { Icon } from '../../components/Icon'
import { Empty, Field, inputClass, Modal, ProgressBar, StatusBadge } from './shared'

const FILTERS: Array<{ key: 'all' | ScrapeTaskStatus; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'running', label: '进行中' },
  { key: 'queued', label: '排队中' },
  { key: 'completed', label: '已完成' },
  { key: 'failed', label: '失败' },
  { key: 'cancelled', label: '已取消' },
]

export function ScrapeTasksTab() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | ScrapeTaskStatus>('all')
  const [message, setMessage] = useState('')

  // 新建任务
  const [creating, setCreating] = useState(false)
  const [bookId, setBookId] = useState('')
  const [startChapter, setStartChapter] = useState(1)

  // 每 3 秒轮询，保证刷新后与运行中都能实时看到进度
  const tasksQuery = useQuery({
    queryKey: ['scrape-tasks'],
    queryFn: fetchScrapeTasks,
    refetchInterval: 3000,
  })
  const booksQuery = useQuery({ queryKey: ['scrape-books'], queryFn: fetchScrapeBooks })

  const runningCount = useMemo(
    () => (tasksQuery.data || []).filter((t) => t.status === 'running' || t.status === 'queued').length,
    [tasksQuery.data],
  )

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['scrape-tasks'] })
    queryClient.invalidateQueries({ queryKey: ['scrape-books'] })
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelScrapeTask(id),
    onSuccess: () => invalidate(),
    onError: (error) => setMessage(`取消失败：${getApiErrorMessage(error)}`),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteScrapeTask(id),
    onSuccess: () => invalidate(),
    onError: (error) => setMessage(`删除失败：${getApiErrorMessage(error)}`),
  })
  const createMutation = useMutation({
    mutationFn: () => startScrapeTask(bookId, startChapter),
    onSuccess: () => {
      invalidate()
      setCreating(false)
      setMessage('任务已创建并开始抓取。')
    },
    onError: (error) => setMessage(`创建失败：${getApiErrorMessage(error)}`),
  })

  const filtered = useMemo(() => {
    const all = tasksQuery.data || []
    if (filter === 'all') return all
    return all.filter((t) => t.status === filter)
  }, [tasksQuery.data, filter])

  const openCreate = () => {
    const idle = (booksQuery.data || []).find((b) => b.status !== 'scraping')
    setBookId(idle?.id || booksQuery.data?.[0]?.id || '')
    setStartChapter(1)
    setCreating(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 p-1 rounded-xl bg-bg-card border border-border">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === f.key ? 'bg-primary text-white' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {runningCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {runningCount} 个任务进行中
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          <Icon name="plus" className="w-4 h-4" /> 新建抓取
        </button>
      </div>

      {message && <p className="text-sm text-primary">{message}</p>}

      {tasksQuery.isLoading ? (
        <Empty text="加载中…" />
      ) : filtered.length === 0 ? (
        <Empty text={filter === 'all' ? '还没有抓取任务。到「已抓取书」页添加书籍后开始抓取，或点击「新建抓取」。' : '该状态下暂无任务。'} />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <div key={task.id} className="bg-bg-card rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-text-primary truncate">{task.book_title || task.book_id}</h3>
                    <StatusBadge status={task.status} />
                    <span className="text-xs text-text-muted">
                      {task.start_chapter > 1 ? `从第 ${task.start_chapter} 章开始 · ` : ''}失败 {task.failed}
                    </span>
                  </div>
                  {task.status === 'running' && task.current_title && (
                    <p className="text-xs text-text-secondary mt-1 truncate">正在抓取：{task.current_title}</p>
                  )}
                  {(task.error || task.status === 'failed') && (
                    <p className="text-xs text-red-500 mt-1 truncate">{task.error || '抓取失败'}</p>
                  )}
                  <div className="mt-2 max-w-xl">
                    <ProgressBar done={task.done} total={task.total || 1} />
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    创建于 {task.created_at}
                    {task.started_at ? ` · 开始 ${task.started_at}` : ''}
                    {task.finished_at ? ` · 结束 ${task.finished_at}` : ''}
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {(task.status === 'running' || task.status === 'queued') && (
                    <button
                      onClick={() => cancelMutation.mutate(task.id)}
                      className="px-2.5 py-1.5 rounded-lg text-xs bg-amber-500/10 text-amber-600 border border-amber-500/30 font-medium hover:bg-amber-500/20 transition-colors"
                      title="取消任务"
                    >
                      取消
                    </button>
                  )}
                  {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
                    <button
                      onClick={() => { if (window.confirm('确认删除该任务记录？')) deleteMutation.mutate(task.id) }}
                      className="p-2 rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-500 transition-colors"
                      title="删除记录"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 新建抓取 */}
      {creating && (
        <Modal title="新建抓取任务" onClose={() => setCreating(false)}>
          <div className="space-y-4">
            <Field label="选择书籍">
              <select className={inputClass} value={bookId} onChange={(e) => setBookId(e.target.value)}>
                {booksQuery.data?.length === 0 && <option value="">（请先在「已抓取书」添加书籍）</option>}
                {booksQuery.data?.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}{b.status === 'scraping' ? '（抓取中）' : ''}</option>
                ))}
              </select>
            </Field>
            <Field label="起始章节号">
              <input
                type="number"
                min={1}
                className={inputClass}
                value={startChapter}
                onChange={(e) => setStartChapter(Math.max(1, Number(e.target.value) || 1))}
              />
            </Field>
            <p className="text-xs text-text-muted">支持同时抓取多本书；任务状态会持久化，刷新页面后仍可继续查看。</p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-text-secondary hover:bg-bg-dark transition-colors">
                取消
              </button>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!bookId}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
              >
                开始
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
