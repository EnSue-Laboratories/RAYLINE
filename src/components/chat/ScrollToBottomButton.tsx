import { memo } from "react";
import { ArrowDown } from "lucide-react";

interface ScrollToBottomButtonProps {
  visible: boolean;
  label: string;
  hasWallpaper: boolean;
  onClick: () => void;
}

/**
 * Floating "jump to latest" button. Hidden → `display: none` (a hidden button
 * with backdrop-filter still re-blurred on every scroll frame), and the blur
 * only applies over a wallpaper.
 */
function ScrollToBottomButton({ visible, label, hasWallpaper, onClick }: ScrollToBottomButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        position: "absolute",
        bottom: 108,
        left: "50%",
        transform: "translateX(-50%)",
        display: visible ? "flex" : "none",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: hasWallpaper ? "var(--control-bg-subtle)" : "rgb(var(--pane-elevated-rgb))",
        border: "1px solid var(--control-border)",
        color: "var(--text-secondary)",
        cursor: "pointer",
        backdropFilter: hasWallpaper ? "blur(20px)" : "none",
        WebkitBackdropFilter: hasWallpaper ? "blur(20px)" : "none",
        boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        transition: "background .2s ease, border-color .2s ease",
        zIndex: 20,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = "var(--control-bg)";
        event.currentTarget.style.borderColor = "var(--control-border-strong)";
        event.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = hasWallpaper ? "var(--control-bg-subtle)" : "rgb(var(--pane-elevated-rgb))";
        event.currentTarget.style.borderColor = "var(--control-border)";
        event.currentTarget.style.color = "var(--text-secondary)";
      }}
    >
      <ArrowDown size={16} strokeWidth={1.75} />
    </button>
  );
}

export default memo(ScrollToBottomButton);
