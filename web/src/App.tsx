import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import pkg from '../package.json'
import { Layout } from './components/Layout'
import { HomePage } from './pages/HomePage'
import { StoryPage } from './pages/StoryPage'
import { BiblePage } from './pages/BiblePage'
import { CharactersPage } from './pages/CharactersPage'
import { CharacterDetailPage } from './pages/CharacterDetailPage'
import { WorldPage } from './pages/WorldPage'
import { PlotPage } from './pages/PlotPage'
import { ChaptersPage } from './pages/ChaptersPage'
import { ChapterEditPage } from './pages/ChapterEditPage'
import { WritePage } from './pages/WritePage'
import { SettingsPage } from './pages/SettingsPage'
import { ScrapePage } from './pages/ScrapePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function resolveTitle(pathname: string): string {
  if (pathname === '/') return '工作台'
  if (pathname === '/scrape') return '文章抓取'
  if (pathname === '/settings') return '应用设置'
  if (/^\/story\/[^/]+\/write/.test(pathname)) return 'AI写作'
  if (/^\/story\/[^/]+\/chapters\/\d+/.test(pathname)) return '章节编辑'
  if (/^\/story\/[^/]+\/chapters/.test(pathname)) return '章节列表'
  if (/^\/story\/[^/]+\/characters\/[^/]+/.test(pathname)) return '角色详情'
  if (/^\/story\/[^/]+\/characters/.test(pathname)) return '角色管理'
  if (/^\/story\/[^/]+\/bible/.test(pathname)) return '故事圣经'
  if (/^\/story\/[^/]+\/world/.test(pathname)) return '世界观'
  if (/^\/story\/[^/]+\/plot/.test(pathname)) return '情节管理'
  if (/^\/story\/[^/]+/.test(pathname)) return '故事仪表盘'
  return '工作台'
}

function RouteTitleSetter() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.title = `${pkg.name} - ${resolveTitle(pathname)}`
  }, [pathname])
  return null
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RouteTitleSetter />
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/scrape" element={<ScrapePage />} />
            <Route path="/story/:id" element={<StoryPage />} />
            <Route path="/story/:id/bible" element={<BiblePage />} />
            <Route path="/story/:id/characters" element={<CharactersPage />} />
            <Route path="/story/:id/characters/:cid" element={<CharacterDetailPage />} />
            <Route path="/story/:id/world" element={<WorldPage />} />
            <Route path="/story/:id/plot" element={<PlotPage />} />
            <Route path="/story/:id/chapters" element={<ChaptersPage />} />
            <Route path="/story/:id/chapters/:num" element={<ChapterEditPage />} />
            <Route path="/story/:id/write" element={<WritePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
