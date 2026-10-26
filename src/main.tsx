import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installInteractions } from './lib/interactions';
import { installReveal } from './lib/reveal';
import './styles/global.css';

installInteractions();
requestAnimationFrame(() => installReveal());
// The journey has a clear beginning: reloads start at the top rather than mid-scroll.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
