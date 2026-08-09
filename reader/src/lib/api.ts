import axios from 'axios'
import type { Chapter, Story } from './types'

const api = axios.create({
  baseURL: '/api',
  timeout: 600000, // AI 接口可能较慢
})

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined
    return data?.error || error.message
  }
  return error instanceof Error ? error.message : '未知错误'
}

export async function fetchStories(): Promise<Story[]> {
  const { data } = await api.get('/stories')
  return data
}

export async function fetchStory(id: string): Promise<Story> {
  const { data } = await api.get(`/stories/${id}`)
  return data
}

export async function fetchChapters(storyId: string): Promise<Chapter[]> {
  const { data } = await api.get(`/stories/${storyId}/chapters`)
  return data
}

export async function fetchChapter(storyId: string, num: number): Promise<Chapter> {
  const { data } = await api.get(`/stories/${storyId}/chapters/${num}`)
  return data
}
