/**
 * Route warm-up policy.
 *
 * Dynamic imports are cached by the browser, so these functions can be called
 * from idle, hover and navigation without downloading a chunk twice.
 */
const routeImports = {
  router: () => import('./RouterApp'),
  app: () => import('./pages/RefereeApp'),
  login: () => import('./pages/LoginPage'),
  privacy: () => import('./pages/PrivacyPage'),
};

function connection() {
  return (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
}

/**
 * On a healthy connection, use otherwise-idle time to warm public routes in
 * parallel. Keep the large signed-in app out unless it is the likely target.
 * Slow connections and Save-Data do no speculative downloading.
 */
export function warmIdleRoutes(likelyPath: string) {
  const net = connection();
  if (net?.saveData || net?.effectiveType === 'slow-2g' || net?.effectiveType === '2g') return;

  const warm = () => {
    const publicRoutes = [routeImports.router(), routeImports.login(), routeImports.privacy()];
    if (likelyPath === '/app') publicRoutes.push(routeImports.app());
    void Promise.all(publicRoutes);
  };

  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) {
    idle(warm, { timeout: 2500 });
  } else {
    setTimeout(warm, 1200);
  }
}
