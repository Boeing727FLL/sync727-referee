/**
 * Keeps request assembly behind the latest rulebook listing and exposes a
 * synchronous snapshot after that listing settles. React state alone is not
 * enough here: an async list can resolve in the same turn as a send, before
 * React has rendered the new files into the send handler's closure.
 */
export function createRulebookLoadBarrier<T>(initial: T) {
  let current = initial;
  let pending: Promise<T> | null = null;

  return {
    snapshot: () => current,
    replace(value: T) {
      current = value;
    },
    load(loader: () => Promise<T>): Promise<T> {
      if (pending) return pending;
      const request = loader().then(value => {
        current = value;
        return value;
      });
      pending = request;
      void request.finally(() => {
        if (pending === request) pending = null;
      }).catch(() => {});
      return request;
    },
    async refresh(loader: () => Promise<T>): Promise<T> {
      if (pending) {
        try { await pending; } catch { /* retry below */ }
      }
      return this.load(loader);
    },
    async ready(): Promise<T> {
      if (pending) await pending;
      return current;
    },
  };
}
