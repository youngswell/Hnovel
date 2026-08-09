export interface Story {
  id: string
  title: string
  genre: string
  sub_genre?: string
  status: 'planning' | 'in-progress' | 'completed' | 'hiatus'
  rating: 'nsfw' | 'safe'
  synopsis?: string
  tone_style?: string
  themes: string[]
  chapter_count: number
  character_count: number
  total_words: number
  created_at: string
  updated_at: string
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
