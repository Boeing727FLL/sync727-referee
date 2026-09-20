/** Route shell. The public landing page deliberately starts without Firebase. */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const RefereeApp = lazy(() => import('./pages/RefereeApp'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

function LoadingScreen() {
  return <main className="grid h-full place-items-center bg-slate-950 text-sm text-slate-300">טוען…</main>;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-screen h-[100dvh] w-full">
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/app" element={<RefereeApp />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="*" element={<LandingPage />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}
