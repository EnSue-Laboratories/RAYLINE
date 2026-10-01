import { describe, expect, it } from "vitest";
import { hasHtml, hasMath, sanitizeText, splitControlBlocks, splitMarkdownBlocks } from "../splitBlocks";
import { languageFromClassName, normalizeLanguage } from "../languages";
import { selectPlugins } from "../plugins";
import type { HtmlPlugins, MathPlugins } from "../lazyModules";

describe("splitMarkdownBlocks", () => {
  it("splits top-level blocks at blank lines", () => {
    expect(splitMarkdownBlocks("# Title\n\nPara one\nstill one\n\nPara two")).toEqual(["# Title\n", "Para one\nstill one\n", "Para two"]);
  });

  it("returns [] for empty text and one block without blank lines", () => {
    expect(splitMarkdownBlocks("")).toEqual([]);
    expect(splitMarkdownBlocks("a\nb")).toEqual(["a\nb"]);
  });

  it("never splits inside a fenced code block (``` and ~~~, longer closers)", () => {
    const text = "intro\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\nafter";
    expect(splitMarkdownBlocks(text)).toEqual(["intro\n", "```js\nconst a = 1;\n\nconst b = 2;\n```\n", "after"]);
    const tilde = "~~~~\nx\n\n~~~\nstill code\n~~~~\n\nout";
    expect(splitMarkdownBlocks(tilde)).toEqual(["~~~~\nx\n\n~~~\nstill code\n~~~~\n", "out"]);
  });

  it("keeps an unclosed fence (streaming) as the tail block", () => {
    const text = "intro\n\n```py\nprint(1)\n\nprint(2)";
    expect(splitMarkdownBlocks(text)).toEqual(["intro\n", "```py\nprint(1)\n\nprint(2)"]);
  });

  it("does not treat a fence line with an info string as a closer", () => {
    expect(splitMarkdownBlocks("```\na\n```js\n\nb\n```\n\nc")).toEqual(["```\na\n```js\n\nb\n```\n", "c"]);
  });

  it("never splits inside $$ math, but inline $$x$$ does not open a block", () => {
    expect(splitMarkdownBlocks("$$\na\n\nb\n$$\n\nnext")).toEqual(["$$\na\n\nb\n$$\n", "next"]);
    expect(splitMarkdownBlocks("$$x$$\n\nnext")).toEqual(["$$x$$\n", "next"]);
    expect(splitMarkdownBlocks("$$ a\n\nb $$\n\nc")).toEqual(["$$ a\n\nb $$\n", "c"]);
  });

  it("keeps indented continuations and consecutive list items together", () => {
    expect(splitMarkdownBlocks("- one\n\n  more of one\n- two\n\nAfter")).toEqual(["- one\n\n  more of one\n- two\n", "After"]);
    expect(splitMarkdownBlocks("1. a\n\n2. b\n\n3. c")).toEqual(["1. a\n\n2. b\n\n3. c"]);
    expect(splitMarkdownBlocks("Intro\n\n- a\n- b")).toEqual(["Intro\n", "- a\n- b"]);
  });

  it("falls back to one block for reference definitions and block HTML", () => {
    expect(splitMarkdownBlocks("See [x].\n\n[x]: https://e.com")).toEqual(["See [x].\n\n[x]: https://e.com"]);
    expect(splitMarkdownBlocks("<details>\n\nbody\n\n</details>")).toEqual(["<details>\n\nbody\n\n</details>"]);
    expect(splitMarkdownBlocks("inline <b>bold</b>\n\nnext")).toEqual(["inline <b>bold</b>\n", "next"]);
  });

  it("earlier blocks are stable as the text grows (only the tail changes)", () => {
    const full = "# A\n\nfirst para\n\n```ts\nlet x = 1;\n```\n\nlast para grows";
    let previous: string[] = [];
    for (let i = 1; i <= full.length; i += 1) {
      const blocks = splitMarkdownBlocks(full.slice(0, i));
      for (let b = 0; b < previous.length - 1; b += 1) expect(blocks[b]).toBe(previous[b]);
      previous = blocks;
    }
    expect(previous).toEqual(["# A\n", "first para\n", "```ts\nlet x = 1;\n```\n", "last para grows"]);
  });

  it("joining the blocks reproduces the text", () => {
    const text = "a\n\n\nb\n\n```\n\n```\n\n- x\n\n  y\n\nz\n";
    expect(splitMarkdownBlocks(text).join("\n")).toBe(text);
  });
});

describe("splitControlBlocks", () => {
  it("extracts closed control fences and keeps surrounding markdown", () => {
    expect(splitControlBlocks('before\n```control\n{"a":1}\n```\nafter')).toEqual([
      { type: "markdown", text: "before\n" },
      { type: "control", json: '{"a":1}' },
      { type: "markdown", text: "\nafter" },
    ]);
  });

  it("leaves unclosed control fences as markdown and handles empty text", () => {
    expect(splitControlBlocks("```control\n{")).toEqual([{ type: "markdown", text: "```control\n{" }]);
    expect(splitControlBlocks("")).toEqual([{ type: "markdown", text: "" }]);
  });

  it("is safe to call repeatedly (no shared regex state)", () => {
    const text = "```control\n1\n```";
    expect(splitControlBlocks(text)).toEqual(splitControlBlocks(text));
  });
});

describe("text helpers", () => {
  it("escapes think tags into inline code", () => {
    expect(sanitizeText("a <thinking>x</thinking> b")).toBe("a `<thinking>`x`</thinking>` b");
  });

  it("detects HTML and math cheaply", () => {
    expect(hasHtml("a < b")).toBe(false);
    expect(hasHtml("a <br> b")).toBe(true);
    expect(hasHtml("</div>")).toBe(true);
    expect(hasMath("costs 5")).toBe(false);
    expect(hasMath("$x$")).toBe(true);
  });

  it("normalizes fence languages", () => {
    expect(normalizeLanguage("TS")).toBe("typescript");
    expect(normalizeLanguage("sh")).toBe("bash");
    expect(normalizeLanguage("c++")).toBe("cpp");
    expect(normalizeLanguage("haskell")).toBe("haskell");
    expect(languageFromClassName("language-c++")).toBe("c++");
    expect(languageFromClassName("language-render")).toBe("render");
    expect(languageFromClassName(undefined)).toBeNull();
  });
});

describe("selectPlugins", () => {
  const math: MathPlugins = { remarkPlugins: [() => undefined], rehypePlugins: [() => undefined] };
  const html: HtmlPlugins = { rehypePlugins: [() => undefined] };

  it("returns one cached plugin set per combination", () => {
    const plain = selectPlugins("assistant", null, null);
    expect(plain.rehypePlugins).toHaveLength(0);
    expect(selectPlugins("assistant", html, null)).toBe(selectPlugins("assistant", html, null));
    expect(selectPlugins("assistant", null, math)).toBe(selectPlugins("assistant", null, math));
    expect(selectPlugins("assistant", html, math)).toBe(selectPlugins("assistant", html, math));
    expect(selectPlugins("assistant", html, null)).not.toBe(plain);
  });

  it("user bubbles only use GFM", () => {
    expect(selectPlugins("user", html, math)).toBe(selectPlugins("assistant", null, null));
  });

  it("orders sanitize before KaTeX and appends remark-math", () => {
    const set = selectPlugins("assistant", html, math);
    expect(set.remarkPlugins).toHaveLength(2);
    expect(set.rehypePlugins).toEqual([...html.rehypePlugins, ...math.rehypePlugins]);
  });
});
