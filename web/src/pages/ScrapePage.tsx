import { useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ScrapeSourcesTab } from './scrape/ScrapeSourcesTab'
import { ScrapeBooksTab } from './scrape/ScrapeBooksTab'
import { ScrapeTasksTab } from './scrape/ScrapeTasksTab'

const TABS = [
  { key: 'sources', label: '网站源', icon: 'globe', desc: '管理抓取源与识别规则' },
  { key: 'books', label: '已抓取书', icon: 'book', desc: '书籍管理、扫描与启动抓取' },
  { key: 'tasks', label: '抓取任务', icon: 'clock', desc: '执行进度、取消与多本并发' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function ScrapePage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as TabKey | null) || 'sources'

  const setTab = (key: TabKey) => {
    setParams({ tab: key }, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary mb-2">文章抓取</h1>
        <p className="text-text-secondary">从网络小说站点抓取章节，直接导入 Hnovel 故事库。</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-left p-4 rounded-xl border transition-all ${
              tab === t.key
                ? 'bg-primary-bg border-primary/30 shadow-sm'
                : 'bg-bg-card border-border hover:border-primary/30 hover:bg-bg-card/70'
            }`}
          >
            <div className={`flex items-center gap-2 mb-1 ${tab === t.key ? 'text-primary' : 'text-text-primary'}`}>
              <Icon name={t.icon} className="w-4 h-4" />
              <span className="font-medium">{t.label}</span>
            </div>
            <p className="text-xs text-text-muted">{t.desc}</p>
          </button>
        ))}
      </div>

      <section className="bg-bg-card rounded-xl border border-border p-5 shadow-sm">
        {tab === 'sources' && <ScrapeSourcesTab />}
        {tab === 'books' && <ScrapeBooksTab />}
        {tab === 'tasks' && <ScrapeTasksTab />}
      </section>
    </div>
  )
}
