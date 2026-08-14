/**
 * 章节 → rebook Book 桥接
 *
 * rebook 面向「整本电子书文件」解析，但我们的小说章节来自后端 API。
 * 这里把「故事 + 章节列表」构造成一个内存 Book：每个章节是一个 Section，
 * 正文按需通过 fetchChapter 拉取，产出 TextBlock[] 走 rebook 的高性能
 * Pretext 按行渲染管线（只渲染可见行，移动端友好）。
 *
 * 关键点：
 * - rebook 的 loadTextBlocks 优先调用 Section.getBlocks()，所以我们提供它。
 * - setStyles 会重新调用 getBlocks()，因此这里每次读取「当前排版偏好」
 *   （blockPrefs），字号/对齐等调节能实时生效。
 * - 段落/标题不烘焙 fontSize/lineHeight，字号调节时跟随渲染器 baseStyle。
 * - 中文段落加两字全角缩进（\u3000\u3000）。
 */
import type { Book, Section, TextBlock } from 'rebook'
import { BrowserDOMAdapter, extractDocumentBlocks, parseHTML } from 'rebook'
import { fetchChapter } from './api'
import type { Chapter, Story } from './types'

/** 排版偏好：getBlocks 每次调用都会读取 */
export interface BlockPrefs {
  align: 'justify' | 'left'
}
export const blockPrefs: BlockPrefs = { align: 'justify' }
export function setBlockPrefs(next: Partial<BlockPrefs>): void {
  Object.assign(blockPrefs, next)
}

const domAdapter = new BrowserDOMAdapter()

/** 章节正文缓存：setStyles 重排会再次调用 getBlocks，避免重复请求 */
const contentCache = new Map<string, Chapter>()

const looksLikeHtml = (text: string): boolean => /<\/?[a-zA-Z][^>]*>/.test(text)

function sanitizeHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/ on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 章节正文 → HTML（供 load() 使用） */
function contentToHtml(chapter: Chapter): string {
  const text = (chapter.content ?? '').trim()
  if (!text) return ''
  if (looksLikeHtml(text)) return sanitizeHtml(text)
  return text
    .split(/\n+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('')
}

/** 中文段落两字缩进 */
const INDENT = '\u3000\u3000'

/** 章节正文 → TextBlock[]（Pretext 渲染管线的输入） */
function buildBlocks(chapter: Chapter): TextBlock[] {
  const align = blockPrefs.align === 'justify' ? 'justify' : 'start'
  const blocks: TextBlock[] = []

  // 章标题：加粗居中，字号跟随正文（不烘焙 fontSize）
  if (chapter.title) {
    blocks.push({
      id: `title-${chapter.chapter_number}`,
      type: 'heading',
      attrs: { 'data-rebook-chapter-title': '1' },
      style: { fontWeight: '700', textAlign: 'center' },
      blockGapBefore: 0,
      blockGapAfter: 12,
      segments: [{ text: chapter.title }],
    })
  }

  const text = (chapter.content ?? '').trim()
  if (!text) return blocks

  if (looksLikeHtml(text)) {
    const nodes = parseHTML(contentToHtml(chapter), domAdapter)
    for (const b of extractDocumentBlocks(nodes, {})) {
      if (b.type === 'paragraph') {
        if (b.style) {
          b.style.textAlign = align
          delete b.style.fontSize
          delete b.style.lineHeight
        }
        const first = b.segments[0]
        if (first) first.text = INDENT + first.text
      } else if (b.type === 'heading') {
        if (b.style) {
          b.style.textAlign = 'center'
          delete b.style.fontSize
          delete b.style.lineHeight
        }
      }
      blocks.push(b)
    }
  } else {
    text
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean)
      .forEach((p, i) => {
        blocks.push({
          id: `p-${chapter.chapter_number}-${i}`,
          type: 'paragraph',
          style: { textAlign: align },
          blockGapAfter: 6,
          segments: [{ text: INDENT + p }],
        })
      })
  }
  return blocks
}

/** 把「故事 + 章节列表」构造成 rebook 可用的内存 Book */
export function buildBook(story: Story, chapters: Chapter[]): Book {
  const sections: Section[] = chapters.map(ch => {
    const cacheKey = `${story.id}:${ch.chapter_number}`
    const loadContent = async (): Promise<Chapter> => {
      const cached = contentCache.get(cacheKey)
      if (cached) return cached
      const fresh = await fetchChapter(story.id, ch.chapter_number)
      contentCache.set(cacheKey, fresh)
      return fresh
    }
    return {
      id: ch.chapter_number,
      size: ch.word_count || 0,
      format: 'xhtml',
      linear: 'yes',
      load: async () => contentToHtml(await loadContent()),
      loadText: async () => (await loadContent()).content?.replace(/<[^>]+>/g, '') ?? '',
      getBlocks: async () => buildBlocks(await loadContent()),
    }
  })

  const toc = chapters.map(ch => ({ label: ch.title, href: `c${ch.chapter_number}` }))

  return {
    dir: 'ltr',
    sections,
    toc,
    metadata: { title: story.title, identifier: story.id },
    resolveHref(href) {
      const m = /^c(\d+)$/.exec(href)
      if (!m) return null
      const idx = chapters.findIndex(c => c.chapter_number === Number(m[1]))
      return idx >= 0 ? { index: idx } : null
    },
    splitTOCHref(href) {
      const m = /^c(\d+)$/.exec(href)
      return m ? [Number(m[1]), null] : [href, null]
    },
    getTOCFragment() {
      return null
    },
  }
}
