/** Route shell. The public landing page starts without router, Firebase, or app code. */
import {lazy, startTransition, Suspense, useEffect, useState} from 'react';
import LandingPage, {hasSavedSession} from './pages/LandingPage';
import {warmIdleRoutes} from './routeWarmup';

const RouterApp = lazy(() => import('./RouterApp'));

/** A quiet route-coloured frame for direct deep links, never a blocking message. */
function RouteFrame() {
  return <main className="h-full bg-slate-950" aria-hidden />;
}

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  const isLandingRoute = pathname === '/';
  const likelyPath = hasSavedSession() ? '/app' : '/login';

  useEffect(() => {
    const onPopState = () => startTransition(() => setPathname(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isLandingRoute) return;
    warmIdleRoutes(likelyPath);
  }, [isLandingRoute, likelyPath]);

  return (
    <div className="h-screen-fix w-full">
      <Suspense fallback={<RouteFrame />}>
        {isLandingRoute
          ? <LandingPage />
          : <RouterApp />}
      </Suspense>
    </div>
  );
}
