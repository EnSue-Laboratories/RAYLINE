import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import type { HtmlPlugins, MathPlugins } from "./lazyModules";

export interface PluginSet {
  readonly remarkPlugins: PluggableList;
  readonly rehypePlugins: PluggableList;
}

/** `assistant` (and system output) gets HTML + math; `user` bubbles only GFM. */
export type MarkdownVariant = "assistant" | "user";

// react-markdown rebuilds its processor when the plugin arrays change, so each
// combination is created once and reused (module constants / one-time caches).
const GFM: PluginSet = { remarkPlugins: [remarkGfm], rehypePlugins: [] };

const combos = new Map<string, PluginSet>();
const ids = new WeakMap<object, number>();
let nextId = 1;

function idOf(value: object | null): number {
  if (!value) return 0;
  let id = ids.get(value);
  if (id === undefined) {
    id = nextId++;
    ids.set(value, id);
  }
  return id;
}

/**
 * Smallest plugin set that renders the text: rehype-raw/sanitize only with
 * HTML present (and loaded), remark-math/KaTeX only with `$` present (and
 * loaded). Raw HTML is sanitized before KaTeX runs, as before.
 */
export function selectPlugins(variant: MarkdownVariant, html: HtmlPlugins | null, math: MathPlugins | null): PluginSet {
  if (variant === "user" || (!html && !math)) return GFM;
  const key = `${idOf(html)}:${idOf(math)}`;
  let set = combos.get(key);
  if (!set) {
    set = {
      remarkPlugins: math ? [remarkGfm, ...math.remarkPlugins] : [remarkGfm],
      rehypePlugins: [...(html?.rehypePlugins ?? []), ...(math?.rehypePlugins ?? [])],
    };
    combos.set(key, set);
  }
  return set;
}
