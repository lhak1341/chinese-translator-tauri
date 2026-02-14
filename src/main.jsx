import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
// Import Tauri API wrapper to expose window.electronAPI
import './tauriAPI';
import { clearPanelLayoutStorage } from './utils/clearPanelLayoutStorage';

// Clear persisted panel layout from localStorage once at startup so default
// panel sizes are always respected on first load.
clearPanelLayoutStorage();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
