import {Suspense, useEffect} from 'react';
import {escapeToLanding} from './routePaths';
import { lazyWithReload } from './lib/lazyWithReload';
import {BrowserRouter, Route, Routes} from 'react-router-dom';

const RefereeApp = lazyWithReload('referee-app', () => import('./pages/RefereeApp'));
const LoginPage = lazyWithReload('login-page', () => import('./pages/LoginPage'));
const PrivacyPage = lazyWithReload('privacy-page', () => import('./pages/PrivacyPage'));

function RouteFrame() {
  return <main className="h-full" style={{ background: 'linear-gradient(178deg,#082A63 0%,#0B3478 45%,#0D367A 72%,#22306F 100%)' }} aria-hidden />;
}

/**
 * Unknown paths and in-app navigations to '/' (logout) leave the router
 * tree: the landing embeds its own router and must never render inside
 * this one ("You cannot render a <Router> inside another <Router>").
 */
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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<LandingEscape />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
