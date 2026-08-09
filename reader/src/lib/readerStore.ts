/**
 * 阅读记录本地存储（localStorage）
 * - 每本书的阅读进度：最后章节 + 章节内滚动百分比
 * - 最后打开的书（用于书架默认回到上次位置）
 * - 阅读偏好设置
 */

export interface ReadProgress {
  /** 最后阅读的章节号 */
  chapter: number
  /** 章节内滚动百分比 0-1 */
  percent: number
  updatedAt: number
}

export type ReaderTheme = 'day' | 'sepia' | 'night' | 'system'
export type ReaderFont = 'serif' | 'sans'
export type ReaderAlign = 'justify' | 'left'

export interface ReaderSettings {
  fontSize: number
  lineHeight: number
  theme: ReaderTheme
  fontFamily: ReaderFont
  align: ReaderAlign
}

const PROGRESS_PREFIX = 'reader:progress:'
const LAST_STORY_KEY = 'reader:lastStory'
const SETTINGS_KEY = 'reader:settings'

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  lineHeight: 1.8,
  theme: 'system',
  fontFamily: 'serif',
  align: 'justify',
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式等场景静默失败 */
  }
}

export function loadProgress(storyId: string): ReadProgress | null {
  const raw = safeGet(`${PROGRESS_PREFIX}${storyId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ReadProgress
    if (typeof parsed.chapter !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function saveProgress(storyId: string, chapter: number, percent: number): void {
  safeSet(
    `${PROGRESS_PREFIX}${storyId}`,
    JSON.stringify({
      chapter,
      percent,
      updatedAt: Date.now(),
    } satisfies ReadProgress),
  )
}

export function getLastStoryId(): string | null {
  return safeGet(LAST_STORY_KEY)
}

export function setLastStoryId(storyId: string): void {
  safeSet(LAST_STORY_KEY, storyId)
}

export function loadSettings(): ReaderSettings {
  const raw = safeGet(SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReaderSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: ReaderSettings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(settings))
}
