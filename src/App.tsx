/** Route shell. The public landing page starts without router, Firebase, or app code. */
import {lazy, startTransition, Suspense, useCallback, useEffect, useState} from 'react';
import LandingPage, {hasSavedSession} from './pages/LandingPage';
import {warmIdleRoutes, warmRoute} from './routeWarmup';

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

  const openRoute = useCallback((to: string) => {
    const url = new URL(to, window.location.href);
    // Keep the complete landing screen visible while router and destination
    // download together. Once both are ready, the transition is immediate.
    void warmRoute(url.pathname).then(() => {
      window.history.pushState(null, '', `${url.pathname}${url.search}${url.hash}`);
      startTransition(() => setPathname(url.pathname));
    });
  }, []);

  return (
    <div className="h-screen h-[100dvh] w-full">
      <Suspense fallback={<RouteFrame />}>
        {isLandingRoute
          ? <LandingPage onNavigate={openRoute} onWarmRoute={(to) => void warmRoute(new URL(to, window.location.href).pathname)} />
          : <RouterApp />}
      </Suspense>
    </div>
  );
}
