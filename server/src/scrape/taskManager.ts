import { getDatabase } from '../db/index.js'
import { runScrapeTask } from './engine.js'

/**
 * 抓取任务管理器。
 *
 * - 每个任务是一条独立的后台异步循环，天然支持多本书同时抓取。
 * - 任务状态全部持久化到 scrape_tasks / scrape_books，页面刷新后可继续查询展示。
 * - 服务重启后 running/queued 的任务会被标记为中断（failed），避免“僵尸任务”。
 */

interface RunningState {
  cancel: boolean
}

const running = new Map<string, RunningState>()

/** 是否正在运行（含 queued/running） */
export function isRunning(taskId: string): boolean {
  return running.has(taskId)
}

/** 启动一个任务（后台执行，不阻塞调用方） */
export function startTask(taskId: string): void {
  if (running.has(taskId)) return
  const state: RunningState = { cancel: false }
  running.set(taskId, state)

  // 后台执行；任务内部会自行捕获异常并写库
  void runScrapeTask(taskId, () => state.cancel).finally(() => {
    running.delete(taskId)
  })
}

/** 请求取消任务（任务会在下一个章节边界停下） */
export function cancelTask(taskId: string): boolean {
  const state = running.get(taskId)
  if (!state) return false
  state.cancel = true
  return true
}

/** 服务启动时调用：把中断的排队/运行中任务标记为失败，书籍恢复空闲 */
export function recoverInterruptedTasks(): void {
  const db = getDatabase()
  db.prepare(
    `UPDATE scrape_tasks
     SET status = 'failed', error = '服务器重启，任务中断', current_title = '', finished_at = datetime('now'), updated_at = datetime('now')
     WHERE status IN ('queued', 'running')`,
  ).run()
  db.prepare(`UPDATE scrape_books SET status = 'idle', error = '' WHERE status = 'scraping'`).run()
}
