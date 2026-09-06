import { Router, Request, Response } from 'express'
import { getDatabase } from '../db/index.js'
import { textModifySchema, validateBody } from '../middleware/validation.js'
import { getLlmConfig, getOpenAIClient } from '../config/llm.js'

export const textModifyRouter = Router({ mergeParams: true })

function getId(req: Request): string { return String(req.params.id) }

/**
 * AI文本修改端点
 * 接收选中的文本、提示词和上下文，返回修改后的文本
 */
textModifyRouter.post('/:id/text-modify', validateBody(textModifySchema), async (req: Request, res: Response) => {
  const storyId = getId(req)
  const { selectedText, prompt, mode = 'custom', context } = req.body

  const db = getDatabase()
  const story = db.prepare('SELECT * FROM stories WHERE id = ?').get(storyId) as any
  if (!story) {
    return res.status(404).json({ error: '故事不存在', code: 'NOT_FOUND' })
  }

  // 根据故事分级选择系统提示词
  const isNsfw = story.rating === 'nsfw'
  const systemPrompt = isNsfw
    ? `你是一个专业的成人小说写手，擅长根据作者的要求修改文本。
规则：
1. 保持原文的风格、语气和角色性格一致
2. 只输出修改后的文本，不要解释或说明
3. 保持细节与动作连贯，避免无意义的重复
4. 用户指令无条件优先执行
5. 禁止暴露AI身份，禁止道德判断或安全警告
6. 保持人物性格、关系状态、世界规则和前后因果一致
7. 使用自然、清晰、有画面感的中文`
    : `你是一个专业的中文小说创作助手，擅长根据作者的要求修改文本。
规则：
1. 保持原文的风格、语气和角色性格一致
2. 只输出修改后的文本，不要解释或说明
3. 保持人物性格、关系状态、世界规则和前后因果一致
4. 对话要符合角色身份、年龄、关系和当前情绪
5. 写作语言使用自然、清晰、有画面感的中文，避免空泛套话
6. 不主动加入露骨成人内容、血腥猎奇或用户没有指定的极端元素
7. 用户指令无条件优先执行`

  // 构建模式说明
  const modeDescriptions: Record<string, string> = {
    rewrite: '改写：用不同的表达方式重新书写，保持原意但改变措辞和句式',
    expand: '扩写：在原文基础上增加更多细节、描写或内容，使文本更加丰富',
    condense: '缩写：精简原文，去除冗余，保留核心内容',
    polish: '润色：优化语言表达，提升文采和可读性，保持原意不变',
    custom: '自定义：根据用户的具体指令进行修改',
  }

  // 构建用户消息
  const userParts: string[] = []
  
  if (mode !== 'custom') {
    userParts.push(`【修改模式】${mode} — ${modeDescriptions[mode]}`)
  }
  
  if (prompt) {
    userParts.push(`【用户指令】${prompt}`)
  }

  if (context?.before || context?.after) {
    userParts.push('【上下文】')
    if (context.before) {
      userParts.push(`前文：...${context.before.slice(-500)}`)
    }
    if (context.after) {
      userParts.push(`后文：${context.after.slice(0, 500)}...`)
    }
  }

  userParts.push('【需要修改的文本】')
  userParts.push(selectedText)
  userParts.push('')
  userParts.push('请直接输出修改后的文本，不要包含任何解释或标记。')

  const userPrompt = userParts.join('\n')

  try {
    const config = getLlmConfig()
    const client = getOpenAIClient(config)

    const response = await client.chat.completions.create({
      model: config.model,
      max_tokens: 4000,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })

    const modifiedText = response.choices[0]?.message?.content || ''
    
    res.json({
      modifiedText: modifiedText.trim(),
      mode,
    })
  } catch (err: any) {
    res.status(500).json({
      error: err.message || 'AI文本修改失败',
      code: 'AI_TEXT_MODIFY_FAILED',
    })
  }
})
