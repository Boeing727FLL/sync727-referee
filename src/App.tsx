/** Route shell. The public landing page starts without router, Firebase, or app code. */
import {startTransition, Suspense, useEffect, useState} from 'react';
import { lazyWithReload } from './lib/lazyWithReload';
import LandingPage, {hasSavedSession} from './pages/LandingPage';
import {warmIdleRoutes} from './routeWarmup';
import {isRouterPath} from './routePaths';

const RouterApp = lazyWithReload('router-app', () => import('./RouterApp'));

/** A quiet route-coloured frame for direct deep links, never a blocking message. */
function RouteFrame() {
  return <main className="h-full" style={{ background: 'linear-gradient(178deg,#082A63 0%,#0B3478 45%,#0D367A 72%,#22306F 100%)' }} aria-hidden />;
}

export default function App() {
  const [pathname, setPathname] = useState(window.location.pathname);
  // Any path the router does not own (/, /index.html, stray or mistyped
  // paths) is the landing page, rendered without a router.
  const isLandingRoute = !isRouterPath(pathname);
  const likelyPath = hasSavedSession() ? '/app' : '/login';

  useEffect(() => {
    const onPopState = () => startTransition(() => setPathname(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isLandingRoute || window.location.pathname === '/') return;
    const { search, hash } = window.location;
    window.history.replaceState(window.history.state, '', '/' + search + hash);
  }, [isLandingRoute]);

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
