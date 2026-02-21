"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ProjectsPhase, ScreenPoint } from "./types";

const POINT_COUNT = 1220;
const LINE_COUNT = 814;
const PHONE_ROUNDNESS = 0.105;
const PHONE_ASPECT = 0.5;

type ConstellationOverlayProps = {
  phase: ProjectsPhase;
  collapseTarget?: ScreenPoint | null;
  className?: string;
  debug?: boolean;
};

type PointData = {
  x: number;
  y: number;
  r: number;
  delay: number;
};

function createSeededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isInsideRoundedRect(x: number, y: number, radius: number) {
  const r = Math.max(0.001, Math.min(0.49, radius));
  const innerLeft = r;
  const innerRight = 1 - r;
  const innerTop = r;
  const innerBottom = 1 - r;

  if (x >= innerLeft && x <= innerRight) return true;
  if (y >= innerTop && y <= innerBottom) return true;

  const cx = x < 0.5 ? innerLeft : innerRight;
  const cy = y < 0.5 ? innerTop : innerBottom;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function buildConstellation() {
  const rng = createSeededRng(1642871);
  const points: PointData[] = [];

  while (points.length < POINT_COUNT) {
    let x = 0;
    let y = 0;

    if (rng() < 0.26) {
      const edge = Math.floor(rng() * 4);
      const inset = 0.02 + rng() * 0.08;
      if (edge === 0) {
        x = inset;
        y = rng();
      } else if (edge === 1) {
        x = 1 - inset;
        y = rng();
      } else if (edge === 2) {
        x = rng();
        y = inset;
      } else {
        x = rng();
        y = 1 - inset;
      }
    } else {
      x = 0.04 + rng() * 0.92;
      y = 0.03 + rng() * 0.94;
    }

    if (!isInsideRoundedRect(x, y, PHONE_ROUNDNESS)) continue;

    points.push({
      x,
      y,
      r: 0.42 + rng() * 0.9,
      delay: Math.floor(rng() * 820),
    });
  }

  const rawEdges: Array<{ a: number; b: number; d2: number; jitter: number }> = [];
  for (let i = 0; i < points.length; i++) {
    let first = -1;
    let second = -1;
    let d1 = Infinity;
    let d2 = Infinity;

    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const dist2 = dx * dx + dy * dy;
      if (dist2 > 0.013) continue;

      if (dist2 < d1) {
        second = first;
        d2 = d1;
        first = j;
        d1 = dist2;
      } else if (dist2 < d2) {
        second = j;
        d2 = dist2;
      }
    }

    if (first >= 0) {
      rawEdges.push({ a: i, b: first, d2: d1, jitter: rng() });
    }
    if (second >= 0 && rng() > 0.38) {
      rawEdges.push({ a: i, b: second, d2, jitter: rng() });
    }
  }

  const unique = new Map<string, { a: number; b: number; d2: number; jitter: number }>();
  for (const edge of rawEdges) {
    const a = Math.min(edge.a, edge.b);
    const b = Math.max(edge.a, edge.b);
    const key = `${a}-${b}`;
    if (!unique.has(key)) unique.set(key, { ...edge, a, b });
  }

  const ensureEdge = (a: number, b: number) => {
    if (a === b) return;
    const i = Math.min(a, b);
    const j = Math.max(a, b);
    const key = `${i}-${j}`;
    if (unique.has(key)) return;
    const dx = points[i].x - points[j].x;
    const dy = points[i].y - points[j].y;
    unique.set(key, { a: i, b: j, d2: dx * dx + dy * dy, jitter: rng() });
  };

  while (unique.size < LINE_COUNT) {
    const a = Math.floor(rng() * points.length);
    const b = Math.floor(rng() * points.length);
    ensureEdge(a, b);
  }

  const edges = [...unique.values()]
    .sort((left, right) => left.d2 - right.d2 || left.jitter - right.jitter)
    .slice(0, LINE_COUNT)
    .map((edge, index) => ({
      a: edge.a,
      b: edge.b,
      delay: Math.floor((index / LINE_COUNT) * 780 + rng() * 90),
    }));

  return { points, edges };
}

const CONSTELLATION = buildConstellation();

export function ConstellationOverlay({ phase, collapseTarget, className, debug = false }: ConstellationOverlayProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const updateSize = () => {
      setSize({
        width: host.clientWidth || 1,
        height: host.clientHeight || 1,
      });
    };

    const observer = new ResizeObserver(updateSize);
    observer.observe(host);
    updateSize();

    return () => observer.disconnect();
  }, []);

  const center = useMemo(
    () => ({ x: size.width * 0.5, y: size.height * 0.52 }),
    [size.height, size.width]
  );

  const target = collapseTarget ?? center;
  const collapseOffsetX = target.x - center.x;
  const collapseOffsetY = target.y - center.y;

  const rectHeight = Math.min(size.height * 0.86, size.width * 1.9);
  const rectWidth = rectHeight * PHONE_ASPECT;
  const rectLeft = center.x - rectWidth * 0.5;
  const rectTop = center.y - rectHeight * 0.5;

  const lineOpacity = phase === "reveal" ? 0.18 : phase === "compress" ? 0.48 : 0.34;
  const pointOpacity = phase === "reveal" ? 0.2 : phase === "compress" ? 0.64 : 0.78;

  const stageAnimate =
    phase === "bg" || phase === "live"
      ? {
          opacity: 0,
          x: 0,
          y: 0,
          scale: 1,
          filter: "brightness(1) blur(0px)",
        }
      : phase === "constellation"
        ? {
            opacity: 0.92,
            x: 0,
            y: 0,
            scale: 1,
            filter: "brightness(1.02) blur(0px)",
          }
        : phase === "compress"
          ? {
              opacity: [0.92, 0.98, 0.72],
              x: [0, collapseOffsetX * 0.8, collapseOffsetX],
              y: [0, collapseOffsetY * 0.8, collapseOffsetY],
              scale: [1, 0.54, 0.12],
              filter: ["brightness(1.02) blur(0px)", "brightness(1.1) blur(0px)", "brightness(1.34) blur(0.5px)"],
            }
          : {
              opacity: 0,
              x: collapseOffsetX,
              y: collapseOffsetY,
              scale: 0.06,
              filter: "brightness(1.06) blur(1px)",
            };

  const stageTransition =
    phase === "compress"
      ? { duration: 0.45, ease: [0.3, 0.02, 0.17, 1] as const }
      : phase === "reveal"
        ? { duration: 0.9, ease: [0.22, 0.7, 0.24, 1] as const }
        : { duration: 0.55, ease: [0.2, 0.78, 0.2, 1] as const };

  const showDebug = debug && mounted;

  return (
    <div ref={hostRef} className={`pointer-events-none absolute inset-0 ${className ?? ""}`.trim()} aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={stageAnimate}
        transition={stageTransition}
        style={{ transformOrigin: `${center.x}px ${center.y}px` }}
      >
        <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} className="h-full w-full">
          <g key={`draw-${phase === "constellation" ? "constellation" : "settled"}`}>
            {CONSTELLATION.edges.map((edge, index) => {
              const pointA = CONSTELLATION.points[edge.a];
              const pointB = CONSTELLATION.points[edge.b];
              const x1 = rectLeft + pointA.x * rectWidth;
              const y1 = rectTop + pointA.y * rectHeight;
              const x2 = rectLeft + pointB.x * rectWidth;
              const y2 = rectTop + pointB.y * rectHeight;

              return (
                <line
                  key={`line-${index}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(215,228,255,0.52)"
                  strokeWidth={Math.max(0.36, rectWidth * 0.0024)}
                  vectorEffect="non-scaling-stroke"
                  style={{
                    opacity: lineOpacity,
                    animation:
                      phase === "constellation"
                        ? `chv-const-line-in 760ms cubic-bezier(0.18,0.82,0.24,1) ${edge.delay}ms both`
                        : undefined,
                  }}
                />
              );
            })}

            {CONSTELLATION.points.map((point, index) => {
              const cx = rectLeft + point.x * rectWidth;
              const cy = rectTop + point.y * rectHeight;
              return (
                <circle
                  key={`point-${index}`}
                  cx={cx}
                  cy={cy}
                  r={Math.max(0.45, point.r * (rectWidth / 270))}
                  fill="rgba(236,244,255,0.95)"
                  style={{
                    opacity: pointOpacity,
                    animation:
                      phase === "constellation"
                        ? `chv-const-point-in 620ms cubic-bezier(0.2,0.84,0.24,1) ${point.delay}ms both`
                        : undefined,
                  }}
                />
              );
            })}
          </g>
        </svg>
      </motion.div>

      {showDebug ? (
        <>
          <div
            className="absolute border border-cyan-200/40"
            style={{
              left: rectLeft,
              top: rectTop,
              width: rectWidth,
              height: rectHeight,
              borderRadius: Math.min(rectWidth, rectHeight) * PHONE_ROUNDNESS,
            }}
          />
          <div
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300/70"
            style={{ left: target.x, top: target.y }}
          />
        </>
      ) : null}
    </div>
  );
}

export default ConstellationOverlay;
