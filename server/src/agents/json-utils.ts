import { getLlmConfig, getOpenAIClient } from '../config/llm.js'

// ---------------------------------------------------------------------------
// 从 LLM 返回文本中解析严格 JSON（含修复回退）
// ---------------------------------------------------------------------------

export function findFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const char = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

export function parseJsonObject(text: string): any {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const objectText = findFirstJsonObject(cleaned)
  const candidates = [cleaned, objectText].filter((item): item is string => Boolean(item))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'))
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`AI返回非JSON格式: ${text.slice(0, 500)}`)
}

export async function repairJsonObject(rawText: string, schemaHint: string): Promise<any> {
  const { model } = getLlmConfig()
  const response = await getOpenAIClient().chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 2000,
    messages: [
      { role: 'system', content: '你是严格JSON修复器。只能输出一个可被 JSON.parse 解析的 JSON 对象，不要输出Markdown、解释、代码块或前后缀。' },
      {
        role: 'user',
        content: `请把下面内容修复为严格JSON对象。\n\n目标字段：${schemaHint}\n\n原始内容：\n${rawText.slice(0, 8000)}`,
      },
    ],
  })

  const repaired = response.choices[0]?.message?.content || ''
  return parseJsonObject(repaired)
}

export async function parseOrRepairJsonObject(rawText: string, schemaHint: string): Promise<any> {
  try {
    return parseJsonObject(rawText)
  } catch {
    return repairJsonObject(rawText, schemaHint)
  }
}

// ---------------------------------------------------------------------------
// 字段规整工具
// ---------------------------------------------------------------------------

export function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  return String(value).trim() || fallback
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim()) {
    return value.split(/[，,；;\n]/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function asInt(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : fallback
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const s = asString(value)
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback
}
