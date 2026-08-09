import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getDatabase } from '../db/index.js'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface ChapterLink {
  url: string
  text: string
}

export interface SourceConfig {
  baseUrl: string
  linkPattern: string
  titleSelector: string
  contentSelectors: string[]
}

export interface ScrapeSourceRow {
  id: string
  name: string
  base_url: string
  link_pattern: string
  title_selector: string
  content_selectors: string
  enabled: number
  created_at: string
  updated_at: string
}

export interface ScrapeBookRow {
  id: string
  source_id: string
  title: string
  book_url: string
  story_id: string | null
  status: string
  total_chapters: number
  imported_chapters: number
  error: string
  created_at: string
  updated_at: string
}

export interface ScrapeTaskRow {
  id: string
  book_id: string
  status: string
  start_chapter: number
  total: number
  done: number
  failed: number
  current_title: string
  error: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const DEFAULT_SELECTORS = [
  '.article',
  '#content',
  '.content',
  '#chaptercontent',
  '.chapter-content',
  'div.read-content',
  '.read-content',
  'article',
]

export { DEFAULT_SELECTORS }

/** 相邻章节抓取间隔（防封） */
const DELAY_MS = Number(process.env.SCRAPE_DELAY_MS || 400)
/** 单请求超时 */
const TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS || 20000)
/** 失败重试次数 */
const RETRIES = Number(process.env.SCRAPE_RETRIES || 3)

class CancelError extends Error {
  constructor() {
    super('任务已取消')
    this.name = 'CancelError'
  }
}

function now(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// HTML 工具（自研轻量解析，原独立脚本同款逻辑）
// ---------------------------------------------------------------------------

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code)
  } catch {
    return '\uFFFD'
  }
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    mdash: '—', hellip: '…', ldquo: '\u201c', rdquo: '\u201d',
    lsquo: '\u2018', rsquo: '\u2019', middot: '·', times: '×',
  }
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => (name in named ? named[name] : m))
}

function extractText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** 找到匹配的闭合标签，返回 { inner, end }；fromIndex 为开始标签 “>” 之后的位置 */
function findMatchingClose(html: string, tag: string, fromIndex: number): { inner: string; end: number } | null {
  const openRe = new RegExp(`<${tag}\\b`, 'gi')
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi')
  openRe.lastIndex = fromIndex
  closeRe.lastIndex = fromIndex
  let depth = 1
  for (let guard = 0; guard < 100000; guard++) {
    const o = openRe.exec(html)
    const c = closeRe.exec(html)
    if (!c) return null
    if (o && o.index < c.index) {
      depth++
      openRe.lastIndex = o.index + 1
    } else {
      depth--
      if (depth === 0) return { inner: html.slice(fromIndex, c.index), end: c.index }
      closeRe.lastIndex = c.index + 1
    }
  }
  return null
}

/** 按简单选择器查找元素，返回其 innerHTML；支持 tag / #id / .class / tag#id / tag.class */
function findElement(html: string, selector: string): { inner: string } | null {
  const tagm = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/)
  const idm = selector.match(/#([A-Za-z0-9_-]+)/)
  const clm = selector.match(/\.([A-Za-z0-9_-]+)/)
  const tag = tagm ? tagm[1] : null
  const id = idm ? idm[1] : null
  const cls = clm ? clm[1] : null

  const openRe = new RegExp(`<(${tag || '[a-zA-Z][a-zA-Z0-9]*'})\\b([^>]*)>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = openRe.exec(html))) {
    const attrs = m[2]
    if (id && !new RegExp(`(?:^|\\s)id\\s*=\\s*["']${escapeRegExp(id)}["']`, 'i').test(attrs)) continue
    if (cls) {
      const cm = attrs.match(/class\s*=\s*["']([^"']*)["']/i)
      if (!cm || !cm[1].split(/\s+/).includes(cls)) continue
    }
    const res = findMatchingClose(html, m[1], openRe.lastIndex)
    if (!res) return null
    return { inner: res.inner }
  }
  return null
}

/** 提取所有指定标签的 innerHTML */
function findAllTagInner(html: string, tag: string): string[] {
  const out: string[] = []
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  let m: RegExpExecArray | null
  while ((m = openRe.exec(html))) {
    const res = findMatchingClose(html, tag, openRe.lastIndex)
    if (!res) break
    out.push(res.inner)
    openRe.lastIndex = res.end + 1
  }
  return out
}

/** 把元素的 innerHTML 转成可读文本（保留段落换行） */
export function innerHtmlToText(inner: string): string {
  let s = String(inner)
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  s = s.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|section|article)>/gi, '\n')
  s = s.replace(/<(br|hr)\s*\/?>/gi, '\n')
  s = s.replace(/<\/?[^>]+>/g, ' ')
  s = decodeEntities(s)
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 提取页面所有 <a> 链接 { href, text } */
function extractLinks(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = []
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const hrefM = m[1].match(/href\s*=\s*["']([^"']+)["']/i)
    if (!hrefM) continue
    const text = extractText(m[2])
    if (!text) continue
    out.push({ href: hrefM[1], text })
  }
  return out
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href
  } catch {
    return href
  }
}

// ---------------------------------------------------------------------------
// 网络抓取
// ---------------------------------------------------------------------------

async function fetchHtml(
  url: string,
  opts: { referer?: string; timeoutMs?: number; retries?: number } = {},
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_MS
  const retries = opts.retries ?? RETRIES
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  }
  if (opts.referer) headers.Referer = opts.referer

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = Buffer.from(await res.arrayBuffer())
      // 自动识别 charset（国内站点常见 gbk/gb2312）
      const head = buf.toString('latin1').slice(0, 2048)
      const meta = head.match(/charset\s*=\s*["']?\s*([\w-]+)/i)
      const charset = meta ? meta[1].toLowerCase() : 'utf-8'
      if (charset === 'utf-8' || charset === 'utf8') return buf.toString('utf8')
      try {
        return new TextDecoder(charset === 'gb2312' ? 'gbk' : charset).decode(buf)
      } catch {
        return buf.toString('utf8')
      }
    } catch (err) {
      lastError = err
      if (attempt < retries) await sleep(1500 * (attempt + 1))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`抓取失败(${url}): ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

// ---------------------------------------------------------------------------
// 内容解析
// ---------------------------------------------------------------------------

function isChapterLink(link: { href: string; text: string }, pattern: string): boolean {
  if (pattern) {
    try {
      return new RegExp(pattern, 'i').test(link.href)
    } catch {
      return false
    }
  }
  return /^第\s*[0-9零一二三四五六七八九十百千万两]+\s*章/.test(link.text)
}

export function extractChapterList(html: string, pattern: string, baseUrl: string): ChapterLink[] {
  const seen = new Set<string>()
  const chapters: ChapterLink[] = []
  for (const link of extractLinks(html)) {
    if (!isChapterLink(link, pattern)) continue
    const href = resolveUrl(baseUrl, link.href)
    if (seen.has(href)) continue
    seen.add(href)
    chapters.push({ url: href, text: link.text })
  }
  return chapters
}

export function extractChapterTitle(html: string, selector: string): string {
  if (selector) {
    const el = findElement(html, selector)
    if (el) {
      const t = innerHtmlToText(el.inner)
      if (t) return t
    }
  }
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (tm) {
    const t = extractText(tm[1]).replace(/[_-].*$/, '').trim()
    if (t) return t
  }
  return ''
}

export function extractChapterContent(html: string, selectors: string[]): string {
  for (const selector of selectors) {
    const el = findElement(html, selector)
    if (!el) continue
    const text = innerHtmlToText(el.inner)
    if (text.length >= 100) return text
  }
  // 回退：把所有 <p> 段落拼起来
  const paragraphs = findAllTagInner(html, 'p')
    .map((inner) => innerHtmlToText(inner))
    .filter(Boolean)
  if (paragraphs.join('').length >= 100) return paragraphs.join('\n\n')
  return ''
}

/** 从站点配置生成解析参数 */
export function sourceConfig(source: ScrapeSourceRow): SourceConfig {
  let selectors = DEFAULT_SELECTORS
  try {
    const parsed = JSON.parse(source.content_selectors || '[]')
    if (Array.isArray(parsed) && parsed.length > 0) selectors = parsed.map((x) => String(x))
  } catch {
    /* 保持默认 */
  }
  return {
    baseUrl: source.base_url,
    linkPattern: source.link_pattern || '',
    titleSelector: source.title_selector || 'h2',
    contentSelectors: selectors,
  }
}

/** 扫描一本书：抓目录页，返回章节数量与预览 */
export async function scanBook(
  config: SourceConfig,
  bookUrl: string,
): Promise<{ count: number; title: string; sample: ChapterLink[] }> {
  const html = await fetchHtml(bookUrl)
  const chapters = extractChapterList(html, config.linkPattern, bookUrl)
  const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = tm ? extractText(tm[1]).replace(/[_-].*$/, '').trim() : ''
  return { count: chapters.length, title, sample: chapters.slice(0, 10) }
}

// ---------------------------------------------------------------------------
// 入库
// ---------------------------------------------------------------------------

export function ensureStory(title: string): string {
  const db = getDatabase()
  const existing = db.prepare('SELECT id FROM stories WHERE title = ?').get(title) as { id: string } | undefined
  if (existing) return existing.id

  const id = randomUUID()
  db.prepare(
    `INSERT INTO stories (id, title, genre, rating, status) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, title, 'school', 'nsfw', 'in-progress')

  // 与 stories 路由一致：创建输出目录
  try {
    const dataDir = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), '..', 'story-output'))
    const storyDir = path.join(dataDir, id)
    fs.mkdirSync(path.join(storyDir, 'chapters'), { recursive: true })
    fs.mkdirSync(path.join(storyDir, 'characters'), { recursive: true })
  } catch {
    /* 目录创建失败不影响入库 */
  }
  return id
}

export function upsertChapter(storyId: string, number: number, title: string, content: string): void {
  const db = getDatabase()
  const wordCount = content.length
  const existing = db.prepare('SELECT id FROM chapters WHERE story_id = ? AND chapter_number = ?').get(storyId, number)
  if (existing) {
    db.prepare(
      `UPDATE chapters SET title = ?, content = ?, status = 'final', word_count = ?, scene_type = 'normal', updated_at = datetime('now')
       WHERE story_id = ? AND chapter_number = ?`,
    ).run(title, content, wordCount, storyId, number)
  } else {
    db.prepare(
      `INSERT INTO chapters (id, story_id, chapter_number, title, content, status, word_count, scene_type)
       VALUES (?, ?, ?, ?, ?, 'final', ?, 'normal')`,
    ).run(randomUUID(), storyId, number, title, content, wordCount)
  }
  db.prepare("UPDATE stories SET updated_at = datetime('now') WHERE id = ?").run(storyId)
}

// ---------------------------------------------------------------------------
// 任务执行主循环
// ---------------------------------------------------------------------------

/**
 * 执行一次抓取任务（前台调用方负责放入后台运行）。
 * 通过 isCancelled 回调支持取消；所有进度直接写入数据库。
 */
export async function runScrapeTask(taskId: string, isCancelled: () => boolean): Promise<void> {
  const db = getDatabase()
  const task = db.prepare('SELECT * FROM scrape_tasks WHERE id = ?').get(taskId) as ScrapeTaskRow | undefined
  if (!task) return
  const book = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(task.book_id) as ScrapeBookRow
  const source = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(book.source_id) as ScrapeSourceRow
  const config = sourceConfig(source)

  const patchTask = (fields: Record<string, unknown>) => {
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE scrape_tasks SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
      ...Object.values(fields), taskId,
    )
  }
  const patchBook = (fields: Record<string, unknown>) => {
    const sets = Object.keys(fields).map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE scrape_books SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
      ...Object.values(fields), book.id,
    )
  }

  try {
    patchBook({ status: 'scraping', error: '' })
    patchTask({ status: 'running', current_title: '', started_at: now() })

    // 1. 抓目录页，识别章节
    const listHtml = await fetchHtml(book.book_url)
    const chapters = extractChapterList(listHtml, config.linkPattern, book.book_url)
    if (chapters.length === 0) {
      throw new Error('未从目录页识别到任何章节链接，请检查该源的 linkPattern')
    }
    patchTask({ total: chapters.length })
    patchBook({ total_chapters: chapters.length })

    // 2. 确保故事存在
    const storyId = ensureStory(book.title)
    patchBook({ story_id: storyId })

    // 3. 已存在的章节号
    const existingNumbers = new Set(
      (db.prepare('SELECT chapter_number FROM chapters WHERE story_id = ?').all(storyId) as Array<{ chapter_number: number }>)
        .map((c) => c.chapter_number),
    )

    const startIndex = Math.max(0, (task.start_chapter || 1) - 1)
    let done = 0
    let failed = 0

    for (let i = startIndex; i < chapters.length; i++) {
      if (isCancelled()) throw new CancelError()
      const number = i + 1
      const link = chapters[i]

      if (existingNumbers.has(number)) {
        done++
        patchTask({ done })
        continue
      }

      try {
        const html = await fetchHtml(link.url, { referer: book.book_url })
        const title = extractChapterTitle(html, config.titleSelector) || link.text || `第${number}章`
        const content = extractChapterContent(html, config.contentSelectors)
        if (!content) {
          failed++
          patchTask({ failed })
          continue
        }
        upsertChapter(storyId, number, title, content)
        done++
        patchTask({ done, current_title: title })
        patchBook({ imported_chapters: done })
        if (DELAY_MS > 0) await sleep(DELAY_MS)
      } catch {
        failed++
        patchTask({ failed })
      }
    }

    patchTask({
      status: 'completed', done, failed, current_title: '', finished_at: now(),
      error: failed > 0 ? `${failed} 章失败` : '',
    })
    patchBook({
      status: 'done',
      imported_chapters: done,
      error: failed > 0 ? `${failed} 章失败` : '',
    })
  } catch (err) {
    if (err instanceof CancelError) {
      patchTask({ status: 'cancelled', current_title: '', finished_at: now() })
      patchBook({ status: 'idle', error: '任务已取消' })
    } else {
      const msg = err instanceof Error ? err.message : String(err)
      patchTask({ status: 'failed', error: msg, current_title: '', finished_at: now() })
      patchBook({ status: 'failed', error: msg })
    }
  }
}
