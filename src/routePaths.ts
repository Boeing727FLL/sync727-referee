/**
 * Paths owned by the BrowserRouter tree. Everything else is the landing
 * page, which must render OUTSIDE any router: its embedded referee carries
 * its own MemoryRouter, and a router inside a router crashes the app.
 */
const ROUTER_PATHS = ['/app', '/login', '/privacy'];

export function isRouterPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return ROUTER_PATHS.includes(normalized);
}

/** Hand the page back to the router-free landing shell (App listens to popstate). */
export function escapeToLanding() {
  const { search, hash } = window.location;
  window.history.replaceState(window.history.state, '', '/' + search + hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
