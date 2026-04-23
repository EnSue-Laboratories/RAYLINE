import { useRef, useEffect } from "react";

export default function AuroraCanvas({ theme = "dark" }) {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const rootStyles = getComputedStyle(document.documentElement);
    const auroraBackground = rootStyles.getPropertyValue("--aurora-bg").trim() || "#0D0D0F";
    const auroraGlow = rootStyles.getPropertyValue("--aurora-glow").trim() || "rgba(255,255,255,0.018)";
    let w, h, raf;

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

    let t = 0;
    const draw = () => {
      t += 0.003;

      ctx.fillStyle = auroraBackground;
      ctx.fillRect(0, 0, w, h);

      // Compute orb positions
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
        grad.addColorStop(0, auroraGlow);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gp.x, gp.y, gp.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [theme]);

  return (
    <canvas
      ref={ref}
      style={{ position: "fixed", inset: 0, zIndex: 0, background: "var(--pane-background, #0D0D10)" }}
    />
  );
}
