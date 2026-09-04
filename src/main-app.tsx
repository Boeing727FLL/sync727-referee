import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Production: only critical errors reach the console.
// console.log and console.warn are silenced so internal details
// (filenames, timings, rotation state) are not exposed to visitors.
if (import.meta.env.PROD) {
  console.log = () => {};
  console.warn = () => {};
}

// Kill any stale service worker (e.g. old workbox builds) that intercepts
// fetches for this origin and breaks the page with "Failed to fetch".
// This app needs no offline worker, so every registration is removed
// along with its caches.
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  }).catch(() => {});
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((k) => caches.delete(k).catch(() => {}));
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
