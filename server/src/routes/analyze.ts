import { Router, Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { getDatabase } from '../db/index.js'
import { analyzeStory, CATEGORIES, type AnalyzeCategory } from '../agents/story-analyzer.js'
import { asString, asStringArray, asInt, pickEnum } from '../agents/json-utils.js'

export const analyzeRouter = Router({ mergeParams: true })

const ROLES = ['protagonist', 'antagonist', 'love-interest', 'harem-member', 'supporting', 'minor'] as const
const STATUSES = ['alive', 'deceased', 'unknown'] as const
const IMPORTANCE = ['high', 'medium', 'low'] as const
const WORLD_CATS = ['overview', 'locations', 'systems', 'factions', 'artifacts', 'terms'] as const
const ARC_TYPES = ['main', 'sub', 'hidden', 'character', 'romance', 'growth', 'faction'] as const
const ARC_STATUSES = ['active', 'completed', 'paused', 'planned', 'abandoned'] as const
const EVENT_TYPES = ['main', 'sub', 'turning', 'foreshadow', 'payoff', 'character'] as const
const FS_STATUSES = ['planned', 'planted', 'paid-off', 'abandoned'] as const

/** 更新一行，只写入非空字段（避免覆盖用户已有内容） */
function updateNonEmpty(
  db: ReturnType<typeof getDatabase>,
  table: string,
  columns: string[],
  values: unknown[],
  whereSql: string,
  whereArgs: unknown[],
  hasUpdatedAt = true,
): boolean {
  const pairs: Array<[string, unknown]> = []
  columns.forEach((col, i) => {
    const v = values[i]
    if (v !== undefined && v !== null && v !== '' && v !== '[]' && v !== '[""]') pairs.push([col, v])
  })
  if (pairs.length === 0) return false
  const sets = pairs.map(([c]) => `${c} = ?`).join(', ')
  const args = pairs.map(([, v]) => v)
  db.prepare(
    `UPDATE ${table} SET ${sets}${hasUpdatedAt ? ", updated_at = datetime('now')" : ''} WHERE ${whereSql}`,
  ).run(...args, ...whereArgs)
  return true
}

// ---------------------------------------------------------------------------
// 各实体 upsert（按稳定键去重：重跑不产生重复）
// ---------------------------------------------------------------------------

function upsertCharacter(storyId: string, raw: any): 'created' | 'updated' | null {
  const db = getDatabase()
  const name = asString(raw.name)
  if (!name) return null
  const data: Record<string, unknown> = {
    role: pickEnum(raw.role, ROLES, 'supporting'),
    status: pickEnum(raw.status, STATUSES, 'alive'),
    importance: pickEnum(raw.importance, IMPORTANCE, 'medium'),
    gender: asString(raw.gender), age: asString(raw.age),
    appearance: asString(raw.appearance), personality: asString(raw.personality),
    background: asString(raw.background), current_goal: asString(raw.current_goal),
    core_conflict: asString(raw.core_conflict), character_arc: asString(raw.character_arc),
    voice_style: asString(raw.voice_style), relation_to_plot: asString(raw.relation_to_plot),
    secrets: asString(raw.secrets), writing_notes: asString(raw.writing_notes),
    preferences: JSON.stringify(asStringArray(raw.preferences)),
    tags: JSON.stringify(asStringArray(raw.tags)),
  }
  const existing = db.prepare('SELECT id FROM characters WHERE story_id = ? AND name = ?').get(storyId, name) as { id: string } | undefined
  if (existing) {
    updateNonEmpty(db, 'characters', Object.keys(data), Object.values(data), 'id = ?', [existing.id])
    return 'updated'
  }
  const cols = Object.keys(data)
  db.prepare(`INSERT INTO characters (id, story_id, name, ${cols.join(', ')}) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(randomUUID(), storyId, name, ...Object.values(data))
  return 'created'
}

function upsertWorldItem(storyId: string, raw: any): 'created' | 'updated' | null {
  const db = getDatabase()
  const name = asString(raw.name)
  if (!name) return null
  const category = pickEnum(raw.category, WORLD_CATS, 'overview')
  const data: Record<string, unknown> = {
    item_type: asString(raw.type, 'other'),
    importance: pickEnum(raw.importance, IMPORTANCE, 'medium'),
    summary: asString(raw.summary),
    description: asString(raw.description),
    rules: asString(raw.rules),
    tags: asStringArray(raw.tags).join(', '),
    status: 'active',
  }
  const existing = db.prepare('SELECT id FROM world_items WHERE story_id = ? AND category = ? AND name = ?')
    .get(storyId, category, name) as { id: string } | undefined
  if (existing) {
    updateNonEmpty(db, 'world_items', Object.keys(data), Object.values(data), 'id = ?', [existing.id])
    return 'updated'
  }
  const cols = Object.keys(data)
  db.prepare(`INSERT INTO world_items (id, story_id, category, name, ${cols.join(', ')}) VALUES (?, ?, ?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(randomUUID(), storyId, category, name, ...Object.values(data))
  return 'created'
}

function upsertArc(storyId: string, raw: any): 'created' | 'updated' | null {
  const db = getDatabase()
  const name = asString(raw.name)
  if (!name) return null
  const start = asInt(raw.start_chapter, 0) || null
  const end = asInt(raw.end_chapter, 0) || null
  const data: Record<string, unknown> = {
    arc_type: pickEnum(raw.type, ARC_TYPES, 'main'),
    description: asString(raw.description),
    goal: asString(raw.goal),
    conflict: asString(raw.conflict),
    status: pickEnum(raw.status, ARC_STATUSES, 'active'),
    priority: 'medium',
    start_chapter: start,
    end_chapter: end,
    current_phase: '',
  }
  const existing = db.prepare('SELECT id FROM story_arcs WHERE story_id = ? AND name = ?').get(storyId, name) as { id: string } | undefined
  if (existing) {
    updateNonEmpty(db, 'story_arcs', Object.keys(data), Object.values(data), 'id = ?', [existing.id], false)
    return 'updated'
  }
  const cols = Object.keys(data)
  db.prepare(`INSERT INTO story_arcs (id, story_id, name, ${cols.join(', ')}) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(randomUUID(), storyId, name, ...Object.values(data))
  return 'created'
}

function upsertEvent(storyId: string, raw: any): 'created' | 'updated' | null {
  const db = getDatabase()
  const description = asString(raw.description)
  if (!description) return null
  const chapter = asString(raw.chapter)
  const data: Record<string, unknown> = {
    chapter,
    description,
    event_type: pickEnum(raw.type, EVENT_TYPES, 'main'),
    importance: pickEnum(raw.importance, IMPORTANCE, 'medium'),
    occurred: raw.occurred === false || raw.occurred === 0 ? 0 : 1,
    notes: '',
  }
  const existing = db.prepare('SELECT id FROM timeline_events WHERE story_id = ? AND chapter = ? AND description = ?')
    .get(storyId, chapter, description) as { id: string } | undefined
  if (existing) {
    updateNonEmpty(db, 'timeline_events', Object.keys(data), Object.values(data), 'id = ?', [existing.id], false)
    return 'updated'
  }
  const cols = Object.keys(data)
  db.prepare(`INSERT INTO timeline_events (id, story_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(randomUUID(), storyId, ...Object.values(data))
  return 'created'
}

function upsertForeshadow(storyId: string, raw: any): 'created' | 'updated' | null {
  const db = getDatabase()
  const name = asString(raw.name)
  if (!name) return null
  const data: Record<string, unknown> = {
    description: asString(raw.description),
    setup_chapter: asString(raw.setup_chapter),
    payoff_chapter: asString(raw.payoff_chapter),
    status: pickEnum(raw.status, FS_STATUSES, 'planned'),
    notes: '',
  }
  const existing = db.prepare('SELECT id FROM foreshadows WHERE story_id = ? AND name = ?').get(storyId, name) as { id: string } | undefined
  if (existing) {
    updateNonEmpty(db, 'foreshadows', Object.keys(data), Object.values(data), 'id = ?', [existing.id])
    return 'updated'
  }
  const cols = Object.keys(data)
  db.prepare(`INSERT INTO foreshadows (id, story_id, name, ${cols.join(', ')}) VALUES (?, ?, ?, ${cols.map(() => '?').join(', ')})`)
    .run(randomUUID(), storyId, name, ...Object.values(data))
  return 'created'
}

// ---------------------------------------------------------------------------
// 故事圣经写回
// ---------------------------------------------------------------------------

function applyStoryBible(
  storyId: string,
  bible: { coreSetting: string; tone: string; themes: string[]; styleNotes: string },
  chapters: Array<{ chapter_number: number; title: string; content: string }>,
): void {
  const db = getDatabase()
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as any
  if (!story) return

  const updates: string[] = []
  const vals: unknown[] = []

  if (!story.synopsis && bible.coreSetting) {
    updates.push('synopsis = ?')
    vals.push(bible.coreSetting.slice(0, 10000))
  }
  if (!story.tone_style && bible.tone) {
    updates.push('tone_style = ?')
    vals.push(bible.tone)
  }
  // themes 合并去重
  let themes: string[] = []
  try { themes = JSON.parse(story.themes || '[]') } catch { themes = [] }
  const merged = Array.from(new Set([...themes, ...bible.themes.filter(Boolean)]))
  updates.push('themes = ?')
  vals.push(JSON.stringify(merged))

  if (!story.style_profile && bible.styleNotes) {
    updates.push('style_profile = ?')
    vals.push(bible.styleNotes)
  }
  // 参考文风：未设置时用前 3 万字符正文作为样本
  if (!story.reference_style) {
    const sample = chapters.map((c) => String(c.content || '')).join('\n\n').slice(0, 30000)
    if (sample.trim().length >= 200) {
      updates.push('reference_style = ?')
      vals.push(sample)
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')")
    vals.push(storyId)
    db.prepare(`UPDATE stories SET ${updates.join(', ')} WHERE id = ?`).run(...vals)
  }
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

/**
 * POST /api/stories/:id/analyze
 * 读取已有章节正文 → 按分类逐一 AI 反向整理 → 落库（故事圣经 / 角色 / 世界观 / 情节）。
 * 请求体可选：{ categories: ["bible","characters","world","plot"] }，只分析指定分类。
 */
analyzeRouter.post('/:id/analyze', async (req: Request, res: Response) => {
  try {
    const db = getDatabase()
    const id = String(req.params.id)
    const story = db.prepare('SELECT id, title FROM stories WHERE id = ?').get(id)
    if (!story) return res.status(404).json({ error: '故事不存在', code: 'NOT_FOUND' })

    const chapters = db.prepare(
      'SELECT chapter_number, title, content FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC',
    ).all(id) as Array<{ chapter_number: number; title: string; content: string }>
    if (chapters.length === 0) {
      return res.status(400).json({ error: '该故事还没有章节正文，无法分析', code: 'NO_CHAPTERS' })
    }

    // 指定要分析的分类（只允许合法值）
    let categories: AnalyzeCategory[] = CATEGORIES
    if (Array.isArray(req.body?.categories)) {
      const picked = req.body.categories.filter((c: unknown) => (CATEGORIES as readonly string[]).includes(String(c)))
      if (picked.length > 0) categories = picked as AnalyzeCategory[]
    }

    const analysis = await analyzeStory(id, categories)

    // 故事圣经（仅在选择了 bible 时回写）
    if (categories.includes('bible')) {
      applyStoryBible(id, analysis.bible, chapters)
    }

    // 角色 / 世界观 / 情节（按所选分类落库）
    const counts = {
      characters: { created: 0, updated: 0 },
      worldItems: { created: 0, updated: 0 },
      arcs: { created: 0, updated: 0 },
      events: { created: 0, updated: 0 },
      foreshadows: { created: 0, updated: 0 },
    }
    const bump = (key: keyof typeof counts, result: string | null) => {
      if (result === 'created') counts[key].created++
      else if (result === 'updated') counts[key].updated++
    }
    if (categories.includes('characters')) {
      for (const c of analysis.characters) bump('characters', upsertCharacter(id, c))
    }
    if (categories.includes('world')) {
      for (const w of analysis.worldItems) bump('worldItems', upsertWorldItem(id, w))
    }
    if (categories.includes('plot')) {
      for (const a of analysis.arcs) bump('arcs', upsertArc(id, a))
      for (const e of analysis.events) bump('events', upsertEvent(id, e))
      for (const f of analysis.foreshadows) bump('foreshadows', upsertForeshadow(id, f))
    }

    db.prepare("UPDATE stories SET updated_at = datetime('now') WHERE id = ?").run(id)

    res.json({
      story_id: id,
      counts,
      bible: analysis.bible,
      warnings: analysis.warnings || [],
      status: analysis.status,
    })
  } catch (err: any) {
    console.error('[Hnovel] 逆向整理失败:', err)
    res.status(500).json({
      error: err instanceof Error ? err.message : '分析失败',
      code: 'ANALYZE_FAILED',
    })
  }
})
