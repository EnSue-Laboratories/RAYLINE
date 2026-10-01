/**
 * Lazily loaded syntax highlighter (its own chunk, see lazyModules.ts):
 * PrismLight with the ~25 languages models emit most, every other Prism
 * grammar fetched on demand.
 */
// Loads @types/react-syntax-highlighter, which declares the dist/esm subpaths.
import type {} from "react-syntax-highlighter";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import docker from "react-syntax-highlighter/dist/esm/languages/prism/docker";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import kotlin from "react-syntax-highlighter/dist/esm/languages/prism/kotlin";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import php from "react-syntax-highlighter/dist/esm/languages/prism/php";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import ruby from "react-syntax-highlighter/dist/esm/languages/prism/ruby";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import swift from "react-syntax-highlighter/dist/esm/languages/prism/swift";
import toml from "react-syntax-highlighter/dist/esm/languages/prism/toml";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { normalizeLanguage } from "./languages";

// Grammar modules are untyped (`any`) in @types/react-syntax-highlighter.
const BUNDLED: Readonly<Record<string, unknown>> = {
  bash, c, cpp, css, diff, docker, go, java, javascript, json, jsx, kotlin, markdown, markup,
  php, python, ruby, rust, sql, swift, toml, tsx, typescript, yaml,
};

const registered = new Set<string>();
for (const [name, grammar] of Object.entries(BUNDLED)) {
  SyntaxHighlighter.registerLanguage(name, grammar);
  registered.add(name);
}

// Every other Prism grammar, one tiny chunk each.
const ON_DEMAND = import.meta.glob<{ default: unknown }>([
  "/node_modules/react-syntax-highlighter/dist/esm/languages/prism/*.js",
  "!**/index.js",
  "!**/supported-languages.js",
]);

const loaders = new Map<string, () => Promise<{ default: unknown }>>();
for (const [path, loader] of Object.entries(ON_DEMAND)) {
  const name = /([^/]+)\.js$/.exec(path)?.[1];
  if (name && !registered.has(name)) loaders.set(name, loader);
}

const pending = new Map<string, Promise<boolean>>();

/** Whether `language` can be highlighted right now. */
export function isLanguageReady(language: string): boolean {
  return registered.has(normalizeLanguage(language));
}

/** Register `language` (fetching its grammar when needed). Resolves false when unknown. */
export function ensureLanguage(language: string): Promise<boolean> {
  const name = normalizeLanguage(language);
  if (registered.has(name)) return Promise.resolve(true);
  const loader = loaders.get(name);
  if (!loader) return Promise.resolve(false);
  let promise = pending.get(name);
  if (!promise) {
    promise = loader().then(
      (module) => {
        SyntaxHighlighter.registerLanguage(name, module.default);
        registered.add(name);
        return true;
      },
      () => false,
    );
    pending.set(name, promise);
  }
  return promise;
}

export { SyntaxHighlighter, oneDark };
