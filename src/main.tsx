import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './styles/base.css'
import { App } from './app/App'
import { PreferencesProvider } from './app/preferences'
import { ToastProvider } from './components/Toast'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PreferencesProvider>
    </BrowserRouter>
  </StrictMode>,
)
