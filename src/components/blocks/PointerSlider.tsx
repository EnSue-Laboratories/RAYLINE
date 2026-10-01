import { memo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { sliderValueAtRatio, sliderValueForKey } from "./valueControl";

export interface PointerSliderProps {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}

function PointerSlider({ min, max, step, value, onChange }: PointerSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;

  const updateFromClientX = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    onChange(sliderValueAtRatio((clientX - rect.left) / rect.width, min, max, step));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromClientX(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    updateFromClientX(event.clientX);
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = sliderValueForKey(event.key, value, min, max, step);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      style={{
        position: "relative",
        height: 34,
        width: "100%",
        cursor: "ew-resize",
        touchAction: "none",
        outline: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: 8,
          borderRadius: 999,
          background: "var(--control-bg-active)",
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: "50%",
          width: `${percent}%`,
          height: 8,
          borderRadius: 999,
          background: "var(--text-primary)",
          transform: "translateY(-50%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: `calc(${percent}% - 11px)`,
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid var(--control-border-active)",
          background: "var(--control-thumb-bg)",
          boxShadow: dragging ? "0 0 0 10px var(--control-bg-strong)" : "0 8px 24px rgba(0,0,0,0.22)",
          transform: `translateY(-50%) scale(${dragging ? 1.05 : 1})`,
          transition: dragging ? "none" : "box-shadow .14s ease, transform .14s ease",
        }}
      />
    </div>
  );
}

export default memo(PointerSlider);
