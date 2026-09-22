import {Suspense} from 'react';
import { lazyWithReload } from './lib/lazyWithReload';
import {BrowserRouter, Route, Routes} from 'react-router-dom';

const RefereeApp = lazyWithReload('referee-app', () => import('./pages/RefereeApp'));
const LoginPage = lazyWithReload('login-page', () => import('./pages/LoginPage'));
const PrivacyPage = lazyWithReload('privacy-page', () => import('./pages/PrivacyPage'));
const LandingPage = lazyWithReload('landing-page', () => import('./pages/LandingPage'));

function RouteFrame() {
  return <main className="h-full bg-slate-950" aria-hidden />;
}

export default function RouterApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFrame />}>
        <Routes>
          <Route path="/app" element={<RefereeApp />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
