import { useRef, useEffect } from "react";
import useWindowActivity from "../hooks/useWindowActivity";

const FOCUSED_GRAIN_FRAME_MS = 100;
const BACKGROUND_GRAIN_FRAME_MS = 400;
const REDUCED_MOTION_GRAIN_FRAME_MS = 700;

export default function Grain() {
  const ref = useRef(null);
  const fiRef = useRef(0);
  const { isVisible, isFocused, prefersReducedMotion } = useWindowActivity();
  const frameBudgetRef = useRef(FOCUSED_GRAIN_FRAME_MS);

  useEffect(() => {
    frameBudgetRef.current = prefersReducedMotion
      ? REDUCED_MOTION_GRAIN_FRAME_MS
      : (isFocused ? FOCUSED_GRAIN_FRAME_MS : BACKGROUND_GRAIN_FRAME_MS);
  }, [isFocused, prefersReducedMotion]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    var frames = [];
    var tm = null;
    var raf = null;

    const gen = () => {
      c.width = Math.ceil(window.innerWidth / 3);
      c.height = Math.ceil(window.innerHeight / 3);
      frames = [];
      for (var f = 0; f < 5; f++) {
        var d = ctx.createImageData(c.width, c.height);
        var b = new Uint32Array(d.data.buffer);
        for (var i = 0; i < b.length; i++) {
          if (Math.random() < 0.07) b[i] = 0x06000000;
        }
        frames.push(d);
      }
    };
    gen();

    const schedule = () => {
      if (!isVisible) return;
      tm = setTimeout(() => {
        raf = requestAnimationFrame(loop);
      }, frameBudgetRef.current);
    };
    const loop = () => {
      if (!isVisible) return;
      if (frames.length > 0) {
        ctx.putImageData(frames[fiRef.current % frames.length], 0, 0);
        fiRef.current += 1;
      }
      schedule();
    };

    if (isVisible) loop();

    window.addEventListener("resize", gen);
    return () => {
      if (tm != null) clearTimeout(tm);
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", gen);
    };
  }, [isVisible]);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.4,
        mixBlendMode: "overlay",
      }}
    />
  );
}
