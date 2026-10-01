import { type CSSProperties, useContext, useEffect, useState } from "react";
import { useFontScale } from "../../contexts/FontSizeContext";
import { MarkdownRenderContext } from "./context";
import { normalizeLanguage } from "./languages";
import { prismModule, type PrismModule, useLazyModule } from "./lazyModules";
import { useIdleReady } from "./useIdle";

/** Resolves once `language`'s grammar is registered or known to be unavailable. */
function useLanguageSettled(prism: PrismModule | null, language: string): boolean {
  const [settled, setSettled] = useState<string | null>(null);
  const ready = prism ? prism.isLanguageReady(language) : false;
  useEffect(() => {
    if (!prism || ready) return undefined;
    let alive = true;
    void prism.ensureLanguage(language).then(() => {
      if (alive) setSettled(language);
    });
    return () => {
      alive = false;
    };
  }, [prism, ready, language]);
  return ready || settled === language;
}

interface HighlightedCodeProps {
  code: string;
  language: string;
}

/**
 * Fenced code with a language. Renders plain monospace first (and for the
 * whole time its block streams); after commit, at idle, swaps in Prism
 * highlighting from the lazily loaded PrismLight chunk (PERF #6, #7).
 */
export default function HighlightedCode({ code, language }: HighlightedCodeProps) {
  const s = useFontScale();
  const { isStreaming } = useContext(MarkdownRenderContext);
  const idle = useIdleReady(!isStreaming);
  const prism = useLazyModule(prismModule, idle);
  const settled = useLanguageSettled(prism, language);

  if (prism && settled && !isStreaming) {
    const { SyntaxHighlighter, oneDark } = prism;
    return (
      <SyntaxHighlighter
        style={oneDark}
        language={normalizeLanguage(language)}
        PreTag="div"
        customStyle={{ background: "transparent", margin: 0, padding: 0, fontSize: s(12), fontFamily: "var(--font-mono)", lineHeight: 1.6 }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
      >
        {code}
      </SyntaxHighlighter>
    );
  }

  const plainStyle: CSSProperties = {
    display: "block",
    whiteSpace: "pre",
    fontSize: s(12),
    fontFamily: "var(--font-mono)",
    lineHeight: 1.6,
    color: "var(--text-secondary)",
  };
  return <code style={plainStyle}>{code}</code>;
}
