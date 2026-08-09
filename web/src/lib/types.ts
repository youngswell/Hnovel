export interface Story {
  id: string
  title: string
  genre: string
  sub_genre?: string
  setting_era?: string
  status: 'planning' | 'in-progress' | 'completed' | 'hiatus'
  rating: 'nsfw' | 'safe'
  nsfw_tags: string[]
  explicit_level: 'mild' | 'moderate' | 'graphic'
  target_audience: 'male' | 'female' | 'general'
  pov: string
  tense: string
  synopsis?: string
  tone_style?: string
  reference_style?: string
  style_profile?: string
  themes: string[]
  chapter_count: number
  character_count: number
  total_words: number
  created_at: string
  updated_at: string
}

export interface Character {
  id: string
  story_id: string
  name: string
  role: 'protagonist' | 'antagonist' | 'love-interest' | 'harem-member' | 'supporting' | 'minor' | string
  status: 'alive' | 'deceased' | 'unknown'
  gender?: string
  age?: string
  appearance?: string
  personality?: string
  background?: string
  sexual_orientation?: string
  preferences: string[]
  body_features?: string
  importance?: 'low' | 'medium' | 'high'
  current_goal?: string
  core_conflict?: string
  character_arc?: string
  voice_style?: string
  relation_to_plot?: string
  secrets?: string
  writing_notes?: string
  tags: string[]
  affection_level: number
  created_at: string
  updated_at: string
}

export interface CharacterRelationship {
  id: number
  story_id: string
  source_id: string
  target_id: string
  source_name?: string
  target_name?: string
  rel_type: string
  intimacy_level: number
  trust_level: number
  conflict_level: number
  status: string
  phase: string
  is_public: number | boolean
  description?: string
  notes?: string
}

export interface Chapter {
  id: string
  story_id: string
  chapter_number: number
  title: string
  pov_character?: string
  location?: string
  status: 'draft' | 'revised' | 'final'
  word_count: number
  outline?: string
  content?: string
  scene_type: string
  explicit_level?: string
  created_at: string
  updated_at: string
}

export interface GenerateOptions {
  focusCharacters?: string[]
  sceneType?: string
  explicitLevel?: string
  intensityLevel?: number
  minWords?: number
  maxWords?: number
  additionalInstructions?: string
  outlineMode?: 'auto' | 'manual'
  batchContent?: string
  referenceStyle?: string
  styleProfile?: string
  chapterCount?: number
  chapterNumber?: number
  chapterTitle?: string
  chapterSummary?: string
}

export interface OutlineChapter {
  number: number
  title: string
  summary: string
  nsfw: boolean
  estimatedWords: number
}

export interface GeneratedOutline {
  title: string
  chapters: OutlineChapter[]
}

export interface GeneratedChapter {
  chapterNumber: number
  title: string
  outline: string
  content: string
  wordCount: number
}

export interface WritingPlanChapter {
  number: number
  goal: string
  keyEvents: string[]
  characterFocus: string[]
  notes: string
}

export interface WritingPlan {
  overview: string
  currentStatus: string
  chapterPlans: WritingPlanChapter[]
  suggestions: string[]
  risks: string[]
}

export type WorldCategory = 'overview' | 'locations' | 'systems' | 'factions' | 'artifacts' | 'terms'
export interface WorldItem {
  id: string
  category: WorldCategory
  name: string
  type: string
  summary: string
  description: string
  rules: string
  connections: string
  tags: string
  importance: 'low' | 'medium' | 'high'
  startChapter?: number
  endChapter?: number
  status: 'active' | 'draft' | 'archived'
}
export interface StoryArc {
  id: string
  name: string
  type: string
  characters: string
  description: string
  startChapter?: number
  endChapter?: number
  priority: 'low' | 'medium' | 'high'
  currentPhase: string
  goal: string
  conflict: string
  status: 'planned' | 'active' | 'completed' | 'paused' | 'abandoned'
}
export interface TimelineEvent {
  id: string
  chapter: string
  description: string
  arc: string
  type: 'main' | 'sub' | 'turning' | 'foreshadow' | 'payoff' | 'character'
  importance: 'low' | 'medium' | 'high'
  characters: string
  occurred: boolean
  notes: string
}
export interface Foreshadow {
  id: string
  name: string
  description: string
  setupChapter: string
  payoffChapter: string
  arc: string
  status: 'planned' | 'planted' | 'paid-off' | 'abandoned'
  notes: string
}
export interface PlotData { structureModel: string; arcs: StoryArc[]; events: TimelineEvent[]; foreshadows: Foreshadow[] }

// ---------- 文章抓取 ----------

export interface ScrapeSource {
  id: string
  name: string
  base_url: string
  link_pattern: string
  title_selector: string
  content_selectors: string[]
  enabled: boolean | number
  book_count?: number
  created_at: string
  updated_at: string
}

export interface ScrapeBook {
  id: string
  source_id: string
  source_name?: string
  title: string
  book_url: string
  story_id?: string | null
  story_title?: string
  status: 'idle' | 'scraping' | 'done' | 'failed'
  total_chapters: number
  imported_chapters: number
  error: string
  created_at: string
  updated_at: string
}

export type ScrapeTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface ScrapeTask {
  id: string
  book_id: string
  book_title?: string
  status: ScrapeTaskStatus
  start_chapter: number
  total: number
  done: number
  failed: number
  current_title: string
  error: string
  is_running?: boolean
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface ScrapePreview {
  count: number
  title: string
  sample: Array<{ url: string; text: string }>
}

// ---------- EPUB 导入 ----------

export interface EpubImportResult {
  story_id: string
  story_title: string
  imported: number
  total: number
  source_title: string
  creator: string
  first: { number: number; title: string } | null
  last: { number: number; title: string } | null
}

// ---------- 逆向整理 ----------

export type AnalyzeCategory = 'bible' | 'characters' | 'world' | 'plot'

export interface StoryAnalysisResult {
  story_id: string
  counts: {
    characters: { created: number; updated: number }
    worldItems: { created: number; updated: number }
    arcs: { created: number; updated: number }
    events: { created: number; updated: number }
    foreshadows: { created: number; updated: number }
  }
  bible: {
    coreSetting: string
    tone: string
    themes: string[]
    worldSummary: string
    currentStatus: string
    styleNotes: string
    continuityNotes: string
  }
  warnings: string[]
  status: Record<AnalyzeCategory, { ok: boolean; error: string }>
}
