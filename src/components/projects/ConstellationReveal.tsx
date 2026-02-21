"use client";

import { motion, type Variants } from "framer-motion";

type ConstellationStage = "hold" | "form" | "compress" | "off";

type ConstellationRevealProps = {
  seq: ConstellationStage;
  className?: string;
};

const POINTS: Array<{ x: number; y: number }> = [
  { x: 26, y: 24 },
  { x: 50, y: 18 },
  { x: 74, y: 24 },
  { x: 82, y: 44 },
  { x: 84, y: 74 },
  { x: 84, y: 104 },
  { x: 82, y: 134 },
  { x: 74, y: 170 },
  { x: 50, y: 182 },
  { x: 26, y: 170 },
  { x: 18, y: 134 },
  { x: 16, y: 104 },
  { x: 18, y: 74 },
  { x: 20, y: 44 },
  { x: 50, y: 58 },
  { x: 50, y: 100 },
  { x: 50, y: 142 },
  { x: 36, y: 100 },
  { x: 64, y: 100 },
  { x: 50, y: 34 },
];

const CONNECTIONS: Array<[number, number]> = [
  [0, 19],
  [19, 2],
  [0, 13],
  [13, 17],
  [17, 15],
  [15, 18],
  [18, 4],
  [4, 2],
  [13, 11],
  [11, 10],
  [10, 16],
  [16, 8],
  [8, 7],
  [7, 6],
];

const groupVariants: Variants = {
  hold: {
    opacity: 0,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.2, ease: "easeOut" },
  },
  form: {
    opacity: 0.95,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.44, ease: [0.21, 0.87, 0.28, 1] },
  },
  compress: {
    opacity: 0,
    scale: 0.1,
    filter: "blur(1.4px)",
    transition: { duration: 0.5, ease: [0.4, 0.08, 0.95, 0.2] },
  },
  off: {
    opacity: 0,
    scale: 0.08,
    filter: "blur(0px)",
    transition: { duration: 0.18, ease: "easeOut" },
  },
};

const lineVariants: Variants = {
  hold: { opacity: 0, pathLength: 0 },
  form: (index: number) => ({
    opacity: 0.52,
    pathLength: 1,
    transition: {
      opacity: { duration: 0.22, delay: 0.04 + index * 0.016 },
      pathLength: { duration: 0.34, delay: 0.02 + index * 0.02, ease: "easeOut" },
    },
  }),
  compress: {
    opacity: 0,
    pathLength: 0.35,
    transition: { duration: 0.26, ease: "easeIn" },
  },
  off: { opacity: 0, pathLength: 0 },
};

const pointVariants: Variants = {
  hold: { opacity: 0, scale: 0.4 },
  form: (index: number) => ({
    opacity: 0.85,
    scale: 1,
    transition: {
      opacity: { duration: 0.2, delay: 0.08 + index * 0.012 },
      scale: { duration: 0.24, delay: 0.08 + index * 0.012, ease: "easeOut" },
    },
  }),
  compress: {
    opacity: 0,
    scale: 0.18,
    transition: { duration: 0.2, ease: "easeIn" },
  },
  off: { opacity: 0, scale: 0.2 },
};

export function ConstellationReveal({ seq, className }: ConstellationRevealProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 ${className ?? ""}`.trim()} aria-hidden="true">
      <motion.svg
        viewBox="0 0 100 200"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        initial={false}
        animate={seq}
      >
        <motion.g variants={groupVariants} style={{ transformOrigin: "50% 50%" }}>
          {CONNECTIONS.map(([from, to], index) => {
            const a = POINTS[from];
            const b = POINTS[to];
            return (
              <motion.line
                key={`${from}-${to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="rgba(225,235,255,0.75)"
                strokeOpacity={0.5}
                strokeWidth={1}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                custom={index}
                variants={lineVariants}
              />
            );
          })}

          {POINTS.map((point, index) => (
            <motion.circle
              key={`star-${index}`}
              cx={point.x}
              cy={point.y}
              r={index % 6 === 0 ? 1.55 : 1.2}
              fill="rgba(230,239,255,0.9)"
              fillOpacity={0.86}
              custom={index}
              variants={pointVariants}
            />
          ))}
        </motion.g>
      </motion.svg>
    </div>
  );
}
