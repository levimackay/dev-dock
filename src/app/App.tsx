import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import { ToolPage } from './ToolPage'
import { NotFoundPage } from './NotFoundPage'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="t/:toolId" element={<ToolPage />} />
        {/* Old-style /tool/:id links keep working. */}
        <Route path="tool/:toolId" element={<Navigate to=".." relative="path" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
