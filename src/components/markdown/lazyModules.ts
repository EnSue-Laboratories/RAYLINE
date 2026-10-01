/**
 * Heavy markdown dependencies loaded on first use (memoized import promises),
 * so Prism, KaTeX and rehype-raw/parse5 stay out of the startup bundle
 * (PERF #7). Until a module arrives the text renders without it.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { PluggableList } from "unified";
import type * as PrismLight from "./prismLight";

export type PrismModule = typeof PrismLight;

export interface MathPlugins {
  remarkPlugins: PluggableList;
  rehypePlugins: PluggableList;
}

/** rehype-raw (parse5) + rehype-sanitize, only needed when the text has HTML. */
export interface HtmlPlugins {
  rehypePlugins: PluggableList;
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
  return { remarkPlugins: [remarkMath], rehypePlugins: [rehypeKatex] };
});

export const htmlModule = lazyModule<HtmlPlugins>(async () => {
  const { htmlRehypePlugins } = await import("./htmlPlugins");
  return { rehypePlugins: htmlRehypePlugins };
});

/** The loaded module, or null while `needed` triggers (or awaits) its load. */
export function useLazyModule<T>(module: LazyModule<T>, needed: boolean): T | null {
  const value = useSyncExternalStore(module.subscribe, module.get, module.get);
  useEffect(() => {
    if (needed && !value) void module.load().catch(() => undefined);
  }, [module, needed, value]);
  return needed ? value : null;
}
