import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStories, getApiErrorMessage } from '../lib/api'
import type { Story } from '../lib/types'
import { getLastStoryId, loadProgress } from '../lib/readerStore'

const GRADIENTS = [
  'linear-gradient(135deg,#c9a87e,#8a6a46)',
  'linear-gradient(135deg,#8aa87e,#55704b)',
  'linear-gradient(135deg,#7fa0b8,#4a6b82)',
  'linear-gradient(135deg,#b88a7a,#7a5246)',
  'linear-gradient(135deg,#9b8ab8,#62507d)',
  'linear-gradient(135deg,#a8a07e,#6b6350)',
]

function hashId(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function formatWords(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万字`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k 字`
  return `${n} 字`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const day = 24 * 3600 * 1000
  if (diff < day) return '今天'
  if (diff < 2 * day) return '昨天'
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return d.toLocaleDateString('zh-CN')
}

export default function BooksPage() {
  const navigate = useNavigate()
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastStoryId] = useState(() => getLastStoryId())

  async function load() {
    setLoading(true)
    setError('')
    try {
      setStories(await fetchStories())
    } catch (e) {
      setError(getApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <div className="min-h-screen bg-bg-dark">
      {/* 顶部标题栏 */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg-dark/95 backdrop-blur px-4 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between">
          <h1 className="text-xl font-bold text-text-primary">书架</h1>
          <span className="text-sm text-text-muted">{stories.length} 本</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-8">
        {loading && stories.length === 0 && (
          <div className="space-y-3 pt-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex animate-pulse gap-4 rounded-xl border border-border bg-bg-card p-4">
                <div className="h-20 w-14 rounded bg-border" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-border" />
                  <div className="h-3 w-1/3 rounded bg-border" />
                  <div className="h-3 w-1/2 rounded bg-border" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            <p className="mb-2">加载书架失败：{error}</p>
            <button
              onClick={() => void load()}
              className="rounded-lg bg-red-500 px-4 py-1.5 text-white active:opacity-80"
            >
              重试
            </button>
          </div>
        )}

        {!loading && !error && stories.length === 0 && (
          <div className="mt-16 text-center text-text-muted">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-card text-4xl">📖</div>
            <p className="text-base">书架空空如也</p>
            <p className="mt-1 text-sm">请先在工作台创建或导入小说</p>
          </div>
        )}

        <div className="space-y-3 pt-4">
          {stories.map(story => {
            const progress = loadProgress(story.id)
            const isLast = story.id === lastStoryId && progress != null
            const continueNum = progress?.chapter ?? 1
            const percent = story.chapter_count > 0 ? Math.min(1, continueNum / story.chapter_count) : 0
            const gradient = GRADIENTS[hashId(story.id) % GRADIENTS.length]

            return (
              <button
                key={story.id}
                onClick={() => navigate(`/${story.id}`)}
                className="flex w-full gap-4 rounded-xl border border-border bg-bg-card p-4 text-left shadow-md transition active:scale-[0.99]"
              >
                {/* 封面占位 */}
                <div
                  className="flex h-24 w-[4.5rem] shrink-0 items-center justify-center rounded-lg text-2xl font-bold text-white/95 shadow-md"
                  style={{ background: gradient }}
                >
                  {story.title.slice(0, 1)}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-base font-semibold text-text-primary">{story.title}</h2>
                    {isLast && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary-dark">
                        最近在读
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-text-muted">
                    {story.chapter_count} 章 · {formatWords(story.total_words)}
                  </p>

                  {progress ? (
                    <div className="mt-auto">
                      <p className="text-xs font-medium text-primary-dark">
                        继续阅读 · 第 {continueNum} 章
                      </p>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent * 100}%` }} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-auto">
                      <p className="text-xs font-medium text-primary-dark">开始阅读</p>
                      <div className="mt-1.5 h-1.5 rounded-full bg-border" />
                    </div>
                  )}

                  <p className="mt-2 text-[11px] text-text-muted">
                    更新于 {formatTime(story.updated_at)}
                    {progress && ` · 上次读到 ${new Date(progress.updatedAt).toLocaleDateString('zh-CN')}`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
