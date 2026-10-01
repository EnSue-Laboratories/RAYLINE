/**
 * Pure text helpers for markdown rendering.
 *
 * `splitMarkdownBlocks` cuts text into top-level blocks so a streaming message
 * re-parses only its tail: earlier blocks are final once a later block starts,
 * and keep identical strings (so their memoized renders are skipped).
 */

export type MarkdownSegment = { type: "markdown"; text: string } | { type: "control"; json: string };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM_RE = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
// Reference definitions / footnotes resolve across the whole document.
const REFERENCE_DEF_RE = /^ {0,3}\[[^\]\n]+\]:/m;
// Block-level raw HTML may legitimately contain blank lines (<details>…).
const HTML_BLOCK_RE = /^ {0,3}<\/?[A-Za-z][\w-]*(?:[\s/>]|$)/m;

function countDoubleDollars(line: string): number {
  let count = 0;
  for (let i = line.indexOf("$$"); i !== -1; i = line.indexOf("$$", i + 2)) count += 1;
  return count;
}

/**
 * Split at blank lines that sit outside fenced code and `$$` math, when the
 * next line starts a new top-level block (not indented, not a list item
 * continuing a list). Returns `[text]` when splitting could change the
 * rendering (reference definitions, block HTML).
 */
export function splitMarkdownBlocks(text: string): string[] {
  if (!text) return [];
  if (REFERENCE_DEF_RE.test(text) || HTML_BLOCK_RE.test(text)) return [text];

  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: { char: string; length: number } | null = null;
  let inMath = false;
  let sawBlank = false;
  let lastContentLine = "";

  const pushBlock = (): void => {
    if (current.length > 0) blocks.push(current.join("\n"));
    current = [];
  };

  for (const line of lines) {
    if (fence) {
      current.push(line);
      const close = FENCE_RE.exec(line);
      const marker = close?.[1];
      if (marker && marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker) fence = null;
      continue;
    }
    if (inMath) {
      current.push(line);
      if (countDoubleDollars(line) % 2 === 1) inMath = false;
      continue;
    }

    if (line.trim() === "") {
      if (current.length > 0) sawBlank = true;
      current.push(line);
      continue;
    }

    const startsNewBlock =
      sawBlank && !/^[ \t]/.test(line) && !(LIST_ITEM_RE.test(line) && (LIST_ITEM_RE.test(lastContentLine) || /^[ \t]/.test(lastContentLine)));
    if (startsNewBlock) {
      // Trailing blank lines stay with the block they end.
      pushBlock();
    }
    sawBlank = false;
    current.push(line);
    lastContentLine = line;

    const open = FENCE_RE.exec(line);
    const marker = open?.[1];
    if (marker) {
      fence = { char: marker[0] ?? "`", length: marker.length };
    } else if (line.trimStart().startsWith("$$") && countDoubleDollars(line) % 2 === 1) {
      inMath = true;
    }
  }
  pushBlock();
  return blocks;
}

const CONTROL_BLOCK_RE = /```control\s*\n([\s\S]*?)```/g;

/** Pull closed ```control fences out as interactive segments; the rest stays markdown. */
export function splitControlBlocks(text: string): MarkdownSegment[] {
  if (!text) return [{ type: "markdown", text: "" }];
  const segments: MarkdownSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(CONTROL_BLOCK_RE)) {
    if (match.index > lastIndex) segments.push({ type: "markdown", text: text.slice(lastIndex, match.index) });
    segments.push({ type: "control", json: (match[1] ?? "").replace(/\n$/, "") });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ type: "markdown", text: text.slice(lastIndex) });
  return segments.length > 0 ? segments : [{ type: "markdown", text }];
}

/**
 * Escape non-standard tags rehype-raw would otherwise swallow (`<thinking>`)
 * by wrapping them in inline code.
 */
export function sanitizeText(text: string): string {
  if (!text) return text;
  return text.replace(/<\/?(?:think|thinking|antThinking)[^>]*>/gi, (match) => `\`${match}\``);
}

/** Raw HTML needs rehype-raw + rehype-sanitize; skip both (parse5) otherwise. */
export function hasHtml(text: string): boolean {
  return /<[a-z/]/i.test(text);
}

/** Math needs remark-math + rehype-katex (lazy chunk). */
export function hasMath(text: string): boolean {
  return text.includes("$");
}
