import { Navigate, Route, Routes } from 'react-router-dom'
import BooksPage from './pages/BooksPage'
import ReaderPage from './pages/ReaderPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BooksPage />} />
      <Route path="/:storyId" element={<ReaderPage />} />
      <Route path="/:storyId/:chapterNumber" element={<ReaderPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
