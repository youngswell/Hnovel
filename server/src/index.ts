import express from 'express'
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'
import { storyRouter } from './routes/stories.js'
import { chapterRouter } from './routes/chapters.js'
import { characterRouter } from './routes/characters.js'
import { exportRouter } from './routes/export.js'
import { planningRouter } from './routes/planning.js'
import { settingsRouter } from './routes/settings.js'
import { scrapeRouter } from './routes/scrape.js'
import { importRouter } from './routes/import.js'
import { initDatabase } from './db/index.js'
import { errorHandler, notFoundHandler } from './middleware/errors.js'
import { getLlmConfig, testLlmConfig } from './config/llm.js'
import { recoverInterruptedTasks } from './scrape/taskManager.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 4000)
const WEB_DIST_DIR = path.resolve(process.cwd(), '..', 'web', 'dist')

// Long timeout for AI generation endpoints
app.use((_req, res, next) => {
  res.setTimeout(600_000) // 10 minutes
  next()
})

app.use(express.json({ limit: '10mb' }))

// API Routes
app.use('/api/stories', storyRouter)
app.use('/api/stories', chapterRouter)
app.use('/api/stories', characterRouter)
app.use('/api/stories', exportRouter)
app.use('/api/stories', planningRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/scrape', scrapeRouter)
app.use('/api/import', importRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' })
})

app.get('/api/health/llm', async (_req, res) => {
  const config = getLlmConfig()
  if (!config.apiKey) return res.status(400).json(await testLlmConfig(config))
  try {
    res.json(await testLlmConfig(config))
  } catch (error) {
    res.status(502).json({
      ok: false,
      configured: true,
      baseURL: config.baseURL,
      model: config.model,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIST_DIR, 'index.html'))
  })
}

app.use(notFoundHandler)
app.use(errorHandler)

// Initialize database and start server
initDatabase()
recoverInterruptedTasks()

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Hnovel Server] Running on http://127.0.0.1:${PORT}`)
})

export default app
