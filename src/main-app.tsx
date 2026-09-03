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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
