import { unzipSync } from 'fflate'
import { innerHtmlToText } from '../scrape/engine.js'

export interface EpubChapter {
  title: string
  content: string
}

export interface EpubBook {
  title: string
  creator: string
  chapters: EpubChapter[]
}

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))
  return m ? m[1] : ''
}

function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    mdash: '—', hellip: '…', ldquo: '\u201c', rdquo: '\u201d',
    lsquo: '\u2018', rsquo: '\u2019', middot: '·', times: '×',
  }
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => {
      try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '\uFFFD' }
    })
    .replace(/&#(\d+);/g, (_, d: string) => {
      try { return String.fromCodePoint(parseInt(d, 10)) } catch { return '\uFFFD' }
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => (name in named ? named[name] : m))
}

function cleanXmlText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

/** 按文件头部声明的编码解码（EPUB 常见 UTF-8，个别 GBK） */
function decodeBytes(bytes: Uint8Array): string {
  const head = new TextDecoder('utf-8').decode(bytes.slice(0, 1024))
  const m = head.match(/encoding\s*=\s*["']([\w-]+)["']/i) || head.match(/charset\s*=\s*["']?\s*([\w-]+)/i)
  const enc = m ? m[1].toLowerCase() : 'utf-8'
  if (enc === 'utf-8' || enc === 'utf8') return new TextDecoder('utf-8').decode(bytes)
  try {
    return new TextDecoder(enc === 'gb2312' ? 'gbk' : enc).decode(bytes)
  } catch {
    return new TextDecoder('utf-8').decode(bytes)
  }
}

/** 从 XHTML 中提取章节标题与正文文本 */
function extractXhtml(html: string, path: string): { title: string; content: string } {
  const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyInner = bodyM ? bodyM[1] : html
  const content = innerHtmlToText(bodyInner)

  let title = ''
  const h = html.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i)
  if (h) title = cleanXmlText(h[1])
  if (!title) {
    const tm = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (tm) title = cleanXmlText(tm[1])
  }
  if (!title) {
    // 回退：用文件名
    const base = path.split('/').pop() || path
    title = base.replace(/\.(x?html?|xhtm)$/i, '').replace(/[-_]+/g, ' ').trim()
  }
  return { title, content }
}

/**
 * 解析 EPUB 文件（ZIP 容器）。
 * - 读取 META-INF/container.xml 定位 OPF
 * - 读取 OPF 的元数据（标题/作者）与 spine（章节顺序）
 * - 按 spine 顺序提取各 XHTML 章节正文
 */
export function parseEpub(buffer: Buffer): EpubBook {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(new Uint8Array(buffer))
  } catch {
    throw new Error('无法解压文件，请确认是有效的 EPUB（ZIP）文件')
  }

  // 大小写/前导斜杠容错查找
  const findFile = (name: string): string | null => {
    if (files[name]) return name
    const norm = name.replace(/^\/+/, '')
    const found = Object.keys(files).find((k) => k.replace(/^\/+/, '') === norm)
    return found ?? null
  }

  // 1. container.xml → OPF 路径
  const containerPath = findFile('META-INF/container.xml')
  if (!containerPath) throw new Error('EPUB 缺少 META-INF/container.xml')
  const container = decodeBytes(files[containerPath])
  const opfMatch = container.match(/<rootfile\b[^>]*full-path\s*=\s*["']([^"']+)["']/i)
  if (!opfMatch) throw new Error('EPUB container.xml 中找不到 OPF 根文件')
  const opfPath = findFile(opfMatch[1].trim())
  if (!opfPath) throw new Error(`EPUB 中找不到 OPF 文件：${opfMatch[1].trim()}`)

  // 2. OPF 元数据与清单
  const opf = decodeBytes(files[opfPath])
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''
  const resolvePath = (href: string): string => {
    const clean = href.split('#')[0].replace(/^\/+/, '')
    if (!clean) return ''
    return (opfDir ? `${opfDir}/${clean}` : clean).replace(/\/{2,}/g, '/')
  }

  const titleM = opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)
  const creatorM = opf.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i)
  const title = (titleM ? cleanXmlText(titleM[1]) : '').trim() || '未命名'
  const creator = creatorM ? cleanXmlText(creatorM[1]).trim() : ''

  const manifest = new Map<string, string>()
  const itemRe = /<item\b[^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(opf))) {
    const id = attr(m[0], 'id')
    const href = attr(m[0], 'href')
    if (id && href) manifest.set(id, href)
  }

  const spineIds: string[] = []
  const spineRe = /<itemref\b[^>]*>/gi
  while ((m = spineRe.exec(opf))) {
    const idref = attr(m[0], 'idref')
    if (idref) spineIds.push(idref)
  }
  if (spineIds.length === 0) throw new Error('EPUB 没有 spine（找不到章节顺序）')

  // 3. 按 spine 顺序提取章节
  const chapters: EpubChapter[] = []
  for (const idref of spineIds) {
    const href = manifest.get(idref)
    if (!href) continue
    const path = resolvePath(href)
    const data = path ? files[path] : undefined
    if (!data) continue
    const html = decodeBytes(data)
    const { title: chTitle, content } = extractXhtml(html, path)
    if (!content) continue
    chapters.push({ title: chTitle, content })
  }
  if (chapters.length === 0) throw new Error('EPUB 解析后没有提取到任何章节正文')

  return { title, creator, chapters }
}
