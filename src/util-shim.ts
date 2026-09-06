/** Node 'util' stub: vite.config aliases node:util here so browser-safe
 * dependencies importing it (e.g. mupdf) keep bundling. APIs are silent
 * no-ops except best-effort stringify. */
export function debuglog(name: string) {
  return function(...args: any[]) {
    // Silent logger
  };
}

export function inspect(obj: any, ...args: any[]) {
  try {
    return typeof obj === 'object' ? JSON.stringify(obj) : String(obj);
  } catch {
    return String(obj);
  }
}

export default {
  debuglog,
  inspect
};
