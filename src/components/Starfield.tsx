"use client";

import { useEffect, useRef } from "react";

export function Starfield({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduceMotion = mq.matches;

    let w = 0, h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const starCount = 220;
    const stars = Array.from({ length: starCount }).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.6 + 0.2,
      s: Math.random() * 0.35 + 0.05,
      a: Math.random() * 0.7 + 0.15,
    }));

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);

      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h));
      g.addColorStop(0, "rgba(120, 140, 255, 0.10)");
      g.addColorStop(0.5, "rgba(30, 40, 80, 0.06)");
      g.addColorStop(1, "rgba(0, 0, 0, 1)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      for (const st of stars) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${st.a})`;
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();

        if (!reduceMotion) {
          st.y += st.s;
          if (st.y > h + 5) {
            st.y = -5;
            st.x = Math.random() * w;
          }
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={"absolute inset-0 h-full w-full " + className}
      aria-hidden="true"
    />
  );
}
