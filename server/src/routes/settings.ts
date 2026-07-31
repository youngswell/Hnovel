import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { getLlmConfig, saveLlmConfig, testLlmConfig } from '../config/llm.js'
import { validateBody } from '../middleware/validation.js'

export const settingsRouter = Router()

const llmConfigSchema = z.object({
  apiKey: z.string().max(10000).default(''),
  baseURL: z.string().trim().min(1, 'Base URL不能为空').max(1000),
  model: z.string().trim().min(1, '模型名称不能为空').max(200),
})

function publicLlmConfig(config: ReturnType<typeof getLlmConfig>) {
  return {
    apiKey: '',
    baseURL: config.baseURL,
    model: config.model,
    configured: !!config.apiKey,
  }
}

settingsRouter.get('/llm', (_req: Request, res: Response) => {
  res.json(publicLlmConfig(getLlmConfig()))
})

settingsRouter.put('/llm', validateBody(llmConfigSchema), (req: Request, res: Response) => {
  const current = getLlmConfig()
  const config = saveLlmConfig({
    apiKey: req.body.apiKey.trim() || current.apiKey,
    baseURL: req.body.baseURL,
    model: req.body.model,
  })
  res.json(publicLlmConfig(config))
})

settingsRouter.post('/llm/test', validateBody(llmConfigSchema.partial().optional()), async (req: Request, res: Response) => {
  const current = getLlmConfig()
  const body = req.body || {}
  const config = {
    apiKey: typeof body.apiKey === 'string' && body.apiKey.trim() ? body.apiKey.trim() : current.apiKey,
    baseURL: typeof body.baseURL === 'string' && body.baseURL.trim() ? body.baseURL.trim() : current.baseURL,
    model: typeof body.model === 'string' && body.model.trim() ? body.model.trim() : current.model,
  }

  try {
    res.json(await testLlmConfig(config))
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: !!config.apiKey,
      baseURL: config.baseURL,
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})
