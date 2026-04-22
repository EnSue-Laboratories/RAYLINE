import { Minus, Square, X } from "lucide-react";

const buttonBaseStyle = {
  width: 30,
  height: 24,
  borderRadius: 7,
  border: "1px solid rgba(255,255,255,0.04)",
  background: "rgba(255,255,255,0.03)",
  color: "rgba(255,255,255,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: "background .15s ease, border-color .15s ease, color .15s ease",
  padding: 0,
  WebkitAppRegion: "no-drag",
};

function getBridge() {
  return window.api || window.ghApi || null;
}

export default function WindowControls({ visible = false }) {
  if (!visible) return null;

  const bridge = getBridge();
  if (!bridge?.windowMinimize || !bridge?.windowToggleMaximize || !bridge?.windowClose) {
    return null;
  }

  const handleHover = (event, role, active) => {
    const target = event.currentTarget;
    if (!active) {
      target.style.background = "rgba(255,255,255,0.03)";
      target.style.borderColor = "rgba(255,255,255,0.04)";
      target.style.color = "rgba(255,255,255,0.72)";
      return;
    }

    if (role === "close") {
      target.style.background = "rgba(228,76,76,0.92)";
      target.style.borderColor = "rgba(255,255,255,0.08)";
      target.style.color = "rgba(255,255,255,0.96)";
      return;
    }

    target.style.background = "rgba(255,255,255,0.12)";
    target.style.borderColor = "rgba(255,255,255,0.08)";
    target.style.color = "rgba(255,255,255,0.94)";
  };

  const handleMouseDown = (event) => {
    // Windows keeps a top-level drag region across the header. Explicitly
    // cancelling pointer-down here prevents the buttons from being treated as
    // drag targets, so the click reaches the IPC handler.
    event.preventDefault();
    event.stopPropagation();
  };

  const handleClick = (event, action) => {
    event.preventDefault();
    event.stopPropagation();
    void action();
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        gap: 6,
        zIndex: 140,
        WebkitAppRegion: "no-drag",
      }}
    >
      <button
        aria-label="Minimize window"
        title="Minimize"
        onMouseDown={handleMouseDown}
        onClick={(event) => handleClick(event, bridge.windowMinimize)}
        style={buttonBaseStyle}
        onMouseEnter={(event) => handleHover(event, "minimize", true)}
        onMouseLeave={(event) => handleHover(event, "minimize", false)}
      >
        <Minus size={14} strokeWidth={1.9} />
      </button>
      <button
        aria-label="Maximize window"
        title="Maximize"
        onMouseDown={handleMouseDown}
        onClick={(event) => handleClick(event, bridge.windowToggleMaximize)}
        style={buttonBaseStyle}
        onMouseEnter={(event) => handleHover(event, "maximize", true)}
        onMouseLeave={(event) => handleHover(event, "maximize", false)}
      >
        <Square size={12} strokeWidth={1.8} />
      </button>
      <button
        aria-label="Close window"
        title="Close"
        onMouseDown={handleMouseDown}
        onClick={(event) => handleClick(event, bridge.windowClose)}
        style={buttonBaseStyle}
        onMouseEnter={(event) => handleHover(event, "close", true)}
        onMouseLeave={(event) => handleHover(event, "close", false)}
      >
        <X size={14} strokeWidth={1.9} />
      </button>
    </div>
  );
}
