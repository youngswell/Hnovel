import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { fetchLlmSettings, getApiErrorMessage, saveLlmSettings, testLlmSettings, type LlmSettings, type LlmTestResult } from '../lib/api'
import { Icon } from '../components/Icon'

const DEFAULT_SETTINGS: LlmSettings = {
  apiKey: '',
  baseURL: 'https://api.deepseek.com/v1',
  model: 'deepseek-v4-flash',
}

export function SettingsPage() {
  const [form, setForm] = useState<LlmSettings>(DEFAULT_SETTINGS)
  const [showKey, setShowKey] = useState(false)
  const [message, setMessage] = useState('')
  const [testResult, setTestResult] = useState<LlmTestResult | null>(null)

  const settingsQuery = useQuery({
    queryKey: ['llm-settings'],
    queryFn: fetchLlmSettings,
  })

  useEffect(() => {
    if (settingsQuery.data) {
      setForm({
        apiKey: settingsQuery.data.apiKey || '',
        baseURL: settingsQuery.data.baseURL || DEFAULT_SETTINGS.baseURL,
        model: settingsQuery.data.model || DEFAULT_SETTINGS.model,
      })
    }
  }, [settingsQuery.data])

  const saveMutation = useMutation({
    mutationFn: saveLlmSettings,
    onSuccess: (data) => {
      setForm({
        apiKey: data.apiKey || '',
        baseURL: data.baseURL || DEFAULT_SETTINGS.baseURL,
        model: data.model || DEFAULT_SETTINGS.model,
      })
      setMessage('设置已保存，下一次 AI 生成会使用新配置。')
    },
    onError: (error) => setMessage(`保存失败：${getApiErrorMessage(error)}`),
  })

  const testMutation = useMutation({
    mutationFn: testLlmSettings,
    onSuccess: (data) => {
      setTestResult(data)
      setMessage(data.ok ? '连接测试成功。' : `连接测试失败：${data.error || '未知错误'}`)
    },
    onError: (error) => {
      setTestResult(null)
      setMessage(`连接测试失败：${getApiErrorMessage(error)}`)
    },
  })

  const updateField = (field: keyof LlmSettings, value: string) => {
    setMessage('')
    setTestResult(null)
    setForm(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">应用设置</h1>
        <p className="text-text-secondary">配置 AI 模型接口。保存后无需重启，后续生成会直接使用这里的设置。</p>
      </div>

      <section className="bg-bg-card rounded-xl border border-border p-5 shadow-sm space-y-5 max-w-3xl">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-bg text-primary flex items-center justify-center">
            <Icon name="settings" />
          </div>
          <div>
            <h2 className="font-semibold text-text-primary">模型 API</h2>
            <p className="text-sm text-text-muted mt-1">适用于大纲、正文、角色、世界观、情节和文风分析。</p>
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-text-secondary">API Key</span>
          <div className="mt-1 flex gap-2">
            <input
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={event => updateField('apiKey', event.target.value)}
              placeholder={settingsQuery.data?.configured ? '已保存（留空则不修改）' : 'sk-...'}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-dark focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowKey(value => !value)}
              className="px-3 py-2 rounded-lg border border-border bg-bg-card text-text-secondary hover:text-text-primary"
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">
            密钥只保存在本地数据目录，不会写入故事内容；已保存的密钥不会再次显示。
          </p>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-text-secondary">Base URL</span>
          <input
            value={form.baseURL}
            onChange={event => updateField('baseURL', event.target.value)}
            placeholder="https://api.deepseek.com/v1"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-bg-dark focus:border-primary"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-text-secondary">Model</span>
          <input
            value={form.model}
            onChange={event => updateField('model', event.target.value)}
            placeholder="deepseek-v4-flash"
            className="mt-1 w-full px-3 py-2 rounded-lg border border-border bg-bg-dark focus:border-primary"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
            className="px-4 py-2 rounded-lg bg-primary text-white font-medium disabled:opacity-60"
          >
            {saveMutation.isPending ? '保存中...' : '保存设置'}
          </button>
          <button
            type="button"
            disabled={testMutation.isPending}
            onClick={() => testMutation.mutate(form)}
            className="px-4 py-2 rounded-lg border border-border bg-bg-card text-text-primary font-medium disabled:opacity-60"
          >
            {testMutation.isPending ? '测试中...' : '测试连接'}
          </button>
        </div>

        {message && (
          <div className={`rounded-lg px-3 py-2 text-sm ${
            message.includes('失败') ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'
          }`}>
            {message}
          </div>
        )}

        {testResult && (
          <div className="rounded-lg border border-border bg-bg-dark p-3 text-sm text-text-secondary space-y-1">
            <p>状态：{testResult.ok ? '可用' : '不可用'}</p>
            <p>接口：{testResult.baseURL}</p>
            <p>模型：{testResult.model}</p>
            {testResult.sample && <p>返回：{testResult.sample}</p>}
            {testResult.error && <p className="text-danger">错误：{testResult.error}</p>}
          </div>
        )}

        {settingsQuery.isLoading && <p className="text-sm text-text-muted">正在读取设置...</p>}
        {settingsQuery.isError && <p className="text-sm text-danger">读取设置失败：{getApiErrorMessage(settingsQuery.error)}</p>}
      </section>
    </div>
  )
}
