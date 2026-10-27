import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installInteractions } from './lib/interactions';
import { registerOffline } from './lib/offlineMap';
import { installReveal } from './lib/reveal';
import './styles/global.css';

// Apply the saved Sun / Moon theme before the first paint, so light mode never flashes dark.
try {
  const t = (JSON.parse(localStorage.getItem('tg.prefs') ?? '{}') as { theme?: string }).theme;
  document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

installInteractions();
registerOffline();
requestAnimationFrame(() => installReveal());
// The journey has a clear beginning: reloads start at the top rather than mid-scroll.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
