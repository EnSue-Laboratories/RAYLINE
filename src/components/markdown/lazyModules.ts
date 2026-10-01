/**
 * Heavy markdown dependencies loaded on first use (memoized import promises),
 * so neither Prism nor KaTeX is part of the startup bundle (PERF #7).
 */
import { useEffect, useSyncExternalStore } from "react";
import type { PluggableList } from "unified";
import { htmlRehypePlugins } from "./htmlPlugins";
import type * as PrismLight from "./prismLight";

export type PrismModule = typeof PrismLight;

export interface MathPlugins {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
  /** Same, with rehype-raw + rehype-sanitize before KaTeX. */
  rehypePluginsWithHtml: PluggableList;
}

interface LazyModule<T> {
  readonly get: () => T | null;
  readonly load: () => Promise<T>;
  readonly subscribe: (listener: () => void) => () => void;
}

function lazyModule<T>(loader: () => Promise<T>): LazyModule<T> {
  let value: T | null = null;
  let promise: Promise<T> | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    load: () => {
      promise ??= loader().then((loaded) => {
        value = loaded;
        for (const listener of listeners) listener();
        return loaded;
      });
      return promise;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const prismModule = lazyModule<PrismModule>(() => import("./prismLight"));

export const mathModule = lazyModule<MathPlugins>(async () => {
  const [{ default: remarkMath }, { default: rehypeKatex }] = await Promise.all([
    import("remark-math"),
    import("rehype-katex"),
    import("katex/dist/katex.min.css"),
  ]);
  return {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
    rehypePluginsWithHtml: [...htmlRehypePlugins, rehypeKatex],
  };
});

/** The loaded module, or null while `needed` triggers (or awaits) its load. */
export function useLazyModule<T>(module: LazyModule<T>, needed: boolean): T | null {
  const value = useSyncExternalStore(module.subscribe, module.get, module.get);
  useEffect(() => {
    if (needed && !value) void module.load().catch(() => undefined);
  }, [module, needed, value]);
  return needed ? value : null;
}
