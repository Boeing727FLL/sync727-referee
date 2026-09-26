import {Suspense, useEffect} from 'react';
import {escapeToLanding} from './routePaths';
import { lazyWithReload } from './lib/lazyWithReload';
import {BrowserRouter, Route, Routes} from 'react-router-dom';

const RefereeApp = lazyWithReload('referee-app', () => import('./pages/RefereeApp'));
const PrivacyPage = lazyWithReload('privacy-page', () => import('./pages/PrivacyPage'));

function RouteFrame() {
  return <main className="h-full" style={{ background: 'linear-gradient(178deg,#082A63 0%,#0B3478 45%,#0D367A 72%,#22306F 100%)' }} aria-hidden />;
}

/**
 * Unknown paths and in-app navigations to '/' (logout) leave the router
 * tree: the landing embeds its own router and must never render inside
 * this one ("You cannot render a <Router> inside another <Router>").
 */
/**
 * Legacy '/login' links: the standalone login page is gone, so the URL
 * becomes '/?login=1' and the landing opens directly on its login stage.
 */
function LegacyLoginRedirect() {
  useEffect(() => {
    window.history.replaceState(window.history.state, '', '/?login=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);
  return <RouteFrame />;
}
function LandingEscape() {
  useEffect(() => { escapeToLanding(); }, []);
  return <RouteFrame />;
}

export default function RouterApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFrame />}>
        <Routes>
          <Route path="/app" element={<RefereeApp />} />
          <Route path="/login" element={<LegacyLoginRedirect />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<PrivacyPage />} />
          <Route path="*" element={<LandingEscape />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
