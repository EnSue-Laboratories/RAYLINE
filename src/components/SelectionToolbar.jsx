import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Quote, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function SelectionToolbar({ onQuote, model }) {
  const [sel, setSel] = useState(null); // { text, x, y }
  const [explanation, setExplanation] = useState(null); // { text, loading }
  const [explaining, setExplaining] = useState(false);
  const toolbarRef = useRef(null);

  const handleMouseUp = useCallback((e) => {
    // Ignore clicks inside the toolbar itself
    if (toolbarRef.current && toolbarRef.current.contains(e.target)) return;

    requestAnimationFrame(() => {
      const s = window.getSelection();
      const text = s?.toString().trim();
      if (!text) {
        if (!explanation && !explaining) setSel(null);
        return;
      }

      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSel({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      if (!explaining) setExplanation(null);
    });
  }, [explanation, explaining]);

  const dismiss = useCallback(() => {
    setSel(null);
    setExplanation(null);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") dismiss();
    };
    const onClick = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        const s = window.getSelection();
        if (!s?.toString().trim()) dismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [dismiss]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  if (!sel) return null;

  const handleExplain = async () => {
    if (explaining) return;
    setExplaining(true);
    setExplanation({ text: "", loading: true });
    try {
      const result = await window.api.quickExplain({ text: sel.text, model });
      setExplanation({ text: result || "No response.", loading: false });
    } catch {
      setExplanation({ text: "Could not get explanation.", loading: false });
    }
    setExplaining(false);
  };

  const handleQuote = () => {
    onQuote?.(sel.text);
    setSel(null);
    setExplanation(null);
    window.getSelection()?.removeAllRanges();
  };

  // Clamp position and decide if toolbar goes above or below selection
  const clampX = Math.max(180, Math.min(sel.x, window.innerWidth - 180));
  const showBelow = sel.y < 280; // flip below if too close to top

  return (
    <div
      ref={toolbarRef}
      style={{
        position: "fixed",
        left: clampX,
        top: showBelow ? sel.y + 30 : sel.y - 6,
        transform: showBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
        zIndex: 9999,
        animation: "selToolbarIn .15s ease",
      }}
    >
      <div style={{
        display: "flex",
        flexDirection: showBelow ? "column" : "column",
        alignItems: "center",
      }}>
        {/* Explanation pane — above toolbar (or below if flipped) */}
        {!showBelow && explanation && <ExplainPane explanation={explanation} position="above" />}

        {/* Toolbar pill */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          background: "rgba(30,30,30,0.95)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: explanation
            ? (showBelow ? "10px 10px 0 0" : "0 0 10px 10px")
            : 10,
          padding: "3px 4px",
          backdropFilter: "blur(20px)",
          boxShadow: explanation ? "none" : "0 8px 32px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.06)",
        }}>
          <ToolbarBtn
            label={explaining ? "Thinking..." : "Explain"}
            onClick={handleExplain}
            active={!!explanation}
          />
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.08)" }} />
          <ToolbarBtn
            label="Quote"
            onClick={handleQuote}
          />
        </div>

        {showBelow && explanation && <ExplainPane explanation={explanation} position="below" />}

        {/* Arrow */}
        {!explanation && !showBelow && (
          <div style={{
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid rgba(30,30,30,0.95)",
            marginTop: -1,
          }} />
        )}
      </div>
    </div>
  );
}

function ToolbarBtn({ label, onClick, active }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 7,
        border: "none",
        background: active ? "rgba(255,255,255,0.1)" : hovered ? "rgba(255,255,255,0.06)" : "transparent",
        color: active ? "rgba(255,255,255,0.9)" : hovered ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.55)",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "system-ui,sans-serif",
        fontWeight: 500,
        transition: "all .15s",
        letterSpacing: ".01em",
      }}
    >
      {label}
    </button>
  );
}

function ExplainPane({ explanation, position }) {
  return (
    <div style={{
      width: 340,
      maxHeight: 260,
      overflowY: "auto",
      background: "rgba(24,24,24,0.97)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: position === "above" ? "10px 10px 0 0" : "0 0 10px 10px",
      padding: "10px 14px",
      backdropFilter: "blur(20px)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      marginBottom: position === "above" ? -1 : 0,
      marginTop: position === "below" ? -1 : 0,
    }}>
      {explanation.loading ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "rgba(255,255,255,0.4)",
          fontSize: 12,
          fontFamily: "system-ui,sans-serif",
        }}>
          <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
          Thinking...
        </div>
      ) : (
        <div style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
          lineHeight: 1.6,
          fontFamily: "'Newsreader','Iowan Old Style',Georgia,serif",
          letterSpacing: "0.005em",
        }}>
          <Markdown remarkPlugins={[remarkGfm]}>
            {explanation.text}
          </Markdown>
        </div>
      )}
    </div>
  );
}
