/** Application routing shell. Route screens are split into separate chunks. */
import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { LanguageProvider } from './hooks/useLanguage';

const RefereePage = lazy(() => import('./pages/PublicRulebookAI'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));

function LoadingScreen() {
  return <main className="grid h-full place-items-center bg-slate-950 text-sm text-slate-300">טוען את השופט…</main>;
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <div className="h-screen h-[100dvh] w-full">
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<RefereePage />} />
                <Route path="/app" element={<RefereePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="*" element={<RefereePage />} />
              </Routes>
            </Suspense>
          </div>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
