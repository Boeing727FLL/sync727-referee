import {lazy, Suspense} from 'react';
import {BrowserRouter, Route, Routes} from 'react-router-dom';

const RefereeApp = lazy(() => import('./pages/RefereeApp'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));

function LoadingScreen() {
  return <main className="grid h-full place-items-center bg-slate-950 text-sm text-slate-300">טוען…</main>;
}

export default function RouterApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen />}>
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
