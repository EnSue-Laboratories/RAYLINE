import { useState, useEffect, useRef, useCallback, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFontScale } from "../contexts/FontSizeContext";

import { copyText } from "../utils/exportHelpers";

const REMARK_PLUGINS = [remarkGfm];

interface SelectionAnchor {
  text: string;
  x: number;
  y: number;
}

interface Explanation {
  text: string;
  loading: boolean;
}

export interface SelectionToolbarProps {
  onQuote?: (text: string) => void;
  /** Model id passed to quick-explain. */
  model: string;
  /** Only selections inside this element show the toolbar. */
  selectionRootRef: RefObject<HTMLElement | null> | null | undefined;
}

function getContainerNode(node: Node | null): Node | null {
  if (!node) return null;
  return node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
}

function containsNode(root: HTMLElement, node: Node | null): boolean {
  return node !== null && root.contains(node);
}

function isInside(element: HTMLElement | null, target: EventTarget | null): boolean {
  return Boolean(element && target instanceof Node && element.contains(target));
}

export default function SelectionToolbar({ onQuote, model, selectionRootRef }: SelectionToolbarProps) {
  const [sel, setSel] = useState<SelectionAnchor | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [explaining, setExplaining] = useState(false);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const selectionRangeRef = useRef<Range | null>(null);

  const dismiss = useCallback(() => {
    setSel(null);
    setExplanation(null);
  }, []);

  const isSelectionInRoot = useCallback((selection: Selection | null): selection is Selection => {
    const root = selectionRootRef?.current;
    if (!root || !selection || selection.rangeCount === 0) return false;
    return containsNode(root, getContainerNode(selection.anchorNode))
      && containsNode(root, getContainerNode(selection.focusNode));
  }, [selectionRootRef]);

  const restoreSelection = useCallback(() => {
    const range = selectionRangeRef.current;
    if (!range) return;

    const selection = window.getSelection();
    if (!selection) return;

    try {
      selection.removeAllRanges();
      selection.addRange(range.cloneRange());
    } catch {
      selectionRangeRef.current = null;
    }
  }, []);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    // Ignore clicks inside the toolbar itself
    if (isInside(toolbarRef.current, e.target)) return;

    requestAnimationFrame(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || !isSelectionInRoot(selection)) {
        dismiss();
        return;
      }

      const range = selection.getRangeAt(0);
      selectionRangeRef.current = range.cloneRange();
      const rect = range.getBoundingClientRect();
      setSel({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      if (!explaining) setExplanation(null);
    });
  }, [dismiss, explaining, isSelectionInRoot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    const onClick = (e: MouseEvent) => {
      if (toolbarRef.current && !isInside(toolbarRef.current, e.target)) {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (!text || !isSelectionInRoot(selection)) dismiss();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [dismiss, isSelectionInRoot]);

  useEffect(() => {
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, [handleMouseUp]);

  if (!sel) return null;

  const handleExplain = async () => {
    if (explaining) return;
    restoreSelection();
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
    window.setTimeout(() => restoreSelection(), 0);
    dismiss();
  };

  const handleCopy = async () => {
    try {
      await copyText(sel.text);
    } catch {
      // Keep the toolbar open if copying fails so the user can retry.
      return;
    }
    restoreSelection();
    dismiss();
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
          background: "var(--surface-glass)",
          border: "1px solid var(--border)",
          borderRadius: explanation
            ? (showBelow ? "10px 10px 0 0" : "0 0 10px 10px")
            : 10,
          padding: "3px 4px",
          backdropFilter: "blur(20px)",
          boxShadow: explanation ? "none" : "var(--shadow-md)",
        }}>
          <ToolbarBtn
            label={explaining ? "Thinking..." : "Explain"}
            onClick={() => { void handleExplain(); }}
            active={!!explanation}
          />
          <div style={{ width: 1, height: 14, background: "var(--border)" }} />
          <ToolbarBtn
            label="Quote"
            onClick={handleQuote}
          />
          <div style={{ width: 1, height: 14, background: "var(--border)" }} />
          <ToolbarBtn
            label="Copy"
            onClick={() => { void handleCopy(); }}
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
            borderTop: "5px solid var(--surface-glass)",
            marginTop: -1,
          }} />
        )}
      </div>
    </div>
  );
}

interface ToolbarBtnProps {
  label: string;
  onClick: () => void;
  active?: boolean;
}

function ToolbarBtn({ label, onClick, active = false }: ToolbarBtnProps) {
  const s = useFontScale();
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 10px",
        borderRadius: 7,
        border: "none",
        background: active ? "var(--bg-tertiary)" : hovered ? "var(--hover-overlay)" : "transparent",
        color: active ? "var(--text-primary)" : hovered ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "pointer",
        fontSize: s(11),
        fontFamily: "var(--font-ui)",
        fontWeight: 500,
        transition: "all .15s",
        letterSpacing: ".01em",
      }}
    >
      {label}
    </button>
  );
}

interface ExplainPaneProps {
  explanation: Explanation;
  position: "above" | "below";
}

function ExplainPane({ explanation, position }: ExplainPaneProps) {
  const s = useFontScale();
  return (
    <div style={{
      width: 340,
      maxHeight: 260,
      overflowY: "auto",
      background: "var(--surface-glass)",
      border: "1px solid var(--border)",
      borderRadius: position === "above" ? "10px 10px 0 0" : "0 0 10px 10px",
      padding: "10px 14px",
      backdropFilter: "blur(20px)",
      boxShadow: "var(--shadow-md)",
      marginBottom: position === "above" ? -1 : 0,
      marginTop: position === "below" ? -1 : 0,
    }}>
      {explanation.loading ? (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-muted)",
          fontSize: s(12),
          fontFamily: "var(--font-ui)",
        }}>
          <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
          Thinking...
        </div>
      ) : (
        <div style={{
          color: "var(--text-secondary)",
          fontSize: s(13),
          lineHeight: 1.6,
          fontFamily: "var(--font-content)",
          letterSpacing: "0.005em",
        }}>
          <Markdown remarkPlugins={REMARK_PLUGINS}>
            {explanation.text}
          </Markdown>
        </div>
      )}
    </div>
  );
}
