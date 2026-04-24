import { useRef, useEffect } from "react";
import useWindowActivity from "../hooks/useWindowActivity";

const T_PER_MS = 0.00018;
const FOCUSED_FRAME_MS = 1000 / 60;
const BACKGROUND_FRAME_MS = 1000 / 12;
const REDUCED_MOTION_FRAME_MS = 1000 / 8;

export default function AuroraCanvas() {
  const ref = useRef(null);
  const tRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const { isVisible, isFocused, prefersReducedMotion } = useWindowActivity();

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w;
    let h;
    let raf = null;

    var orbList = [
      { phase: 0,   speedX: 0.3,  speedY: 0.2,  radius: 220, cx: 0.6, cy: 0.35 },
      { phase: 1.8, speedX: 0.22, speedY: 0.28, radius: 180, cx: 0.3, cy: 0.6  },
      { phase: 3.5, speedX: 0.18, speedY: 0.35, radius: 160, cx: 0.8, cy: 0.2  },
    ];

    const resize = () => {
      w = c.width = window.innerWidth;
      h = c.height = window.innerHeight;
    };
    resize();

    const renderFrame = () => {
      ctx.fillStyle = "#0D0D0F";
      ctx.fillRect(0, 0, w, h);

      // Compute orb positions
      const t = tRef.current;
      var orbPositions = [];
      for (var oi = 0; oi < orbList.length; oi++) {
        var ob = orbList[oi];
        orbPositions.push({
          x: w * ob.cx + Math.sin(t * ob.speedX + ob.phase) * w * 0.15,
          y: h * ob.cy + Math.cos(t * ob.speedY + ob.phase) * h * 0.12,
          r: ob.radius + Math.sin(t * 0.4 + ob.phase) * 40,
        });
      }

      // Soft glow halo behind each orb
      for (var gi = 0; gi < orbPositions.length; gi++) {
        var gp = orbPositions[gi];
        var grad = ctx.createRadialGradient(gp.x, gp.y, 0, gp.x, gp.y, gp.r * 0.7);
        grad.addColorStop(0, "rgba(255,255,255,0.018)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, gp.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frameBudget = prefersReducedMotion
      ? REDUCED_MOTION_FRAME_MS
      : (isFocused ? FOCUSED_FRAME_MS : BACKGROUND_FRAME_MS);

    const draw = (now) => {
      if (!isVisible) return;
      const lastFrameAt = lastFrameAtRef.current;
      if (lastFrameAt && (now - lastFrameAt) < frameBudget) {
        raf = requestAnimationFrame(draw);
        return;
      }

      const delta = lastFrameAt ? (now - lastFrameAt) : frameBudget;
      lastFrameAtRef.current = now;
      tRef.current += delta * T_PER_MS;
      renderFrame();

      raf = requestAnimationFrame(draw);
    };

    renderFrame();
    if (isVisible) {
      raf = requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [isFocused, isVisible, prefersReducedMotion]);

  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, zIndex: 0, background: "var(--pane-background, #0D0D10)" }}
    />
  );
}
