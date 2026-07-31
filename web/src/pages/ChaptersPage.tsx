import { useParams, Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { deleteChapter, fetchChapters, getApiErrorMessage, renumberChapter, saveChapter } from '../lib/api'
import { Icon } from '../components/Icon'
import type { Chapter } from '../lib/types'

export function ChaptersPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null)
  const [editingNumber, setEditingNumber] = useState('')
  const [editingTitle, setEditingTitle] = useState('')
  const { data: chapters, isLoading } = useQuery({
    queryKey: ['chapters', id], queryFn: () => fetchChapters(id!), enabled: !!id,
  })
  const deleteMutation = useMutation({
    mutationFn: (num: number) => deleteChapter(id!, num),
    onSuccess: (_data, num) => {
      queryClient.removeQueries({ queryKey: ['chapter', id, String(num)] })
      queryClient.invalidateQueries({ queryKey: ['chapters', id] })
      queryClient.invalidateQueries({ queryKey: ['story', id] })
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
    onError: error => alert('删除章节失败: ' + getApiErrorMessage(error)),
  })
  const editMutation = useMutation({
    mutationFn: async (chapter: Chapter) => {
      const nextNumber = Number(editingNumber)
      let updated = chapter
      if (nextNumber !== chapter.chapter_number) {
        updated = await renumberChapter(id!, chapter.chapter_number, nextNumber)
      }
      if (editingTitle.trim() !== chapter.title) {
        updated = await saveChapter(id!, nextNumber, { ...updated, title: editingTitle.trim() })
      }
      return { chapter: updated, oldNumber: chapter.chapter_number }
    },
    onSuccess: ({ chapter, oldNumber }) => {
      setEditingChapterId(null)
      setEditingNumber('')
      setEditingTitle('')
      queryClient.removeQueries({ queryKey: ['chapter', id, String(oldNumber)] })
      queryClient.setQueryData(['chapter', id, String(chapter.chapter_number)], chapter)
      queryClient.invalidateQueries({ queryKey: ['chapters', id] })
      queryClient.invalidateQueries({ queryKey: ['outline', id] })
      queryClient.invalidateQueries({ queryKey: ['story', id] })
      queryClient.invalidateQueries({ queryKey: ['stories'] })
    },
    onError: error => alert('修改章节失败: ' + getApiErrorMessage(error)),
  })

  const handleDelete = (num: number, title: string) => {
    if (confirm(`确认删除第${num}章「${title}」？此操作无法撤销。`)) {
      deleteMutation.mutate(num)
    }
  }
  const startRename = (chapter: Chapter) => {
    setEditingChapterId(chapter.id)
    setEditingNumber(String(chapter.chapter_number))
    setEditingTitle(chapter.title)
  }
  const cancelRename = () => {
    setEditingChapterId(null)
    setEditingNumber('')
    setEditingTitle('')
  }
  const saveRename = (chapter: Chapter) => {
    const chapterNumber = Number(editingNumber)
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1) {
      alert('章节号必须是正整数')
      return
    }
    if (chapters?.some(item => item.id !== chapter.id && item.chapter_number === chapterNumber)) {
      alert(`第${chapterNumber}章已经存在，请换一个章节号`)
      return
    }
    const title = editingTitle.trim()
    if (!title) {
      alert('章节标题不能为空')
      return
    }
    if (title === chapter.title && chapterNumber === chapter.chapter_number) {
      cancelRename()
      return
    }
    editMutation.mutate(chapter)
  }
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (exportFrom.trim()) params.set('from', exportFrom.trim())
    if (exportTo.trim()) params.set('to', exportTo.trim())
    const query = params.toString()
    return query ? `?${query}` : ''
  }, [exportFrom, exportTo])

  const exportUrl = (format: 'markdown' | 'txt' | 'html' | 'epub') =>
    `/api/stories/${id}/export/${format}${exportQuery}`

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-primary transition-colors">工作台</Link>
        <span className="text-border">/</span>
        <Link to={`/story/${id}`} className="hover:text-primary transition-colors">故事</Link>
        <span className="text-border">/</span>
        <span className="text-text-primary font-medium">章节列表</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">章节列表</h1>
          <p className="text-text-secondary mt-1">
            {chapters?.length ? `${chapters.length} 章 &middot; ${chapters.reduce((s, c) => s + c.word_count, 0).toLocaleString()} 字` : '暂无章节'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/story/${id}/write`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl transition-all font-medium text-sm shadow-sm">
            <Icon name="plus" className="w-4 h-4" /> 写新章节
          </Link>
        </div>
      </div>

      {chapters && chapters.length > 0 && (
        <div className="bg-bg-card border border-border rounded-2xl p-4 mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            <div className="flex-1">
              <h2 className="text-sm font-semibold mb-1">导出章节</h2>
              <p className="text-xs text-text-muted">留空表示导出全部章节；填写范围可导出指定章节，例如 1 到 20。</p>
            </div>
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={exportFrom} placeholder="起始章"
                onChange={e => setExportFrom(e.target.value)}
                className="w-24 px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm focus:border-primary focus:outline-none" />
              <span className="text-text-muted">至</span>
              <input type="number" min={1} value={exportTo} placeholder="结束章"
                onChange={e => setExportTo(e.target.value)}
                className="w-24 px-3 py-2 bg-bg-dark border border-border rounded-lg text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { format: 'txt', label: 'TXT' },
                { format: 'markdown', label: 'Markdown' },
                { format: 'html', label: 'HTML' },
                { format: 'epub', label: 'EPUB' },
              ].map(item => (
                <a key={item.format} href={exportUrl(item.format as 'markdown' | 'txt' | 'html' | 'epub')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 border border-border hover:bg-bg-dark text-text-secondary rounded-lg transition-all text-sm">
                  <Icon name="file" className="w-4 h-4" /> {item.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
      ) : !chapters?.length ? (
        <div className="bg-bg-card border border-border rounded-2xl p-12 text-center shadow-sm">
          <Icon name="file" className="w-12 h-12 mx-auto mb-4 text-text-muted" />
          <p className="text-text-secondary font-medium mb-2">还没有章节</p>
          <Link to={`/story/${id}/write`} className="text-primary hover:text-primary-dark text-sm font-medium">使用AI开始写第一章</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {chapters.map(ch => (
            <div key={ch.id}
              className="bg-bg-card border border-border hover:border-primary/20 rounded-xl p-4 transition-all shadow-sm hover:shadow-md flex items-center justify-between group">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-sm font-mono text-text-muted bg-bg-dark px-3 py-1.5 rounded-lg border border-border">Ch.{ch.chapter_number}</span>
                <div className="min-w-0">
                  {editingChapterId === ch.id ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="block">
                        <span className="block text-[10px] text-text-muted mb-1">章节号</span>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={editingNumber}
                          autoFocus
                          onChange={e => setEditingNumber(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(ch)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          className="w-24 px-3 py-1.5 bg-bg-dark border border-primary/40 rounded-lg text-sm font-mono text-text-primary focus:border-primary focus:outline-none"
                        />
                      </label>
                      <label className="block flex-1 min-w-48">
                        <span className="block text-[10px] text-text-muted mb-1">章节标题</span>
                        <input
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveRename(ch)
                            if (e.key === 'Escape') cancelRename()
                          }}
                          className="w-full max-w-md px-3 py-1.5 bg-bg-dark border border-primary/40 rounded-lg text-sm font-medium text-text-primary focus:border-primary focus:outline-none"
                        />
                      </label>
                      <button type="button" onClick={() => saveRename(ch)}
                        disabled={editMutation.isPending && editMutation.variables?.id === ch.id}
                        className="px-2.5 py-1.5 bg-primary text-white rounded-lg text-xs font-medium disabled:opacity-40">
                        保存
                      </button>
                      <button type="button" onClick={cancelRename}
                        className="px-2.5 py-1.5 border border-border text-text-secondary rounded-lg text-xs">
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => startRename(ch)}
                        title="点击修改标题"
                        className="block max-w-full text-left font-medium text-text-primary truncate hover:text-primary">
                        {ch.title}
                      </button>
                      {ch.outline && <p className="text-xs text-text-muted mt-0.5 line-clamp-1">{ch.outline}</p>}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                <div className="flex items-center gap-3 text-xs text-text-muted">
                  <span>{ch.word_count.toLocaleString()} 字</span>
                  <span className={`px-2 py-0.5 rounded-full ${ch.status === 'draft' ? 'bg-warning/10 text-warning' : ch.status === 'revised' ? 'bg-blue-500/10 text-blue-500' : 'bg-success-bg text-success'}`}>
                    {ch.status === 'draft' ? '草稿' : ch.status === 'revised' ? '已修订' : '定稿'}
                  </span>
                  {ch.scene_type !== 'normal' && <span className="px-2 py-0.5 rounded-full bg-primary-bg text-primary text-xs">重点场景</span>}
                </div>
                <a href={`/api/stories/${id}/export/markdown/${ch.chapter_number}`}
                  onClick={(e) => e.stopPropagation()}
                  title="导出此章"
                  className="text-text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100 p-1">
                  <Icon name="file" className="w-4 h-4" />
                </a>
                <button type="button"
                  onClick={() => startRename(ch)}
                  title="修改标题"
                  aria-label={`修改第${ch.chapter_number}章标题`}
                  className="text-text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100 p-1">
                  <Icon name="edit" className="w-4 h-4" />
                </button>
                <Link to={`/story/${id}/chapters/${ch.chapter_number}`}
                  title="打开章节"
                  aria-label={`打开第${ch.chapter_number}章`}
                  className="text-text-muted hover:text-primary transition-colors opacity-0 group-hover:opacity-100 p-1">
                  <Icon name="arrowRight" className="w-4 h-4" />
                </Link>
                <button type="button"
                  onClick={() => handleDelete(ch.chapter_number, ch.title)}
                  disabled={deleteMutation.isPending && deleteMutation.variables === ch.chapter_number}
                  title="删除此章"
                  aria-label={`删除第${ch.chapter_number}章`}
                  className="text-text-muted hover:text-danger disabled:opacity-40 transition-colors opacity-0 group-hover:opacity-100 p-1">
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
