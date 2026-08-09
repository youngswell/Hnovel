import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import pkg from '../../package.json'
import { fetchChapter, fetchChapters, fetchStory, getApiErrorMessage } from '../lib/api'
import type { Chapter, Story } from '../lib/types'
import {
  loadProgress,
  loadSettings,
  saveProgress,
  saveSettings,
  setLastStoryId,
} from '../lib/readerStore'
import type { ReaderSettings } from '../lib/readerStore'
import TocDrawer from '../components/TocDrawer'
import SettingsSheet from '../components/SettingsSheet'

export default function ReaderPage() {
  const { storyId = '', chapterNumber } = useParams()
  const navigate = useNavigate()

  const [story, setStory] = useState<Story | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [initLoading, setInitLoading] = useState(true)
  const [chapterLoading, setChapterLoading] = useState(false)
  const [error, setError] = useState('')

  const [activeNum, setActiveNum] = useState<number | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nearBottom, setNearBottom] = useState(false)
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings())

  const scrollRef = useRef<HTMLDivElement>(null)
  const targetPercentRef = useRef(0)
  const saveTimerRef = useRef<number | undefined>(undefined)

  // 加载书籍信息 + 目录
  useEffect(() => {
    let cancelled = false
    setInitLoading(true)
    setError('')
    setLastStoryId(storyId)
    Promise.all([fetchStory(storyId), fetchChapters(storyId)])
      .then(([s, chs]) => {
        if (cancelled) return
        setStory(s)
        setChapters(chs)
      })
      .catch(e => {
        if (!cancelled) setError(getApiErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setInitLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storyId])

  const activeIndex = chapters.findIndex(c => c.chapter_number === activeNum)

  // 决定当前章节：URL 指定优先，否则回到上次进度
  useEffect(() => {
    if (chapters.length === 0) return
    if (chapterNumber != null) {
      targetPercentRef.current = 0
      setActiveNum(Number(chapterNumber))
      return
    }
    const prog = loadProgress(storyId)
    const num =
      prog && chapters.some(c => c.chapter_number === prog.chapter)
        ? prog.chapter
        : (chapters[0]?.chapter_number ?? 1)
    targetPercentRef.current = prog ? prog.percent : 0
    setActiveNum(num)
  }, [storyId, chapterNumber, chapters])

  // 加载当前章节正文
  useEffect(() => {
    if (activeNum == null) return
    let cancelled = false
    setChapterLoading(true)
    setError('')
    fetchChapter(storyId, activeNum)
      .then(c => {
        if (!cancelled) setChapter(c)
      })
      .catch(e => {
        if (!cancelled) setError(getApiErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setChapterLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [storyId, activeNum])

  // 章节加载完成后恢复滚动位置
  useEffect(() => {
    if (!chapter || chapterLoading) return
    const el = scrollRef.current
    if (!el) return
    const percent = targetPercentRef.current
    const raf = requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight
      el.scrollTop = max > 0 ? max * percent : 0
    })
    return () => cancelAnimationFrame(raf)
  }, [chapter?.id, chapterLoading])

  // 滚动时保存进度（防抖），并感知是否接近底部
  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || activeNum == null) return
    const max = el.scrollHeight - el.clientHeight
    const p = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0
    const near = max > 0 && el.scrollTop >= max - 140
    setNearBottom(prev => (prev === near ? prev : near))
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveProgress(storyId, activeNum, p)
    }, 400)
  }, [storyId, activeNum])

  // 主题应用到 body：system 跟随系统深浅色，并实时监听系统变化
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved =
        settings.theme === 'system' ? (mq.matches ? 'night' : 'day') : settings.theme
      document.body.dataset.theme = resolved
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  // 浏览器页签标题
  useEffect(() => {
    document.title = `${pkg.name} - ${story ? story.title : '阅读'}`
  }, [story?.title])

  // 卸载时冲刷待保存的进度
  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimerRef.current)
    }
  }, [])

  const goChapter = useCallback(
    (num: number) => {
      if (!chapters.some(c => c.chapter_number === num)) return
      navigate(`/${storyId}/${num}`)
    },
    [chapters, navigate, storyId],
  )

  const goPrev = useCallback(() => {
    if (activeIndex <= 0) return
    goChapter(chapters[activeIndex - 1].chapter_number)
  }, [activeIndex, chapters, goChapter])

  const goNext = useCallback(() => {
    if (activeIndex < 0 || activeIndex >= chapters.length - 1) return
    goChapter(chapters[activeIndex + 1].chapter_number)
  }, [activeIndex, chapters, goChapter])

  // 点击区域：左 18% 上一章 / 右 18% 下一章 / 中间呼出菜单
  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (menuVisible || tocOpen || settingsOpen) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const w = rect.width
      if (x < w * 0.18) goPrev()
      else if (x > w * 0.82) goNext()
      else setMenuVisible(true)
    },
    [menuVisible, tocOpen, settingsOpen, goPrev, goNext],
  )

  const handleSelectChapter = useCallback(
    (num: number) => {
      setTocOpen(false)
      setMenuVisible(false)
      goChapter(num)
    },
    [goChapter],
  )

  const updateSettings = useCallback((next: ReaderSettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const body = useCallback(() => {
    const text = chapter?.content?.trim()
    if (chapterLoading) {
      return <p className="reader-empty">加载中…</p>
    }
    if (!text) {
      return <p className="reader-empty">本章暂无内容</p>
    }
    const looksLikeHtml = /<\/?[a-zA-Z][^>]*>/.test(text)
    if (looksLikeHtml) {
      const clean = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
        .replace(/ on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      return <div dangerouslySetInnerHTML={{ __html: clean }} />
    }
    return text
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map((p, i) => <p key={i}>{p}</p>)
  }, [chapter?.content, chapterLoading])

  if (initLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-dark text-text-muted">
        <p>正在打开…</p>
      </div>
    )
  }

  if (error && !chapter) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg-dark px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={() => navigate('/')} className="rounded-lg bg-primary px-4 py-2 text-sm text-white">
          返回书架
        </button>
      </div>
    )
  }

  const styleVars = {
    '--reader-font-size': `${settings.fontSize}px`,
    '--reader-line-height': String(settings.lineHeight),
    '--reader-align': settings.align,
  } as React.CSSProperties

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: 'var(--reader-bg)' }}>
      {/* 正文滚动区域 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleTap}
        className="h-dvh overflow-y-auto overscroll-contain px-5 pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
      >
        <div
          className={`reader-content mx-auto max-w-2xl ${settings.fontFamily === 'serif' ? 'serif' : ''}`}
          style={styleVars}
        >
          {chapter && <h1 className="chapter-title">{chapter.title}</h1>}
          {body()}
        </div>
      </div>

      {/* 菜单遮罩 */}
      {menuVisible && <div className="fixed inset-0 z-30 animate-fade-in" onClick={() => setMenuVisible(false)} />}

      {/* 顶栏 */}
      {menuVisible && (
        <header
          className="fixed inset-x-0 top-0 z-40 animate-slide-down"
          style={{ background: 'var(--reader-topbar)' }}
        >
          <div className="flex h-14 items-center gap-1 px-3 pt-[env(safe-area-inset-top)] text-white">
            <button onClick={() => navigate('/')} className="px-2 py-1 text-2xl leading-none" aria-label="返回书架">
              ‹
            </button>
            <button onClick={() => setTocOpen(true)} className="shrink-0 px-2 py-1 text-sm" aria-label="目录">
              目录
            </button>
            <h1 className="min-w-0 flex-1 truncate px-1 text-center text-base">{story?.title ?? ''}</h1>
            <button onClick={() => setSettingsOpen(true)} className="shrink-0 px-2 py-1 text-sm" aria-label="设置">
              Aa
            </button>
            <button onClick={() => setMenuVisible(false)} className="shrink-0 px-2 py-1 text-lg" aria-label="关闭">
              ✕
            </button>
          </div>
        </header>
      )}

      {/* 底栏 */}
      {menuVisible && (
        <footer
          className="fixed inset-x-0 bottom-0 z-40 animate-slide-up"
          style={{ background: 'var(--reader-topbar)' }}
        >
          <div className="flex h-14 items-center justify-between px-4 pb-[env(safe-area-inset-bottom)] text-sm text-white">
            <button onClick={goPrev} disabled={activeIndex <= 0} className="px-3 py-2 disabled:opacity-30">
              上一章
            </button>
            <span className="text-xs opacity-80">
              {activeIndex >= 0 ? `${activeIndex + 1} / ${chapters.length}` : ''}
            </span>
            <button
              onClick={goNext}
              disabled={activeIndex >= chapters.length - 1}
              className="px-3 py-2 disabled:opacity-30"
            >
              下一章
            </button>
          </div>
        </footer>
      )}

      {/* 接近章末时提示下一章 */}
      {!menuVisible && nearBottom && activeIndex >= 0 && activeIndex < chapters.length - 1 && (
        <button
          onClick={goNext}
          className="fixed inset-x-0 z-20 mx-auto w-fit rounded-full bg-black/60 px-5 py-2 text-xs text-white backdrop-blur active:opacity-80"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
        >
          下一章 ↓
        </button>
      )}

      <TocDrawer
        open={tocOpen}
        title={story?.title ?? ''}
        chapters={chapters}
        activeNum={activeNum}
        onSelect={handleSelectChapter}
        onClose={() => setTocOpen(false)}
      />
      <SettingsSheet
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  )
}
