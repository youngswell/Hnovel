import fs from 'fs'
import path from 'path'
import OpenAI from 'openai'

export interface LlmConfig {
  apiKey: string
  baseURL: string
  model: string
}

interface AppSettings {
  llm?: Partial<LlmConfig>
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-v4-flash'

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), '..', 'story-output')
}

function getSettingsPath(): string {
  return path.join(getDataDir(), 'app-settings.json')
}

function readSettings(): AppSettings {
  const filePath = getSettingsPath()
  if (!fs.existsSync(filePath)) return {}

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as AppSettings
  } catch {
    return {}
  }
}

function writeSettings(settings: AppSettings) {
  const filePath = getSettingsPath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
}

export function getLlmConfig(): LlmConfig {
  const llm = readSettings().llm || {}

  return {
    apiKey: typeof llm.apiKey === 'string' ? llm.apiKey : (process.env.LLM_API_KEY || ''),
    baseURL: typeof llm.baseURL === 'string' && llm.baseURL.trim()
      ? llm.baseURL.trim()
      : (process.env.LLM_BASE_URL || DEFAULT_BASE_URL),
    model: typeof llm.model === 'string' && llm.model.trim()
      ? llm.model.trim()
      : (process.env.LLM_MODEL || DEFAULT_MODEL),
  }
}

export function saveLlmConfig(config: LlmConfig): LlmConfig {
  const current = readSettings()
  const next: AppSettings = {
    ...current,
    llm: {
      apiKey: config.apiKey.trim(),
      baseURL: config.baseURL.trim(),
      model: config.model.trim(),
    },
  }
  writeSettings(next)
  return getLlmConfig()
}

export function getOpenAIClient(config = getLlmConfig()): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })
}

export async function testLlmConfig(config = getLlmConfig()) {
  if (!config.apiKey) {
    return {
      ok: false,
      configured: false,
      baseURL: config.baseURL,
      model: config.model,
      error: 'LLM_API_KEY is not configured',
    }
  }

  const response = await getOpenAIClient(config).chat.completions.create({
    model: config.model,
    max_tokens: 8,
    temperature: 0,
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  })

  return {
    ok: true,
    configured: true,
    baseURL: config.baseURL,
    model: config.model,
    sample: response.choices[0]?.message?.content || '',
  }
}
