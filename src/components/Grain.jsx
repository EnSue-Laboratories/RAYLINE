import { useRef, useEffect } from "react";

export default function Grain() {
  const ref = useRef(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    var frames = [];
    var tm;

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

    var fi = 0;
    const loop = () => {
      if (frames.length > 0) {
        ctx.putImageData(frames[fi % frames.length], 0, 0);
        fi++;
      }
      tm = setTimeout(() => requestAnimationFrame(loop), 100);
    };
    loop();

    window.addEventListener("resize", gen);
    return () => {
      clearTimeout(tm);
      window.removeEventListener("resize", gen);
    };
  }, []);

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
