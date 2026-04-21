import { useEffect, useState } from "react";

const isWindowsPlatform = () => {
  if (typeof navigator === "undefined") return false;
  const p = navigator.userAgentData?.platform || navigator.platform || "";
  return /win/i.test(p);
};

const BTN_SIZE = { width: 46, height: 36 };

const btnBase = {
  ...BTN_SIZE,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "#C8CBD3",
  outline: "none",
  WebkitAppRegion: "no-drag",
  transition: "background-color .12s ease",
};

function IconMinimize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
    </svg>
  );
}

function IconMaximize() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconRestore() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="2.5" y="0.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="0.5" y="2.5" width="7" height="7" fill="#0D0D10" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M1 1 L9 9 M9 1 L1 9" stroke="currentColor" strokeWidth="1" fill="none" />
    </svg>
  );
}

function CaptionButton({ onClick, ariaLabel, children, variant }) {
  const [hover, setHover] = useState(false);
  const hoverBg =
    variant === "close"
      ? "#E81123"
      : "rgba(255,255,255,0.12)";
  const color = hover && variant === "close" ? "#FFFFFF" : "#C8CBD3";
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...btnBase,
        backgroundColor: hover ? hoverBg : "transparent",
        color,
      }}
    >
      {children}
    </button>
  );
}

export default function WindowControls({ api }) {
  const [isMax, setIsMax] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isWindowsPlatform()) return undefined;
    if (!api?.windowIsMaximized) return undefined;
    setShow(true);
    let cancelled = false;
    api.windowIsMaximized().then((v) => {
      if (!cancelled) setIsMax(Boolean(v));
    });
    const off = api.onWindowStateChanged?.(({ isMaximized }) => {
      setIsMax(Boolean(isMaximized));
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [api]);

  if (!show) return null;

  const controlsWidth = BTN_SIZE.width * 3;

  return (
    <>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: controlsWidth,
          height: BTN_SIZE.height,
          zIndex: 9999,
          WebkitAppRegion: "drag",
          pointerEvents: "auto",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 10000,
          display: "flex",
          height: BTN_SIZE.height,
          WebkitAppRegion: "no-drag",
        }}
      >
        <CaptionButton ariaLabel="Minimize" onClick={() => api.windowMinimize()}>
          <IconMinimize />
        </CaptionButton>
        <CaptionButton
          ariaLabel={isMax ? "Restore" : "Maximize"}
          onClick={() => api.windowToggleMaximize()}
        >
          {isMax ? <IconRestore /> : <IconMaximize />}
        </CaptionButton>
        <CaptionButton ariaLabel="Close" variant="close" onClick={() => api.windowClose()}>
          <IconClose />
        </CaptionButton>
      </div>
    </>
  );
}
