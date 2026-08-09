import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { getDatabase } from '../db/index.js'
import { validateBody } from '../middleware/validation.js'
import {
  DEFAULT_SELECTORS,
  scanBook,
  sourceConfig,
  type ScrapeBookRow,
  type ScrapeSourceRow,
  type SourceConfig,
} from '../scrape/engine.js'
import { cancelTask, isRunning, startTask } from '../scrape/taskManager.js'

export const scrapeRouter = Router()

interface ScrapeTaskRow {
  id: string
  book_id: string
  status: string
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

const sourceSchema = z.object({
  name: z.string().trim().min(1, '源名称不能为空').max(100),
  base_url: z.string().trim().min(1, '站点地址不能为空').max(500),
  link_pattern: z.string().max(500).optional().default(''),
  title_selector: z.string().max(100).optional().default('h2'),
  content_selectors: z.array(z.string().max(200)).max(30).optional(),
  enabled: z.boolean().optional().default(true),
})

const bookSchema = z.object({
  source_id: z.string().trim().min(1, '请选择网站源'),
  title: z.string().trim().min(1, '书名不能为空').max(200),
  book_url: z.string().trim().min(1, '目录页地址不能为空').max(500),
})

const taskCreateSchema = z.object({
  book_id: z.string().trim().min(1),
  start_chapter: z.number().int().positive().optional().default(1),
})

const previewSchema = z.object({
  book_url: z.string().trim().min(1, '目录页地址不能为空').max(500),
  link_pattern: z.string().max(500).optional().default(''),
  title_selector: z.string().max(100).optional().default('h2'),
  content_selectors: z.array(z.string().max(200)).max(30).optional(),
})

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function parseSelectors(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x))
  return []
}

function buildConfig(body: {
  link_pattern?: string
  title_selector?: string
  content_selectors?: string[]
}, baseUrl = ''): SourceConfig {
  return {
    baseUrl,
    linkPattern: body.link_pattern || '',
    titleSelector: body.title_selector || 'h2',
    contentSelectors: parseSelectors(body.content_selectors).length
      ? parseSelectors(body.content_selectors)
      : DEFAULT_SELECTORS,
  }
}

function hasRunningTask(bookId: string): boolean {
  const db = getDatabase()
  const tasks = db.prepare('SELECT id, status FROM scrape_tasks WHERE book_id = ?').all(bookId) as Array<{ id: string; status: string }>
  return tasks.some((t) => isRunning(t.id) || t.status === 'queued' || t.status === 'running')
}

/** 把源行转为前端友好的 DTO（解析 content_selectors JSON） */
function sourceDto(row: Record<string, unknown>): Record<string, unknown> {
  let selectors: string[] = []
  try {
    const parsed = JSON.parse(String(row.content_selectors || '[]'))
    if (Array.isArray(parsed)) selectors = parsed.map((x) => String(x))
  } catch {
    /* 保持空数组 */
  }
  return { ...row, content_selectors: selectors }
}

// ---------------------------------------------------------------------------
// 网站源 CRUD
// ---------------------------------------------------------------------------

scrapeRouter.get('/sources', (_req: Request, res: Response) => {
  const db = getDatabase()
  const sources = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM scrape_books b WHERE b.source_id = s.id) AS book_count
    FROM scrape_sources s
    ORDER BY s.created_at DESC
  `).all() as Array<Record<string, unknown>>
  res.json(sources.map(sourceDto))
})

scrapeRouter.post('/sources', validateBody(sourceSchema), (req: Request, res: Response) => {
  const db = getDatabase()
  const id = randomUUID()
  db.prepare(`
    INSERT INTO scrape_sources (id, name, base_url, link_pattern, title_selector, content_selectors, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.body.name, req.body.base_url, req.body.link_pattern,
    req.body.title_selector, JSON.stringify(req.body.content_selectors || DEFAULT_SELECTORS),
    req.body.enabled ? 1 : 0,
  )
  const row = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json(sourceDto(row))
})

scrapeRouter.put('/sources/:id', validateBody(sourceSchema.partial()), (req: Request, res: Response) => {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(String(req.params.id)) as ScrapeSourceRow | undefined
  if (!existing) return res.status(404).json({ error: '网站源不存在', code: 'NOT_FOUND' })

  const fields: string[] = []
  const values: unknown[] = []
  const allowed = ['name', 'base_url', 'link_pattern', 'title_selector', 'content_selectors', 'enabled'] as const
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      if (field === 'content_selectors') {
        fields.push('content_selectors = ?')
        values.push(JSON.stringify(req.body[field]))
      } else if (field === 'enabled') {
        fields.push('enabled = ?')
        values.push(req.body[field] ? 1 : 0)
      } else {
        fields.push(`${field} = ?`)
        values.push(req.body[field])
      }
    }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    values.push(String(req.params.id))
    db.prepare(`UPDATE scrape_sources SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  const row = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(String(req.params.id)) as Record<string, unknown>
  res.json(sourceDto(row))
})

scrapeRouter.delete('/sources/:id', (req: Request, res: Response) => {
  const db = getDatabase()
  const source = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(String(req.params.id)) as ScrapeSourceRow | undefined
  if (!source) return res.status(404).json({ error: '网站源不存在', code: 'NOT_FOUND' })

  const runningBook = db.prepare(
    'SELECT b.id FROM scrape_books b WHERE b.source_id = ?',
  ).all(String(req.params.id)) as Array<{ id: string }>
  if (runningBook.some((b) => hasRunningTask(b.id))) {
    return res.status(409).json({ error: '该源下仍有书籍在抓取，请先取消相关任务', code: 'TASK_RUNNING' })
  }
  db.prepare('DELETE FROM scrape_sources WHERE id = ?').run(String(req.params.id))
  res.json({ deleted: true })
})

// 用给定配置预览某个目录页，验证源识别是否正确
scrapeRouter.post('/sources/preview', validateBody(previewSchema), async (req: Request, res: Response) => {
  try {
    const config = buildConfig(req.body)
    const result = await scanBook(config, req.body.book_url)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message || '预览失败', code: 'SCAN_FAILED' })
  }
})

// ---------------------------------------------------------------------------
// 已抓取书 CRUD
// ---------------------------------------------------------------------------

scrapeRouter.get('/books', (_req: Request, res: Response) => {
  const db = getDatabase()
  const books = db.prepare(`
    SELECT b.*, s.name AS source_name, st.title AS story_title
    FROM scrape_books b
    LEFT JOIN scrape_sources s ON s.id = b.source_id
    LEFT JOIN stories st ON st.id = b.story_id
    ORDER BY b.created_at DESC
  `).all()
  res.json(books)
})

scrapeRouter.post('/books', validateBody(bookSchema), (req: Request, res: Response) => {
  const db = getDatabase()
  const source = db.prepare('SELECT id FROM scrape_sources WHERE id = ?').get(req.body.source_id)
  if (!source) return res.status(404).json({ error: '网站源不存在', code: 'NOT_FOUND' })

  const id = randomUUID()
  db.prepare(`
    INSERT INTO scrape_books (id, source_id, title, book_url)
    VALUES (?, ?, ?, ?)
  `).run(id, req.body.source_id, req.body.title, req.body.book_url)
  const book = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(id) as ScrapeBookRow
  const sourceRow = db.prepare('SELECT name FROM scrape_sources WHERE id = ?').get(req.body.source_id) as { name: string } | undefined
  res.status(201).json({
    ...book,
    source_name: sourceRow?.name || '',
  })
})

scrapeRouter.put('/books/:id', validateBody(bookSchema.partial()), (req: Request, res: Response) => {
  const db = getDatabase()
  const existing = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(String(req.params.id)) as ScrapeBookRow | undefined
  if (!existing) return res.status(404).json({ error: '书籍不存在', code: 'NOT_FOUND' })

  const fields: string[] = []
  const values: unknown[] = []
  const allowed = ['title', 'book_url', 'source_id'] as const
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      fields.push(`${field} = ?`)
      values.push(req.body[field])
    }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')")
    values.push(String(req.params.id))
    db.prepare(`UPDATE scrape_books SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  res.json(db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(String(req.params.id)))
})

scrapeRouter.delete('/books/:id', (req: Request, res: Response) => {
  const db = getDatabase()
  const book = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(String(req.params.id)) as ScrapeBookRow | undefined
  if (!book) return res.status(404).json({ error: '书籍不存在', code: 'NOT_FOUND' })
  if (hasRunningTask(book.id)) {
    return res.status(409).json({ error: '该书正在抓取，请先取消任务', code: 'TASK_RUNNING' })
  }
  db.prepare('DELETE FROM scrape_books WHERE id = ?').run(book.id)
  res.json({ deleted: true })
})

// 扫描一本书：抓目录页统计章节数（不导入）
scrapeRouter.post('/books/:id/scan', async (req: Request, res: Response) => {
  const db = getDatabase()
  const book = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(String(req.params.id)) as ScrapeBookRow | undefined
  if (!book) return res.status(404).json({ error: '书籍不存在', code: 'NOT_FOUND' })
  const source = db.prepare('SELECT * FROM scrape_sources WHERE id = ?').get(book.source_id) as ScrapeSourceRow | undefined
  if (!source) return res.status(404).json({ error: '网站源不存在', code: 'NOT_FOUND' })

  try {
    const result = await scanBook(sourceConfig(source), book.book_url)
    db.prepare("UPDATE scrape_books SET total_chapters = ?, updated_at = datetime('now') WHERE id = ?")
      .run(result.count, book.id)
    res.json({ ...result, book_id: book.id })
  } catch (err: any) {
    res.status(500).json({ error: err.message || '扫描失败', code: 'SCAN_FAILED' })
  }
})

// ---------------------------------------------------------------------------
// 抓取任务
// ---------------------------------------------------------------------------

scrapeRouter.get('/tasks', (_req: Request, res: Response) => {
  const db = getDatabase()
  const tasks = db.prepare(`
    SELECT t.*, b.title AS book_title
    FROM scrape_tasks t
    LEFT JOIN scrape_books b ON b.id = t.book_id
    ORDER BY t.created_at DESC
  `).all() as Array<Record<string, unknown>>
  res.json(tasks.map((t) => ({ ...t, is_running: isRunning(String(t.id)) })))
})

scrapeRouter.get('/tasks/:id', (req: Request, res: Response) => {
  const db = getDatabase()
  const task = db.prepare(`
    SELECT t.*, b.title AS book_title
    FROM scrape_tasks t
    LEFT JOIN scrape_books b ON b.id = t.book_id
    WHERE t.id = ?
  `).get(String(req.params.id)) as Record<string, unknown> | undefined
  if (!task) return res.status(404).json({ error: '任务不存在', code: 'NOT_FOUND' })
  res.json({ ...task, is_running: isRunning(String(req.params.id)) })
})

// 创建并立即执行抓取任务
scrapeRouter.post('/tasks', validateBody(taskCreateSchema), (req: Request, res: Response) => {
  const db = getDatabase()
  const book = db.prepare('SELECT * FROM scrape_books WHERE id = ?').get(req.body.book_id) as ScrapeBookRow | undefined
  if (!book) return res.status(404).json({ error: '书籍不存在', code: 'NOT_FOUND' })

  const id = randomUUID()
  db.prepare(`INSERT INTO scrape_tasks (id, book_id, status, start_chapter) VALUES (?, ?, 'queued', ?)`)
    .run(id, req.body.book_id, req.body.start_chapter || 1)

  startTask(id)
  const task = db.prepare('SELECT * FROM scrape_tasks WHERE id = ?').get(id) as Record<string, unknown>
  res.status(201).json({ ...task, is_running: true })
})

scrapeRouter.post('/tasks/:id/cancel', (req: Request, res: Response) => {
  const db = getDatabase()
  const task = db.prepare('SELECT * FROM scrape_tasks WHERE id = ?').get(String(req.params.id)) as ScrapeTaskRow | undefined
  if (!task) return res.status(404).json({ error: '任务不存在', code: 'NOT_FOUND' })

  const cancelled = cancelTask(task.id)
  if (!cancelled && ['queued', 'running'].includes(task.status)) {
    db.prepare(
      `UPDATE scrape_tasks SET status = 'cancelled', current_title = '', finished_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    ).run(task.id)
    db.prepare(`UPDATE scrape_books SET status = 'idle', error = '' WHERE id = ? AND status = 'scraping'`).run(task.book_id)
  }
  res.json({ cancelled: true })
})

scrapeRouter.delete('/tasks/:id', (req: Request, res: Response) => {
  const db = getDatabase()
  const task = db.prepare('SELECT * FROM scrape_tasks WHERE id = ?').get(String(req.params.id)) as ScrapeTaskRow | undefined
  if (!task) return res.status(404).json({ error: '任务不存在', code: 'NOT_FOUND' })
  if (isRunning(task.id)) {
    return res.status(409).json({ error: '任务运行中，请先取消', code: 'TASK_RUNNING' })
  }
  db.prepare('DELETE FROM scrape_tasks WHERE id = ?').run(task.id)
  res.json({ deleted: true })
})
