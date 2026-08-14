import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import pkg from '../../package.json'
import type { ReaderView, RelocateEvent } from 'rebook'
import { createReader } from 'rebook'
import { fetchChapters, fetchStory, getApiErrorMessage } from '../lib/api'
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
import { buildBook, setBlockPrefs } from '../lib/rebookBook'

/** 主题解析：system 跟随系统深浅色 */
function resolveThemeName(theme: ReaderSettings['theme']): 'day' | 'sepia' | 'night' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day'
}

const THEME_STYLES: Record<
  'day' | 'sepia' | 'night',
  { color: string; background: string; pageBackground: string; accentColor: string }
> = {
  day: { color: '#2c2416', background: '#f5f2ed', pageBackground: '#f5f2ed', accentColor: '#b8956a' },
  sepia: { color: '#4a3f2e', background: '#f3ead8', pageBackground: '#f3ead8', accentColor: '#b8956a' },
  night: { color: '#b6b1a8', background: '#111111', pageBackground: '#111111', accentColor: '#c9a87e' },
}

function buildRendererStyles(settings: ReaderSettings) {
  const resolved = resolveThemeName(settings.theme)
  const t = THEME_STYLES[resolved]
  return {
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineHeight,
    textAlign: settings.align === 'justify' ? 'justify' : 'start',
    fontFamily:
      settings.fontFamily === 'serif'
        ? 'Georgia, "Noto Serif SC", "Songti SC", "STSong", "SimSun", serif'
        : 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
    color: t.color,
    background: t.background,
    pageBackground: t.pageBackground,
    theme: {
      color: t.color,
      background: t.background,
      pageBackground: t.pageBackground,
      pageShadow: 'none',
      accentColor: t.accentColor,
    },
  }
}

export default function ReaderPage() {
  const { storyId = '', chapterNumber } = useParams()
  const navigate = useNavigate()

  const [story, setStory] = useState<Story | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [initLoading, setInitLoading] = useState(true)
  const [error, setError] = useState('')

  const [activeIndex, setActiveIndex] = useState(0)
  const [nearEnd, setNearEnd] = useState(false)
  const [menuVisible, setMenuVisible] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings())

  const containerRef = useRef<HTMLDivElement>(null)
  const readerRef = useRef<ReaderView | null>(null)
  const readyRef = useRef(false)
  const storyRef = useRef<Story | null>(null)
  const chaptersRef = useRef<Chapter[]>([])
  const settingsRef = useRef(settings)
  const saveTimerRef = useRef<number | undefined>(undefined)

  settingsRef.current = settings

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
        storyRef.current = s
        chaptersRef.current = chs
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

  // 保存进度（防抖），章节内百分比 0-1
  const scheduleSave = useCallback((index: number, fraction: number) => {
    const story = storyRef.current
    const chapters = chaptersRef.current
    if (!story) return
    const ch = chapters[index]
    if (!ch) return
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveProgress(story.id, ch.chapter_number, fraction)
    }, 400)
  }, [])

  // 初始化 rebook 阅读器（story + chapters 就绪后执行一次）
  useEffect(() => {
    if (!story || chapters.length === 0) return
    if (readerRef.current) return
    const container = containerRef.current
    if (!container) return

    const reader = createReader({
      container,
      layout: 'paginated',
      maxColumnCount: 1,
      animated: true,
      styles: buildRendererStyles(settingsRef.current),
    })
    readerRef.current = reader

    const onRelocate = (e: RelocateEvent) => {
      const total = chaptersRef.current.length
      setActiveIndex(e.index)
      setNearEnd(e.fraction >= 0.98 && e.index < total - 1)
      scheduleSave(e.index, e.fraction)
    }
    reader.on('relocate', onRelocate)

    const book = buildBook(story, chapters)
    reader
      .openBook(book)
      .then(() => {
        readyRef.current = true
        // 决定初始位置：URL 指定章节 > 上次进度 > 第一章
        if (chapterNumber != null) {
          const idx = chapters.findIndex(c => c.chapter_number === Number(chapterNumber))
          return reader.goTo(idx >= 0 ? idx : 0)
        }
        const prog = loadProgress(story.id)
        if (prog && chapters.some(c => c.chapter_number === prog.chapter)) {
          const idx = chapters.findIndex(c => c.chapter_number === prog.chapter)
          return reader.goToFraction((idx + (prog.percent || 0)) / chapters.length)
        }
        return reader.goTo(0)
      })
      .catch((e: unknown) => {
        console.error('rebook openBook failed', e)
        readyRef.current = true
      })

    return () => {
      readyRef.current = false
      reader.off('relocate', onRelocate)
      try {
        reader.destroy()
      } catch {
        /* 忽略销毁异常 */
      }
      readerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story, chapters])

  // URL 章节号变化 → 直接翻到对应章节（不重建 reader）
  useEffect(() => {
    if (!readyRef.current || chapterNumber == null) return
    const reader = readerRef.current
    const chapters = chaptersRef.current
    if (!reader) return
    const idx = chapters.findIndex(c => c.chapter_number === Number(chapterNumber))
    if (idx >= 0) void reader.goTo(idx)
  }, [chapterNumber])

  // 设置变化 → 应用到 rebook（并同步 block 排版偏好）
  useEffect(() => {
    setBlockPrefs({ align: settings.align })
    const reader = readerRef.current
    if (!reader) return
    reader.setStyles(buildRendererStyles(settings))
  }, [settings])

  // 主题应用到 body（控制菜单/抽屉等 UI 配色）+ system 实时监听
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

  // 桌面端方向键翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menuVisible || tocOpen || settingsOpen) return
      const reader = readerRef.current
      if (!reader) return
      if (e.key === 'ArrowLeft') void reader.prev()
      else if (e.key === 'ArrowRight') void reader.next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuVisible, tocOpen, settingsOpen])

  const activeNum = activeIndex >= 0 ? chapters[activeIndex]?.chapter_number ?? null : null

  const goChapter = useCallback(
    (num: number) => {
      if (!chaptersRef.current.some(c => c.chapter_number === num)) return
      navigate(`/${storyId}/${num}`)
    },
    [navigate, storyId],
  )

  const goPrevChapter = useCallback(() => {
    if (activeIndex <= 0) return
    goChapter(chapters[activeIndex - 1].chapter_number)
  }, [activeIndex, chapters, goChapter])

  const goNextChapter = useCallback(() => {
    if (activeIndex < 0 || activeIndex >= chapters.length - 1) return
    goChapter(chapters[activeIndex + 1].chapter_number)
  }, [activeIndex, chapters, goChapter])

  // 点击区域：左 18% 上一页 / 右 18% 下一页 / 中间呼出菜单
  const handleTap = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (menuVisible || tocOpen || settingsOpen) return
      const reader = readerRef.current
      if (!reader) return
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const w = rect.width
      if (x < w * 0.18) void reader.prev()
      else if (x > w * 0.82) void reader.next()
      else setMenuVisible(true)
    },
    [menuVisible, tocOpen, settingsOpen],
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

  const resolvedTheme = resolveThemeName(settings.theme)

  if (initLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-dark text-text-muted">
        <p>正在打开…</p>
      </div>
    )
  }

  if (error && !story) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg-dark px-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-white"
        >
          返回书架
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={{ backgroundColor: THEME_STYLES[resolvedTheme].background }}
    >
      {/* rebook 渲染容器 */}
      <div ref={containerRef} className="h-full w-full" onClick={handleTap} />

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
            <div className="min-w-0 flex-1 px-1 text-center">
              <h1 className="truncate text-base">{story?.title ?? ''}</h1>
              {activeNum != null && (
                <p className="truncate text-[11px] opacity-70">{chapters[activeIndex]?.title}</p>
              )}
            </div>
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
            <button
              onClick={goPrevChapter}
              disabled={activeIndex <= 0}
              className="px-3 py-2 disabled:opacity-30"
            >
              上一章
            </button>
            <span className="text-xs opacity-80">
              {chapters.length > 0 ? `第 ${activeNum ?? '—'} 章 · ${activeIndex + 1} / ${chapters.length}` : ''}
            </span>
            <button
              onClick={goNextChapter}
              disabled={activeIndex >= chapters.length - 1}
              className="px-3 py-2 disabled:opacity-30"
            >
              下一章
            </button>
          </div>
        </footer>
      )}

      {/* 接近章末时提示下一章 */}
      {!menuVisible && nearEnd && (
        <button
          onClick={goNextChapter}
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
