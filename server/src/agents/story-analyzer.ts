import { getLlmConfig, getOpenAIClient } from '../config/llm.js'
import { getDatabase } from '../db/index.js'
import { parseOrRepairJsonObject, asString, asStringArray } from './json-utils.js'

export type AnalyzeCategory = 'bible' | 'characters' | 'world' | 'plot'
export const CATEGORIES: AnalyzeCategory[] = ['bible', 'characters', 'world', 'plot']

export interface CategoryStatus {
  ok: boolean
  error: string
}

export interface StoryAnalysis {
  bible: {
    coreSetting: string
    tone: string
    themes: string[]
    worldSummary: string
    currentStatus: string
    styleNotes: string
    continuityNotes: string
  }
  characters: Array<Record<string, unknown>>
  worldItems: Array<Record<string, unknown>>
  arcs: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  foreshadows: Array<Record<string, unknown>>
  warnings: string[]
  status: Record<AnalyzeCategory, CategoryStatus>
}

/** 全书章节标题清单（紧凑，帮模型把握整体情节骨架，对大书尤其重要） */
function buildTitleOverview(chapters: Array<{ chapter_number: number; title: string }>): string {
  return chapters
    .map((c) => `${c.chapter_number}. ${c.title || ''}`)
    .join('\n')
}

/** 章节正文采样：开头 + 中段均匀 + 结尾，控制输入规模 */
function buildExcerptSample(chapters: Array<{ chapter_number: number; title: string; content: string }>): string {
  const perChapter = 700
  const selected: typeof chapters = []
  const n = chapters.length

  if (n <= 24) {
    selected.push(...chapters)
  } else {
    const head = chapters.slice(0, 9)
    const tail = chapters.slice(-6)
    const step = Math.max(1, Math.floor((n - 15) / 9))
    const middle: typeof chapters = []
    for (let i = 15; i < n - 6; i += step) middle.push(chapters[i])
    selected.push(...head, ...middle.slice(0, 9), ...tail)
  }

  return selected
    .map((c) => `【第${c.chapter_number}章 ${c.title}】\n${String(c.content || '').slice(0, perChapter)}`)
    .join('\n\n')
}

async function chatJson(system: string, user: string, schemaHint: string, maxTokens: number): Promise<any> {
  const { model } = getLlmConfig()
  const response = await getOpenAIClient().chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  })
  const raw = response.choices[0]?.message?.content || ''
  return parseOrRepairJsonObject(raw, schemaHint)
}

const JSON_ONLY_SYSTEM =
  '你是资深长篇小说编辑与设定整理助手，负责通读已写正文并反向整理续写所需资料。' +
  '只输出严格JSON对象：第一字符必须是 {，最后字符必须是 }。不要输出Markdown、代码块、解释或前后缀。' +
  '必须给出完整结果，禁止返回空数组；如资料确实不足，宁可在字段里写“（正文未明确）”也不要省略。'

function storyHeader(story: any, chapterCount: number, existing: any): string {
  return `【故事信息】标题：${story.title}\n类型：${story.genre || '未知'}\n现有梗概：${story.synopsis || '（无）'}\n章节总数：${chapterCount}\n已有条目（不要重复创建，只能复用或补充）：${JSON.stringify(existing)}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// 各分类分析（每次只专注一个维度）
// ---------------------------------------------------------------------------

async function analyzeBible(story: any, titles: string, sample: string, chapterCount: number): Promise<StoryAnalysis['bible']> {
  const draft = await chatJson(
    JSON_ONLY_SYSTEM,
    `${storyHeader(story, chapterCount, {})}

【全书章节标题（概览情节骨架）】
${titles}

【章节正文样本（节选）】
${sample}

【任务】整理「故事圣经」资料，返回如下严格JSON：
{
  "coreSetting": "故事核心设定与世界观总览，120-250字",
  "tone": "整体基调与风格，60-150字",
  "themes": ["主题1", "主题2", "主题3"],
  "worldSummary": "当前世界形势/格局，60-150字",
  "currentStatus": "当前故事进行到哪、各方人物所处状态，100-200字",
  "styleNotes": "该书写作风格要点（视角、节奏、描写侧重），供续写保持一致，60-180字",
  "continuityNotes": "续写时必须注意的连续性要点（人物状态、未解之谜、当前悬念），80-200字"
}`,
    'coreSetting,tone,themes,worldSummary,currentStatus,styleNotes,continuityNotes',
    1600,
  )
  return {
    coreSetting: asString(draft?.coreSetting),
    tone: asString(draft?.tone),
    themes: asStringArray(draft?.themes),
    worldSummary: asString(draft?.worldSummary),
    currentStatus: asString(draft?.currentStatus),
    styleNotes: asString(draft?.styleNotes),
    continuityNotes: asString(draft?.continuityNotes),
  }
}

async function analyzeCharacters(story: any, titles: string, sample: string, chapterCount: number, existingNames: string[]): Promise<Array<Record<string, unknown>>> {
  const draft = await chatJson(
    JSON_ONLY_SYSTEM,
    `${storyHeader(story, chapterCount, { characters: existingNames })}

【全书章节标题（概览情节骨架）】
${titles}

【章节正文样本（节选）】
${sample}

【任务】提取有戏份的主要角色档案，返回如下严格JSON：
{
  "characters": [
    {
      "name": "姓名",
      "role": "protagonist/antagonist/love-interest/harem-member/supporting/minor",
      "status": "alive/deceased/unknown",
      "gender": "男/女/未知",
      "age": "年龄或未知",
      "appearance": "外貌",
      "personality": "性格",
      "background": "背景",
      "importance": "high/medium/low",
      "current_goal": "当前目标",
      "core_conflict": "核心冲突",
      "character_arc": "人物弧光/成长线",
      "voice_style": "说话风格",
      "relation_to_plot": "与主线的关系",
      "secrets": "秘密",
      "preferences": ["偏好"],
      "tags": ["标签"]
    }
  ]
}
要求：只要在正文/标题中出现过且有一定戏份的角色就应收录，8-25 个；每个角色档案 3-6 行精炼内容；用简体中文。`,
    'characters[]',
    4000,
  )
  return Array.isArray(draft?.characters) ? draft.characters.filter((c: any) => asString(c?.name)) : []
}

async function analyzeWorld(story: any, titles: string, sample: string, chapterCount: number, existingWorld: string[]): Promise<Array<Record<string, unknown>>> {
  const draft = await chatJson(
    JSON_ONLY_SYSTEM,
    `${storyHeader(story, chapterCount, { worldItems: existingWorld })}

【全书章节标题（概览情节骨架）】
${titles}

【章节正文样本（节选）】
${sample}

【任务】整理世界观条目（地点/势力/规则/物品/术语），返回如下严格JSON：
{
  "worldItems": [
    {
      "category": "overview/locations/systems/factions/artifacts/terms",
      "name": "名称",
      "type": "类型英文，如 village/power/artifact/term",
      "importance": "high/medium/low",
      "summary": "一句话摘要",
      "description": "详细说明，60-150字",
      "rules": "续写时必须遵守的规则/限制/代价",
      "tags": ["标签"]
    }
  ]
}
要求：只要正文中真实出现或明确提及就应收录，5-15 条；用简体中文。`,
    'worldItems[]',
    4000,
  )
  return Array.isArray(draft?.worldItems) ? draft.worldItems.filter((w: any) => asString(w?.name)) : []
}

async function analyzePlot(story: any, titles: string, sample: string, chapterCount: number, existingArcs: string[]): Promise<{
  arcs: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  foreshadows: Array<Record<string, unknown>>
}> {
  const draft = await chatJson(
    JSON_ONLY_SYSTEM,
    `${storyHeader(story, chapterCount, { arcs: existingArcs })}

【全书章节标题（概览情节骨架）】
${titles}

【章节正文样本（节选）】
${sample}

【任务】整理情节管理数据，返回如下严格JSON：
{
  "arcs": [
    {
      "name": "故事线名称",
      "type": "main/sub/hidden/character/romance/growth/faction",
      "description": "这条线讲什么，40-150字",
      "goal": "最终目标",
      "conflict": "主要矛盾",
      "status": "active/completed/paused/planned",
      "start_chapter": 起始章号或null,
      "end_chapter": 结束章号或null
    }
  ],
  "events": [
    {
      "chapter": "对应章节号(数字)",
      "description": "事件描述，15-80字",
      "type": "main/sub/turning/foreshadow/payoff/character",
      "importance": "high/medium/low",
      "occurred": true
    }
  ],
  "foreshadows": [
    {
      "name": "伏笔名",
      "description": "伏笔内容",
      "setup_chapter": "埋设章节号或空",
      "payoff_chapter": "回收章节号或空",
      "status": "planned/planted/paid-off/abandoned"
    }
  ]
}
数量控制：故事线 2-8 条；事件 10-40 条；伏笔 3-12 条；chapter 尽量用数字；用简体中文。`,
    'arcs[],events[],foreshadows[]',
    6000,
  )
  return {
    arcs: Array.isArray(draft?.arcs) ? draft.arcs.filter((a: any) => asString(a?.name)) : [],
    events: Array.isArray(draft?.events) ? draft.events.filter((e: any) => asString(e?.description)) : [],
    foreshadows: Array.isArray(draft?.foreshadows) ? draft.foreshadows.filter((f: any) => asString(f?.name)) : [],
  }
}

// ---------------------------------------------------------------------------
// 主流程：按分类串行分析，失败自动重试一次
// ---------------------------------------------------------------------------

const EMPTY_BIBLE: StoryAnalysis['bible'] = {
  coreSetting: '', tone: '', themes: [], worldSummary: '', currentStatus: '', styleNotes: '', continuityNotes: '',
}

/**
 * 通读已有章节正文，按分类（bible/characters/world/plot）逐一反向整理。
 * - 串行执行 + 每个分类失败重试一次，避免并行大请求不稳定
 * - 只分析与解析，不写库（由路由层落库）
 * @param categories 要分析的分类；缺省为全部
 */
export async function analyzeStory(storyId: string, categories: AnalyzeCategory[] = CATEGORIES): Promise<StoryAnalysis> {
  const db = getDatabase()
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as any
  if (!story) throw new Error('故事不存在')

  const chapters = db.prepare(
    'SELECT chapter_number, title, content FROM chapters WHERE story_id = ? ORDER BY chapter_number ASC',
  ).all(storyId) as Array<{ chapter_number: number; title: string; content: string }>
  if (chapters.length === 0) throw new Error('该故事还没有章节正文，无法分析')

  const titles = buildTitleOverview(chapters)
  const sample = buildExcerptSample(chapters)
  const existingNames = (db.prepare('SELECT name FROM characters WHERE story_id = ?').all(storyId) as any[]).map((c) => c.name)
  const existingWorld = (db.prepare('SELECT category, name FROM world_items WHERE story_id = ?').all(storyId) as any[]).map((w) => `${w.category}:${w.name}`)
  const existingArcs = (db.prepare('SELECT name FROM story_arcs WHERE story_id = ?').all(storyId) as any[]).map((a) => a.name)

  const warnings: string[] = []
  const status = Object.fromEntries(CATEGORIES.map((c) => [c, { ok: true, error: '' }])) as Record<AnalyzeCategory, CategoryStatus>

  const run = async <T>(label: AnalyzeCategory, fn: () => Promise<T>): Promise<T | null> => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const value = await fn()
        status[label] = { ok: true, error: '' }
        return value
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (attempt === 2) {
          status[label] = { ok: false, error: msg }
          warnings.push(`「${label}」分析失败：${msg}`)
        } else {
          await sleep(1500)
        }
      }
    }
    return null
  }

  const result: StoryAnalysis = {
    bible: { ...EMPTY_BIBLE },
    characters: [], worldItems: [], arcs: [], events: [], foreshadows: [],
    warnings, status,
  }

  if (categories.includes('bible')) {
    const b = await run('bible', () => analyzeBible(story, titles, sample, chapters.length))
    if (b) result.bible = b
  }
  if (categories.includes('characters')) {
    const c = await run('characters', () => analyzeCharacters(story, titles, sample, chapters.length, existingNames))
    if (c) result.characters = c
  }
  if (categories.includes('world')) {
    const w = await run('world', () => analyzeWorld(story, titles, sample, chapters.length, existingWorld))
    if (w) result.worldItems = w
  }
  if (categories.includes('plot')) {
    const p = await run('plot', () => analyzePlot(story, titles, sample, chapters.length, existingArcs))
    if (p) { result.arcs = p.arcs; result.events = p.events; result.foreshadows = p.foreshadows }
  }

  return result
}
