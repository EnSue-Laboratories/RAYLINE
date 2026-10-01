/** Element renderers for the markdown components map (components.ts). */
import { type ComponentProps, type ReactNode, useContext, useState } from "react";
import type { ExtraProps } from "react-markdown";
import type { Element, ElementContent } from "hast";
import { useFontScale } from "../../contexts/FontSizeContext";
import AssistantImage from "../message/AssistantImage";
import { CopyBtn, InteractiveBlock, MermaidBlock, ValueControlBlock } from "../message/blocks";
import { parseImageFenceBody, resolveMarkdownImgSrc } from "../message/images";
import HighlightedCode from "./CodeBlock";
import { MarkdownRenderContext, TEXT_WRAP_STYLE } from "./context";
import { languageFromClassName } from "./languages";

type Props<K extends keyof React.JSX.IntrinsicElements> = ComponentProps<K> & ExtraProps;

/** Plain text of rendered children (code fences hand us strings). */
function nodeText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map((child: ReactNode) => nodeText(child)).join("");
  return "";
}

function hastText(node: ElementContent | undefined): string {
  if (!node || node.type !== "element") return "";
  return node.children.map((child) => ("value" in child ? child.value : "")).join("");
}

function codeChild(node: Element | undefined): Element | undefined {
  const first = node?.children[0];
  return first?.type === "element" ? first : undefined;
}

function classList(node: Element | undefined): string[] {
  const className = node?.properties.className;
  if (Array.isArray(className)) return className.map(String);
  return typeof className === "string" ? className.split(/\s+/) : [];
}

function PreBlock({ rawText, children }: { rawText: string; children: ReactNode }) {
  const s = useFontScale();
  const [hovered, setHovered] = useState(false);
  return (
    <pre
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "var(--code-bg)",
        border: "1px solid var(--pane-border)",
        borderRadius: 8,
        padding: "12px 14px",
        overflow: "auto",
        fontSize: s(12),
        fontFamily: "var(--font-mono)",
        margin: "8px 0 12px",
        lineHeight: 1.6,
        position: "relative",
      }}
    >
      <div style={{ position: "absolute", top: 6, right: 6, opacity: hovered ? 1 : 0, transition: "opacity .15s" }}>
        <CopyBtn text={rawText} />
      </div>
      {children}
    </pre>
  );
}

export function Code({ node, className, children, ...props }: Props<"code">) {
  const s = useFontScale();
  const render = useContext(MarkdownRenderContext);
  const language = languageFromClassName(className);
  const text = nodeText(children);
  const isBlock = node?.position?.start.line !== node?.position?.end.line || text.includes("\n");
  if (!isBlock) {
    return (
      <code style={{ background: "var(--code-bg)", padding: "2px 5px", borderRadius: 4, fontSize: "0.85em", fontFamily: "var(--font-mono)" }} {...props}>
        {children}
      </code>
    );
  }
  const codeString = text.replace(/\n$/, "");
  if (language === "render") return <InteractiveBlock code={codeString} isStreaming={render.isStreaming} />;
  if (language === "control") {
    return (
      <ValueControlBlock
        json={codeString}
        isStreaming={render.isStreaming}
        onAnswer={render.onAnswer}
        onControlChange={render.onControlChange}
        canControlTarget={render.canControlTarget}
      />
    );
  }
  if (language === "image") {
    const image = parseImageFenceBody(codeString);
    return image ? <AssistantImage {...image} /> : null;
  }
  if (language) return <HighlightedCode code={codeString} language={language} />;
  return (
    <code style={{ fontFamily: "var(--font-mono)", fontSize: s(12) }} {...props}>
      {children}
    </code>
  );
}

export function Pre({ node, children }: Props<"pre">) {
  const render = useContext(MarkdownRenderContext);
  const codeNode = codeChild(node);
  const classes = classList(codeNode);
  const text = hastText(codeNode);
  if (classes.includes("language-mermaid")) return <MermaidBlock code={text.replace(/\n$/, "")} />;
  if (classes.includes("language-render")) return <InteractiveBlock code={text.replace(/\n$/, "")} isStreaming={render.isStreaming} />;
  if (classes.includes("language-control")) {
    return (
      <ValueControlBlock
        json={text.replace(/\n$/, "")}
        isStreaming={render.isStreaming}
        onAnswer={render.onAnswer}
        onControlChange={render.onControlChange}
        canControlTarget={render.canControlTarget}
      />
    );
  }
  if (classes.includes("language-image")) {
    const image = parseImageFenceBody(text.replace(/\n$/, ""));
    return image ? <AssistantImage {...image} /> : null;
  }
  return <PreBlock rawText={text}>{children}</PreBlock>;
}

export function Img({ src, alt, title }: Props<"img">) {
  return <AssistantImage {...resolveMarkdownImgSrc(typeof src === "string" ? src : undefined, alt || title || "")} />;
}

export function Heading({ level, children }: { level: 1 | 2 | 3; children: ReactNode }) {
  const s = useFontScale();
  const Tag = `h${level}` as const;
  const size = level === 1 ? 20 : level === 2 ? 17 : 15;
  const margin = level === 1 ? "16px 0 8px" : level === 2 ? "14px 0 6px" : "12px 0 4px";
  return <Tag style={{ fontSize: s(size), fontWeight: 600, margin, ...TEXT_WRAP_STYLE }}>{children}</Tag>;
}

export function Blockquote({ children }: Props<"blockquote">) {
  const s = useFontScale();
  return (
    <blockquote
      style={{
        borderLeft: "2px solid var(--border-strong)",
        paddingLeft: 14,
        margin: "8px 0",
        color: "var(--text-muted)",
        fontFamily: "var(--font-content)",
        fontStyle: "italic",
        fontSize: s(13),
        lineHeight: 1.7,
        ...TEXT_WRAP_STYLE,
      }}
    >
      {children}
    </blockquote>
  );
}

export function Anchor({ href, children }: Props<"a">) {
  if (!href || href.startsWith("javascript:")) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: "var(--link-text)", textDecoration: "none" }}
      onMouseEnter={(event) => {
        event.currentTarget.style.textDecoration = "underline";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.textDecoration = "none";
      }}
    >
      {children}
    </a>
  );
}

export function Table({ children }: Props<"table">) {
  const s = useFontScale();
  return <table style={{ width: "100%", borderCollapse: "collapse", margin: "8px 0 12px", fontSize: s(13) }}>{children}</table>;
}

export function Paragraph({ children }: Props<"p">) {
  return <p style={{ margin: "0 0 12px", ...TEXT_WRAP_STYLE }}>{children}</p>;
}

export function UnorderedList({ children }: Props<"ul">) {
  return <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>{children}</ul>;
}

export function OrderedList({ children, start }: Props<"ol">) {
  return (
    <ol start={start} style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
      {children}
    </ol>
  );
}

export function ListItem({ children }: Props<"li">) {
  return <li style={{ marginBottom: 4, ...TEXT_WRAP_STYLE }}>{children}</li>;
}

export function H1({ children }: Props<"h1">) {
  return <Heading level={1}>{children}</Heading>;
}

export function H2({ children }: Props<"h2">) {
  return <Heading level={2}>{children}</Heading>;
}

export function H3({ children }: Props<"h3">) {
  return <Heading level={3}>{children}</Heading>;
}

export function Strong({ children }: Props<"strong">) {
  return <strong style={{ fontWeight: 600, color: "var(--text-primary)" }}>{children}</strong>;
}

export function TableHead({ children }: Props<"thead">) {
  return <thead style={{ borderBottom: "1px solid var(--control-border)" }}>{children}</thead>;
}

export function TableHeader({ children }: Props<"th">) {
  return <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontWeight: 600, color: "var(--text-secondary)" }}>{children}</th>;
}

export function TableCell({ children }: Props<"td">) {
  return <td style={{ padding: "4px 12px 4px 0", color: "var(--text-subtle)" }}>{children}</td>;
}

export function Rule() {
  return <hr style={{ border: "none", borderTop: "1px solid var(--control-border)", margin: "16px 0" }} />;
}
