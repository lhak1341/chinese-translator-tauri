import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
// Import Tauri API wrapper to expose window.electronAPI
import './tauriAPI'

// Development tools - expose lookup index test functions to console
if (import.meta.env.DEV) {
  import('./utils/setupLookupIndexTest.js');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
