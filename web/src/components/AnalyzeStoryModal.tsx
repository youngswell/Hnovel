import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { analyzeStory, getApiErrorMessage } from '../lib/api'
import type { AnalyzeCategory, StoryAnalysisResult } from '../lib/types'
import { ModalPortal } from './ModalPortal'
import { Icon } from './Icon'

const CATEGORY_META: Array<{ key: AnalyzeCategory; label: string; icon: string; desc: string; countKey?: keyof StoryAnalysisResult['counts'] }> = [
  { key: 'bible', label: '故事圣经', icon: 'book', desc: '核心设定、基调、主题与连续性要点' },
  { key: 'characters', label: '角色', icon: 'users', desc: '主要角色档案' },
  { key: 'world', label: '世界观', icon: 'globe', desc: '地点、势力、规则与术语', countKey: 'worldItems' },
  { key: 'plot', label: '情节', icon: 'chart', desc: '情节线、时间线事件与伏笔' },
]

export function AnalyzeStoryModal({
  storyId,
  storyTitle,
  chapterCount,
  onClose,
}: {
  storyId: string
  storyTitle: string
  chapterCount: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<AnalyzeCategory[]>(['bible', 'characters', 'world', 'plot'])
  const [result, setResult] = useState<StoryAnalysisResult | null>(null)
  const [running, setRunning] = useState<AnalyzeCategory[]>([])
  const [error, setError] = useState('')

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['story', storyId] })
    queryClient.invalidateQueries({ queryKey: ['stories'] })
    queryClient.invalidateQueries({ queryKey: ['characters', storyId] })
    queryClient.invalidateQueries({ queryKey: ['world-items', storyId] })
    queryClient.invalidateQueries({ queryKey: ['plot', storyId] })
  }

  const run = async (categories: AnalyzeCategory[]) => {
    setError('')
    setRunning(categories)
    try {
      const data = await analyzeStory(storyId, categories)
      setResult((prev) => {
        if (!prev) return data
        // 合并计数：重试后累加
        const merge = (a: any, b: any) => ({ created: (a?.created || 0) + (b?.created || 0), updated: (a?.updated || 0) + (b?.updated || 0) })
        return {
          ...prev,
          counts: {
            characters: merge(prev.counts.characters, data.counts.characters),
            worldItems: merge(prev.counts.worldItems, data.counts.worldItems),
            arcs: merge(prev.counts.arcs, data.counts.arcs),
            events: merge(prev.counts.events, data.counts.events),
            foreshadows: merge(prev.counts.foreshadows, data.counts.foreshadows),
          },
          bible: data.bible || prev.bible,
          status: { ...prev.status, ...data.status },
          warnings: [...new Set([...(prev.warnings || []), ...(data.warnings || [])])],
        }
      })
      invalidateAll()
    } catch (e) {
      setError(getApiErrorMessage(e))
    } finally {
      setRunning([])
    }
  }

  const toggle = (key: AnalyzeCategory) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const failedCategories = useMemo(
    () => (result ? CATEGORY_META.filter((m) => !result.status?.[m.key]?.ok).map((m) => m.key) : []),
    [result],
  )

  const totalCreated = result
    ? (result.counts.characters.created || 0) +
      (result.counts.worldItems.created || 0) +
      (result.counts.arcs.created || 0) +
      (result.counts.events.created || 0) +
      (result.counts.foreshadows.created || 0)
    : 0

  const anyRunning = running.length > 0

  return (
    <ModalPortal>
      <div className="bg-bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">AI 逆向整理</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-text-secondary mb-4">
          通读《{storyTitle}》现有的 <span className="text-primary font-medium">{chapterCount}</span> 章正文，按分类反向整理后写入项目。
          建议对大部头分多次、逐项整理；失败的分类可单独重试。
        </p>

        {/* 分类选择 */}
        {!result && (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {CATEGORY_META.map((m) => {
              const checked = selected.includes(m.key)
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => toggle(m.key)}
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                    checked ? 'border-primary bg-primary-bg' : 'border-border bg-bg-dark hover:border-primary/40'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${checked ? 'bg-primary text-white' : 'bg-primary-bg text-primary'}`}>
                    <Icon name={m.icon} className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{m.label}</p>
                    <p className="text-xs text-text-muted mt-0.5">{m.desc}</p>
                  </div>
                  <span className={`ml-auto mt-1 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                    {checked && <Icon name="check" className="w-3 h-3" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {anyRunning && (
          <div className="rounded-xl border border-primary/25 bg-primary-bg p-4 mb-4">
            <div className="flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-primary font-medium">正在整理：{running.join('、')}…</p>
            </div>
            <p className="text-xs text-text-muted mt-2">分类逐个分析，可能需要几分钟；期间请勿关闭窗口。</p>
          </div>
        )}

        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

        {/* 结果：按分类展示 */}
        {result && (
          <div className="space-y-2 mb-4">
            <div className="flex items-center justify-between rounded-xl border border-green-500/30 bg-green-500/5 px-4 py-3">
              <p className="text-sm text-text-secondary">
                整理完成，新增 <span className="text-primary font-medium">{totalCreated}</span> 条资料
              </p>
            </div>
            {CATEGORY_META.map((m) => {
              const st = result.status?.[m.key]
              const ok = st?.ok !== false
              const c = m.countKey ? result.counts[m.countKey] : undefined
              let detail = ''
              if (m.key === 'bible') detail = result.bible?.coreSetting ? '核心设定已写入' : '（未写入）'
              if (m.key === 'plot') {
                const p = result.counts
                detail = `情节线 ${p.arcs.created}/${p.arcs.updated} · 事件 ${p.events.created}/${p.events.updated} · 伏笔 ${p.foreshadows.created}/${p.foreshadows.updated}`
              }
              if (c) detail = `新增 ${c.created} / 更新 ${c.updated}`
              return (
                <div key={m.key} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${ok ? 'border-border bg-bg-dark' : 'border-red-500/30 bg-red-500/5'}`}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ok ? 'bg-primary-bg text-primary' : 'bg-red-500/10 text-red-500'}`}>
                      <Icon name={ok ? 'check' : 'x'} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">{m.label}</p>
                      <p className={`text-xs truncate ${ok ? 'text-text-muted' : 'text-red-500'}`}>
                        {ok ? detail : `失败：${st?.error || '未知错误'}`}
                      </p>
                    </div>
                  </div>
                  {!ok && (
                    <button
                      type="button"
                      onClick={() => run([m.key])}
                      disabled={anyRunning}
                      className="ml-3 px-3 py-1.5 rounded-lg text-xs bg-primary text-white font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors shrink-0"
                    >
                      重试
                    </button>
                  )}
                </div>
              )
            })}
            {result.warnings?.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
                <p className="text-xs text-amber-600">提示：{result.warnings.join('；')}</p>
              </div>
            )}
          </div>
        )}

        {!result ? (
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              disabled={chapterCount === 0 || anyRunning || selected.length === 0}
              onClick={() => run(selected)}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all"
            >
              {anyRunning ? '整理中…' : '开始整理'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={anyRunning}
              className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
            >
              取消
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {failedCategories.length > 0 && (
              <button
                type="button"
                onClick={() => run(failedCategories)}
                disabled={anyRunning}
                className="w-full px-4 py-2.5 border border-primary/40 text-primary hover:bg-primary-bg rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
              >
                {anyRunning ? '整理中…' : `重试失败分类（${failedCategories.join('、')}）`}
              </button>
            )}
            <div className="flex gap-3">
              <Link
                to={`/story/${storyId}/bible`}
                className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl text-sm font-medium text-center transition-all"
              >
                查看故事圣经
              </Link>
              <Link
                to={`/story/${storyId}/characters`}
                className="flex-1 px-4 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm text-center transition-all"
              >
                角色
              </Link>
              <Link
                to={`/story/${storyId}/world`}
                className="flex-1 px-4 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm text-center transition-all"
              >
                世界观
              </Link>
              <Link
                to={`/story/${storyId}/plot`}
                className="flex-1 px-4 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm text-center transition-all"
              >
                情节
              </Link>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-border hover:bg-bg-dark text-text-secondary rounded-xl text-sm transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalPortal>
  )
}
