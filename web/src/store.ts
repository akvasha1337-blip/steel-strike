import { useEffect, useReducer } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  sub(fn: () => void): () => void;
}

export function createStore<T extends object>(init: T): Store<T> {
  let state = init;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      subs.forEach((f) => f());
    },
    sub(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useStore<T extends object, R>(store: Store<T>, sel: (s: T) => R): R {
  const [, force] = useReducer((x: number, _a: void) => x + 1, 0);
  useEffect(() => {
    const un = store.sub(() => force());
    return () => {
      un();
    };
  }, [store]);
  return sel(store.get());
}

/** localStorage that never throws (private windows, blocked storage, sandboxed frames). */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? { ...fallback, ...JSON.parse(v) } : fallback;
    } catch {
      return fallback;
    }
  },
  getRaw<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  put(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
