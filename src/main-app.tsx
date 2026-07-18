import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';

// Intercept console.warn to suppress benign Recharts responsive container complaints
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = function (this: any, ...args: any[]) {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      (args[0].includes('The width') || 
       args[0].includes('height(-1)') || 
       args[0].includes('of chart should be greater than 0'))
    ) {
      return;
    }
    originalWarn.apply(this || console, args);
  };
}

// Global API routing interceptor for external hosting environments such as Netlify or Capacitor
if (typeof window !== 'undefined') {
  (function() {
    const isExternalHost = window.location.hostname !== 'localhost' && 
                           window.location.hostname !== '127.0.0.1' && 
                           !window.location.hostname.endsWith('.run.app');
                           
    if (!isExternalHost) {
      // Do not override fetch on native dev/preview environments to avoid plugin conflicts
      return;
    }

    let currentFetch = window.fetch;
    if (!currentFetch) return;

    const customFetchWrapper = function(this: any, input: RequestInfo | URL, init?: RequestInit) {
      let url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as Request).url);
      
      if (url && typeof url === 'string' && url.startsWith('/api/')) {
        const backendUrl = "https://ais-pre-efpemh7lk3pzigbn2moe43-356398029929.europe-west2.run.app";
        url = `${backendUrl}${url}`;
        if (input instanceof Request) {
          input = new Request(url, input);
        } else {
          input = url;
        }
      }
      return currentFetch.call(this || window, input, init);
    };

    try {
      Object.defineProperty(window, 'fetch', {
        value: customFetchWrapper,
        writable: true,
        configurable: true,
        enumerable: true
      });
    } catch (e) {
      console.warn("Unable to override window.fetch.", e);
    }
  })();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
