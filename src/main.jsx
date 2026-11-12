import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@lhak/style/react';
// The token contract first: index.css aliases the app's own variables onto it.
import '@lhak/style/tokens.css';
// Work Sans, SUSE and Rounded Mplus 1c, bundled; Bookerly and Noto Sans SC stay installed-only.
import '@lhak/style/fonts.css';
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
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
