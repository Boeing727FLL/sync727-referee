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
