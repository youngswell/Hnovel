import { Router, Request, Response } from 'express'
import multer from 'multer'
import { parseEpub } from '../import/epub.js'
import { ensureStory, upsertChapter } from '../scrape/engine.js'

export const importRouter = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
})

// 导入 EPUB：自动（或按 title 覆盖）创建/复用故事，按 spine 顺序写入章节
importRouter.post('/epub', upload.single('file'), (req: Request, res: Response) => {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (!file) {
    return res.status(400).json({ error: '请上传 EPUB 文件（字段名 file）', code: 'NO_FILE' })
  }
  if (!/\.epub$/i.test(file.originalname)) {
    return res.status(400).json({ error: '仅支持 EPUB 格式', code: 'BAD_FORMAT' })
  }

  try {
    const book = parseEpub(file.buffer)

    const titleOverride = typeof req.body.title === 'string' && req.body.title.trim() ? req.body.title.trim() : ''
    const storyTitle = titleOverride || book.title
    const storyId = ensureStory(storyTitle)

    const startChapter = Math.max(1, Number(req.body.start_chapter) || 1)
    let imported = 0
    const chapterTitles: Array<{ number: number; title: string }> = []
    for (const [i, ch] of book.chapters.entries()) {
      const number = startChapter + i
      upsertChapter(storyId, number, ch.title || `第${number}章`, ch.content)
      imported++
      chapterTitles.push({ number, title: ch.title || `第${number}章` })
    }

    res.json({
      story_id: storyId,
      story_title: storyTitle,
      imported,
      total: book.chapters.length,
      source_title: book.title,
      creator: book.creator,
      first: chapterTitles[0] || null,
      last: chapterTitles[chapterTitles.length - 1] || null,
    })
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'EPUB 解析失败',
      code: 'PARSE_FAILED',
    })
  }
})
