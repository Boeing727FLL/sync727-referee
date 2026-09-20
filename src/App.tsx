/** Route shell. The public landing page starts without router, Firebase, or app code. */
import {lazy, Suspense} from 'react';
import LandingPage from './pages/LandingPage';
const RouterApp = lazy(() => import('./RouterApp'));

function LoadingScreen() {
  return <main className="grid h-full place-items-center bg-slate-950 text-sm text-slate-300">טוען…</main>;
}

export default function App() {
  const isLandingRoute = window.location.pathname === '/';

  return (
    <div className="h-screen h-[100dvh] w-full">
      <Suspense fallback={<LoadingScreen />}>
        {isLandingRoute ? <LandingPage /> : <RouterApp />}
      </Suspense>
    </div>
  );
}
