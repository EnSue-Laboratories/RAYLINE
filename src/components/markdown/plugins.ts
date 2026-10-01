import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";
import { htmlRehypePlugins } from "./htmlPlugins";
import type { MathPlugins } from "./lazyModules";

export interface PluginSet {
  readonly remarkPlugins: PluggableList;
  readonly rehypePlugins: PluggableList;
}

/** `assistant` (and system output) gets HTML + math; `user` bubbles only GFM. */
export type MarkdownVariant = "assistant" | "user";

// Module constants: react-markdown rebuilds its processor when these change.
const GFM: PluginSet = { remarkPlugins: [remarkGfm], rehypePlugins: [] };
const GFM_HTML: PluginSet = { remarkPlugins: [remarkGfm], rehypePlugins: htmlRehypePlugins };

let mathSets: { source: MathPlugins; plain: PluginSet; html: PluginSet } | null = null;

function getMathSets(math: MathPlugins): { plain: PluginSet; html: PluginSet } {
  if (mathSets?.source !== math) {
    const remarkPlugins: PluggableList = [remarkGfm, ...math.remarkPlugins];
    mathSets = {
      source: math,
      plain: { remarkPlugins, rehypePlugins: math.rehypePlugins },
      html: { remarkPlugins, rehypePlugins: math.rehypePluginsWithHtml },
    };
  }
  return mathSets;
}

/**
 * Smallest plugin set that renders `text` correctly: rehype-raw/sanitize only
 * with HTML present, remark-math/KaTeX only with `$` present (and loaded).
 */
export function selectPlugins(variant: MarkdownVariant, needsHtml: boolean, math: MathPlugins | null): PluginSet {
  if (variant === "user") return GFM;
  if (math) {
    const sets = getMathSets(math);
    return needsHtml ? sets.html : sets.plain;
  }
  return needsHtml ? GFM_HTML : GFM;
}
