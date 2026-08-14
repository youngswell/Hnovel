import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import BooksPage from './pages/BooksPage'

// 阅读器依赖 rebook（体积较大），按需加载，避免拖慢书架首屏
const ReaderPage = lazy(() => import('./pages/ReaderPage'))

export default function App() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-bg-dark text-text-muted"><p>正在打开…</p></div>}>
      <Routes>
        <Route path="/" element={<BooksPage />} />
        <Route path="/:storyId" element={<ReaderPage />} />
        <Route path="/:storyId/:chapterNumber" element={<ReaderPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
