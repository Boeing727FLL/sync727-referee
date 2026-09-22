/**
 * transport-guard.mjs — fail-closed network guard for LOCAL test harnesses.
 *
 * Test-only utility: it is imported by puppeteer harness scripts and never
 * shipped in the app bundle, so it cannot affect production traffic. Any
 * HTTP(S) request to a production backend host is aborted and recorded, and
 * any non-local WebSocket / EventSource / sendBeacon attempt throws in-page
 * and is recorded. The harness must exit non-zero when violations exist.
 */

/** Production hosts a local harness must never contact. */
export const PROD_DENY = [
  /(^|\.)firebaseio\.com$/,
  /(^|\.)firebasedatabase\.app$/,
  /(^|\.)googleapis\.com$/,
  /(^|\.)cloudflarestorage\.com$/,
  /(^|\.)r2\.dev$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)google-analytics\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)gstatic\.com$/,
  /(^|\.)gravatar\.com$/,
];

export const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
export const isLocalHost = (host) => host === '127.0.0.1' || host === 'localhost';
export const isDeniedHost = (host) => !isLocalHost(host) && PROD_DENY.some((re) => re.test(host));

/**
 * Page-side guard: installed with page.evaluateOnNewDocument(pageGuard).
 * Records violations on window.__guardViolations and throws for non-local
 * socket constructors so the attempt never reaches the network stack.
 */
export function pageGuard() {
  window.__guardViolations = [];
  const allowWs = (u) => { try { const h = new URL(u).hostname; return h === '127.0.0.1' || h === 'localhost'; } catch { return false; } };
  const NativeWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (!allowWs(String(url))) {
      window.__guardViolations.push('WS ' + String(url).slice(0, 140));
      throw new Error('guard: WebSocket to non-local host blocked: ' + String(url).slice(0, 80));
    }
    return protocols ? new NativeWS(url, protocols) : new NativeWS(url);
  };
  window.WebSocket.prototype = NativeWS.prototype;
  for (const [k, v] of [['CONNECTING', 0], ['OPEN', 1], ['CLOSING', 2], ['CLOSED', 3]]) {
    Object.defineProperty(window.WebSocket, k, { value: v });
  }
  if (window.EventSource) {
    const NativeES = window.EventSource;
    window.EventSource = function (url) {
      if (!allowWs(String(url))) {
        window.__guardViolations.push('ES ' + String(url).slice(0, 140));
        throw new Error('guard: EventSource to non-local host blocked');
      }
      return new NativeES(url);
    };
    window.EventSource.prototype = NativeES.prototype;
  }
  const nativeBeacon = navigator.sendBeacon?.bind(navigator);
  if (nativeBeacon) navigator.sendBeacon = (url, data) => {
    if (!allowWs(String(url))) { window.__guardViolations.push('BEACON ' + String(url).slice(0, 140)); return false; }
    return nativeBeacon(url, data);
  };
}

/** Decide one intercepted request: 'mock' callers run first; anything left
 *  over is denied (abort + record) or allowed to continue (local only). */
export function decideRequest(req, violations, log = () => {}) {
  const url = req.url();
  const host = hostOf(url);
  if (isDeniedHost(host)) {
    violations.push(req.method() + ' ' + url.slice(0, 140));
    log('GUARD-BLOCKED:', req.method(), url.slice(0, 140));
    req.abort();
    return 'blocked';
  }
  if (!isLocalHost(host)) log('PASS-NONLOCAL:', req.method(), url.slice(0, 130));
  req.continue();
  return 'continued';
}
