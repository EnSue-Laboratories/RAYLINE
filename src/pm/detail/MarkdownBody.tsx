import { memo, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MONO_FONT } from "../styles";

const REMARK_PLUGINS = [remarkGfm];

const inlineCodeStyle: CSSProperties = {
  background: "var(--pane-border)",
  padding: "1px 5px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: MONO_FONT,
};

function hasNewline(children: ReactNode): boolean {
  if (typeof children === "string") return children.includes("\n");
  return Array.isArray(children) && children.some((child) => typeof child === "string" && child.includes("\n"));
}

const codeComponents: Components = {
  code: ({ node, children, ...props }) => {
    const isBlock = node?.position?.start.line !== node?.position?.end.line || hasNewline(children);
    return (
      <code style={isBlock ? { fontSize: 12, fontFamily: MONO_FONT } : inlineCodeStyle} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        background: "var(--control-bg)",
        border: "1px solid var(--pane-border)",
        borderRadius: 6,
        padding: 12,
        overflowX: "auto",
        margin: "8px 0",
      }}
    >
      {children}
    </pre>
  ),
};

function link({ href, children }: { href?: string; children?: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--link-text)", textDecoration: "none" }}>
      {children}
    </a>
  );
}

/** Issue / PR body: roomier spacing and headings. */
const bodyComponents: Components = {
  ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 20, margin: "8px 0" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "8px 0" }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
  a: link,
  p: ({ children }) => <p style={{ margin: "8px 0" }}>{children}</p>,
  h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px", color: "var(--text-primary)" }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px", color: "var(--text-secondary)" }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px", color: "var(--text-secondary)" }}>{children}</h3>,
  ...codeComponents,
};

/** Comments: tighter spacing. */
const commentComponents: Components = {
  ul: ({ children }) => <ul style={{ listStyle: "disc", paddingLeft: 20, margin: "6px 0" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 20, margin: "6px 0" }}>{children}</ol>,
  a: link,
  p: ({ children }) => <p style={{ margin: "6px 0" }}>{children}</p>,
  ...codeComponents,
};

interface MarkdownBodyProps {
  text: string | null;
  variant: "body" | "comment";
}

/**
 * GitHub-flavoured markdown with module-level plugin/component objects, memoized
 * on the text so polls and unrelated state changes don't re-parse it.
 */
function MarkdownBody({ text, variant }: MarkdownBodyProps) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={variant === "body" ? bodyComponents : commentComponents}>
      {text || ""}
    </ReactMarkdown>
  );
}

export default memo(MarkdownBody);
