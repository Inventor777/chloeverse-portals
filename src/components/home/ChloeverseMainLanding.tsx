"use client";

import Link from "next/link";
import { stopBgm as stopCollabsBgm } from "@/lib/collabsBgm";
import { DesktopAstroField } from "@/components/home/DesktopAstroField";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
} from "react";

type ChloeverseMainLandingProps = {
  titleFontClassName: string;
  monoFontClassName: string;
};

type SpotTarget = "title" | "tagline" | null;
type HoverRegion = "bg" | "title" | "small";
type CursorMode = "idle" | "text" | "bg";
type CssVars = CSSProperties & Record<`--${string}`, string>;
type DepthKind = "title" | "tagline";
type GlyphTone = "painted" | "plain";
type GlyphMetric = { x: number; y: number; radius: number };
type GlyphRefCollection = MutableRefObject<Array<HTMLSpanElement | null>>;
type MenuCardRefCollection = MutableRefObject<Array<HTMLAnchorElement | null>>;
type MaskPointRef = MutableRefObject<{ x: number; y: number }>;
type BlockMotionState = { tiltX: number; tiltY: number; shiftX: number; shiftY: number };
type RippleState = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  startedAt: number;
  lastX: number;
  lastY: number;
  hasLast: boolean;
};
type DepthConfig = {
  baseDepth: number;
  hoverRadius: number;
  hoverLift: number;
  rippleLift: number;
  rippleDurationMs: number;
  rippleSpeedPxPerMs: number;
  rippleBandPx: number;
  maxTiltX: number;
  maxTiltY: number;
  maxShiftX: number;
  maxShiftY: number;
};

const TITLE_TOP = "The";
const TITLE_MAIN = "Chloeverse";
const TAGLINE = "where storytelling meets tomorrow";
const PORTAL_LINKS_TOP_OFFSET_PX = 144;
const MENU_LINKS = [
  { href: "/projects", label: "PROJECTS" },
  { href: "/collabs", label: "COLLABS" },
  { href: "/work", label: "WORK" },
  { href: "https://trueme.io", label: "STARTUP" },
  { href: "/contact", label: "CONTACT" },
  { href: "/mediacard", label: "MEDIACARD" },
] as const;

const SPOTLIGHT_RADIUS = 70;
const CURSOR_LARGE_SIZE = 56;
const CURSOR_MEDIUM_SIZE = CURSOR_LARGE_SIZE - 14;
const CURSOR_SMALL_SIZE = CURSOR_LARGE_SIZE - 24;
const BG_REVEAL_RADIUS = (CURSOR_LARGE_SIZE / 2) - 6;
const CURSOR_HALO_LARGE_SIZE = 92;
const CURSOR_HALO_MEDIUM_SIZE = CURSOR_HALO_LARGE_SIZE - 14;
const CURSOR_HALO_SMALL_SIZE = CURSOR_HALO_LARGE_SIZE - 24;
const POINTER_LERP = 0.16;
const MASK_LERP = 0.2;
const TITLE_TEXT = `${TITLE_TOP}${TITLE_MAIN}`;
const TITLE_TOP_COUNT = TITLE_TOP.length;
const TITLE_GLYPH_COUNT = TITLE_TEXT.length;
const TITLE_DEPTH_CONFIG: DepthConfig = {
  baseDepth: 10.5,
  hoverRadius: 128,
  hoverLift: 13.5,
  rippleLift: 11.5,
  rippleDurationMs: 430,
  rippleSpeedPxPerMs: 0.42,
  rippleBandPx: 52,
  maxTiltX: 7.2,
  maxTiltY: 9.2,
  maxShiftX: 9,
  maxShiftY: 7,
};
const TAGLINE_DEPTH_CONFIG: DepthConfig = {
  baseDepth: 5.5,
  hoverRadius: 98,
  hoverLift: 8.25,
  rippleLift: 6.75,
  rippleDurationMs: 380,
  rippleSpeedPxPerMs: 0.34,
  rippleBandPx: 42,
  maxTiltX: 4.2,
  maxTiltY: 5.6,
  maxShiftX: 4.5,
  maxShiftY: 3.4,
};
const MENU_CARD_DEPTH_CONFIG: DepthConfig = {
  baseDepth: 8.2,
  hoverRadius: 126,
  hoverLift: 10.8,
  rippleLift: 9.1,
  rippleDurationMs: 410,
  rippleSpeedPxPerMs: 0.52,
  rippleBandPx: 70,
  maxTiltX: 6.4,
  maxTiltY: 8.4,
  maxShiftX: 10.5,
  maxShiftY: 7.5,
};
const RAINBOW_COLORS = ["#ff4ea8", "#ff8a3d", "#ffd646", "#8aff5c", "#4ce4ff", "#6f8dff", "#da6dff"] as const;
const GREEN_HEX = "#8aff5c";
const GREEN_SWAP_RATE = 0.2;
const GREEN_REPLACEMENTS = ["#ff5478", "#ffb24b", "#52b2ff", "#c77dff"] as const;

function mulberry32(a: number) {
  return function rand() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rebalanceGreen(color: string, phase: number, swapRate = GREEN_SWAP_RATE): string {
  if (color !== GREEN_HEX) {
    return color;
  }
  if (phase >= swapRate) {
    return color;
  }
  const t = clamp(phase / swapRate, 0, 0.999999);
  const replacementIndex = Math.floor(t * GREEN_REPLACEMENTS.length);
  return GREEN_REPLACEMENTS[replacementIndex] ?? GREEN_REPLACEMENTS[0];
}

function rainbowColor(r: number, greenSwapRate = GREEN_SWAP_RATE): string {
  const scaled = r * RAINBOW_COLORS.length;
  const index = Math.floor(scaled) % RAINBOW_COLORS.length;
  const color = RAINBOW_COLORS[index] ?? RAINBOW_COLORS[0];
  const phase = fract(scaled);
  return rebalanceGreen(color, phase, greenSwapRate);
}

function paintStyle(seed: number): CSSProperties {
  const rnd = mulberry32(seed >>> 0);

  const c1 = rainbowColor(rnd());
  const c2 = rainbowColor(rnd());
  const c3 = rainbowColor(rnd());
  const c4 = rainbowColor(rnd());
  const c5 = rainbowColor(rnd());

  const p1x = 12 + rnd() * 76;
  const p1y = 14 + rnd() * 72;
  const p2x = 14 + rnd() * 72;
  const p2y = 16 + rnd() * 68;
  const p3x = 10 + rnd() * 80;
  const p3y = 22 + rnd() * 60;
  const p4x = 16 + rnd() * 68;
  const p4y = 8 + rnd() * 78;
  const p5x = 18 + rnd() * 64;
  const p5y = 12 + rnd() * 70;

  return {
    backgroundImage: [
      `radial-gradient(circle at ${p1x}% ${p1y}%, ${c1} 0%, ${c1} 24%, transparent 58%)`,
      `radial-gradient(circle at ${p2x}% ${p2y}%, ${c2} 0%, ${c2} 26%, transparent 62%)`,
      `radial-gradient(circle at ${p3x}% ${p3y}%, ${c3} 0%, ${c3} 22%, transparent 60%)`,
      `radial-gradient(circle at ${p4x}% ${p4y}%, ${c4} 0%, ${c4} 20%, transparent 56%)`,
      `radial-gradient(circle at ${p5x}% ${p5y}%, ${hexToRgba(c5, 0.94)} 0%, ${hexToRgba(c5, 0.9)} 30%, ${hexToRgba(c1, 0.66)} 54%, rgba(0,0,0,0) 84%)`,
    ].join(", "),
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "0.7px rgba(255,255,255,0.08)",
    textShadow:
      "0 0 1px rgba(255,255,255,0.12), 0 0 12px rgba(255,255,255,0.06), 0 6px 22px rgba(0,0,0,0.35)",
  };
}

function plainFaceStyle(): CSSProperties {
  return {
    color: "rgba(255,255,255,0.96)",
    textShadow: "0 0 14px rgba(255,255,255,0.14)",
  };
}

function paintBackdropStyle(seed: number): CSSProperties {
  const rnd = mulberry32((seed ^ 0x9e3779b9) >>> 0);
  const layers: string[] = [];
  const fieldCount = 12;
  const microCount = 92;

  for (let i = 0; i < fieldCount; i += 1) {
    const x = 6 + rnd() * 88;
    const y = 6 + rnd() * 88;
    const spread = 42 + rnd() * 34;
    const color = rainbowColor(rnd(), 0.42);
    const alpha = 0.22 + rnd() * 0.13;
    layers.push(
      `radial-gradient(circle ${spread.toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${hexToRgba(color, alpha)} 0%, ${hexToRgba(color, Math.max(0.08, alpha - 0.12))} 56%, rgba(0,0,0,0) 100%)`,
    );
  }

  for (let i = 0; i < microCount; i += 1) {
    const x = rnd() * 100;
    const y = rnd() * 100;
    const radius = 10 + rnd() * 20;
    const feather = 8 + rnd() * 10;
    const alpha = 0.75 + rnd() * 0.2;
    const colorA = rainbowColor(rnd(), 0.46);
    const colorB = rainbowColor(rnd(), 0.46);

    layers.push(
      `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${hexToRgba(colorA, alpha)} 0px, ${hexToRgba(colorA, alpha)} ${radius.toFixed(2)}px, ${hexToRgba(colorB, Math.max(0.62, alpha - 0.22))} ${(radius + feather * 0.55).toFixed(2)}px, rgba(0,0,0,0) ${(radius + feather).toFixed(2)}px)`,
    );
  }

  return {
    backgroundImage: layers.join(", "),
    backgroundRepeat: "no-repeat",
    filter: "saturate(1.1) contrast(1.05)",
    opacity: 1,
  };
}

function idlePulseStyle(seed: number): CssVars {
  const rnd = mulberry32((seed ^ 0x7f4a7c15) >>> 0);
  const duration = 2.45 + rnd() * 1.55;
  const scalePeak = 1.026 + rnd() * 0.04;
  const liftPeak = -3.2 - rnd() * 5.2;
  const brightnessPeak = 1.08 + rnd() * 0.18;
  const glowPeak = 0.2 + rnd() * 0.26;

  return {
    "--glyph-pulse-duration": `${duration.toFixed(3)}s`,
    "--glyph-pulse-delay": `${(-rnd() * duration).toFixed(3)}s`,
    "--glyph-pulse-scale-peak": scalePeak.toFixed(4),
    "--glyph-pulse-lift-peak": `${liftPeak.toFixed(3)}px`,
    "--glyph-pulse-brightness-peak": brightnessPeak.toFixed(3),
    "--glyph-pulse-glow-peak": glowPeak.toFixed(3),
  };
}

function paintCursorFillStyle(seed: number): CSSProperties {
  const rnd = mulberry32((seed ^ 0xa5a5a5a5) >>> 0);
  const mediumLayers: string[] = [];
  const microLayers: string[] = [];
  const baseColorA = rainbowColor(rnd(), 0.56);
  const baseColorB = rainbowColor(rnd(), 0.56);
  const baseColorC = rainbowColor(rnd(), 0.56);

  for (let i = 0; i < 82; i += 1) {
    const x = 20 + rnd() * 60;
    const y = 20 + rnd() * 60;
    const color = rainbowColor(rnd(), 0.56);
    const radius = 18 + rnd() * 28;
    const feather = radius + 26 + rnd() * 18;
    const alpha = 0.85 + rnd() * 0.1;
    mediumLayers.push(
      `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${hexToRgba(color, alpha)} 0px, ${hexToRgba(color, alpha)} ${radius.toFixed(2)}px, rgba(0,0,0,0) ${feather.toFixed(2)}px)`,
    );
  }

  for (let i = 0; i < 176; i += 1) {
    const x = 10 + rnd() * 80;
    const y = 10 + rnd() * 80;
    const color = rainbowColor(rnd(), 0.56);
    const radius = 6 + rnd() * 12;
    const feather = radius + 14 + rnd() * 12;
    const alpha = 0.75 + rnd() * 0.17;
    microLayers.push(
      `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%, ${hexToRgba(color, alpha)} 0px, ${hexToRgba(color, alpha)} ${radius.toFixed(2)}px, rgba(0,0,0,0) ${feather.toFixed(2)}px)`,
    );
  }

  const b1x = 20 + rnd() * 60;
  const b1y = 20 + rnd() * 60;
  const b2x = 18 + rnd() * 64;
  const b2y = 16 + rnd() * 68;
  const b3x = 22 + rnd() * 56;
  const b3y = 18 + rnd() * 62;
  const baseLayerA = `radial-gradient(circle at ${b1x.toFixed(2)}% ${b1y.toFixed(2)}%, ${hexToRgba(baseColorA, 0.86)} 0px, ${hexToRgba(baseColorA, 0.82)} 72px, rgba(0,0,0,0) 182px)`;
  const baseLayerB = `radial-gradient(circle at ${b2x.toFixed(2)}% ${b2y.toFixed(2)}%, ${hexToRgba(baseColorB, 0.84)} 0px, ${hexToRgba(baseColorB, 0.8)} 78px, rgba(0,0,0,0) 188px)`;
  const baseLayerC = `radial-gradient(circle at ${b3x.toFixed(2)}% ${b3y.toFixed(2)}%, ${hexToRgba(baseColorC, 0.82)} 0px, ${hexToRgba(baseColorC, 0.78)} 74px, rgba(0,0,0,0) 184px)`;

  return {
    backgroundImage: [...microLayers, ...mediumLayers, baseLayerA, baseLayerB, baseLayerC].join(", "),
    backgroundRepeat: "no-repeat",
    backgroundSize: "260px 260px",
    backgroundPosition: "50% 50%",
    filter: "saturate(1.15) contrast(1.1)",
  };
}

function typingDelay(char: string): number {
  let ms = 55;
  if (char === " ") {
    ms += 120;
  } else if (/[.,!?;:]/.test(char)) {
    ms += 220;
  }
  return ms;
}

function setMaskPosition(element: HTMLElement | null, x: number, y: number, radiusPx = SPOTLIGHT_RADIUS): void {
  if (!element) {
    return;
  }
  element.style.setProperty("--mx", `${x}px`);
  element.style.setProperty("--my", `${y}px`);
  element.style.setProperty("--r", `${radiusPx}px`);
}

function updateMaskTarget(
  clientX: number,
  clientY: number,
  host: HTMLElement | null,
  targetRef: MaskPointRef,
): { x: number; y: number } | null {
  if (!host) {
    return null;
  }
  const rect = host.getBoundingClientRect();
  const next = {
    x: clamp(clientX - rect.left, 0, rect.width),
    y: clamp(clientY - rect.top, 0, rect.height),
  };
  targetRef.current = next;
  return next;
}

function createRippleState(): RippleState {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    energy: 0,
    startedAt: 0,
    lastX: 0,
    lastY: 0,
    hasLast: false,
  };
}

function setRipplePointer(ripple: RippleState, x: number, y: number, reducedMotion: boolean): void {
  if (!ripple.hasLast) {
    ripple.lastX = x;
    ripple.lastY = y;
    ripple.hasLast = true;
    return;
  }

  const dx = x - ripple.lastX;
  const dy = y - ripple.lastY;
  ripple.lastX = x;
  ripple.lastY = y;

  if (reducedMotion) {
    return;
  }

  const speed = Math.hypot(dx, dy);
  if (speed < 6) {
    return;
  }

  ripple.active = true;
  ripple.x = x;
  ripple.y = y;
  ripple.vx = dx;
  ripple.vy = dy;
  ripple.energy = clamp(speed / 30, 0.35, 1.2);
  ripple.startedAt = performance.now();
}

function measureGlyphMetrics<T extends HTMLElement>(
  host: HTMLElement | null,
  refs: Array<T | null>,
  count: number,
): GlyphMetric[] {
  if (!host || count <= 0) {
    return [];
  }

  const hostRect = host.getBoundingClientRect();
  const nextMetrics: GlyphMetric[] = [];

  for (let index = 0; index < count; index += 1) {
    const node = refs[index];
    if (!node) {
      continue;
    }
    const rect = node.getBoundingClientRect();
    nextMetrics.push({
      x: rect.left - hostRect.left + rect.width * 0.5,
      y: rect.top - hostRect.top + rect.height * 0.5,
      radius: Math.max(18, Math.max(rect.width, rect.height) * 0.64),
    });
  }

  return nextMetrics;
}

function setBlockMotionVars(host: HTMLElement | null, motion: BlockMotionState): void {
  if (!host) {
    return;
  }
  host.style.setProperty("--block-tilt-x", `${motion.tiltX.toFixed(3)}deg`);
  host.style.setProperty("--block-tilt-y", `${motion.tiltY.toFixed(3)}deg`);
  host.style.setProperty("--block-shift-x", `${motion.shiftX.toFixed(3)}px`);
  host.style.setProperty("--block-shift-y", `${motion.shiftY.toFixed(3)}px`);
}

function setMenuCardVars(
  node: HTMLAnchorElement | null,
  depth: number,
  lift: number,
  ripple: number,
  shadow: number,
  offsetX: number,
  offsetY: number,
  rotateX: number,
  rotateY: number,
  scale: number,
): void {
  if (!node) {
    return;
  }
  node.style.setProperty("--card-depth", `${depth.toFixed(3)}px`);
  node.style.setProperty("--card-lift", `${lift.toFixed(3)}px`);
  node.style.setProperty("--card-ripple", `${ripple.toFixed(3)}px`);
  node.style.setProperty("--card-shadow-alpha", shadow.toFixed(3));
  node.style.setProperty("--card-offset-x", `${offsetX.toFixed(3)}px`);
  node.style.setProperty("--card-offset-y", `${offsetY.toFixed(3)}px`);
  node.style.setProperty("--card-rotate-x", `${rotateX.toFixed(3)}deg`);
  node.style.setProperty("--card-rotate-y", `${rotateY.toFixed(3)}deg`);
  node.style.setProperty("--card-scale", scale.toFixed(4));
}

function updateMenuCards(
  host: HTMLElement | null,
  metrics: GlyphMetric[],
  refs: Array<HTMLAnchorElement | null>,
  pointer: { x: number; y: number },
  active: boolean,
  config: DepthConfig,
  ripple: RippleState,
  prefersReducedMotion: boolean,
): void {
  if (!host) {
    return;
  }

  const rect = host.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const localX = clamp(pointer.x, 0, width);
  const localY = clamp(pointer.y, 0, height);
  const now = performance.now();

  let rippleProgress = 0;
  let rippleWave = 0;
  let rippleDecay = 0;
  let rippleVelocityLength = 1;
  if (ripple.active && !prefersReducedMotion) {
    rippleProgress = (now - ripple.startedAt) / config.rippleDurationMs;
    if (rippleProgress >= 1) {
      ripple.active = false;
    } else {
      rippleWave = rippleProgress * config.rippleDurationMs * config.rippleSpeedPxPerMs;
      rippleDecay = 1 - rippleProgress;
      rippleVelocityLength = Math.max(1, Math.hypot(ripple.vx, ripple.vy));
    }
  }

  const baseDepth = prefersReducedMotion ? config.baseDepth * 0.76 : config.baseDepth;

  for (let index = 0; index < metrics.length; index += 1) {
    const metric = metrics[index];
    const deltaX = metric.x - localX;
    const deltaY = metric.y - localY;
    const distance = Math.hypot(deltaX, deltaY);
    const hoverBase = active && !prefersReducedMotion
      ? clamp(1 - distance / (config.hoverRadius + metric.radius * 0.28), 0, 1)
      : 0;
    const hoverLift = hoverBase * hoverBase * config.hoverLift;

    let rippleLift = 0;
    if (ripple.active && !prefersReducedMotion) {
      const glyphDx = metric.x - ripple.x;
      const glyphDy = metric.y - ripple.y;
      const rippleDistance = Math.hypot(glyphDx, glyphDy);
      const band = clamp(1 - Math.abs(rippleDistance - rippleWave) / config.rippleBandPx, 0, 1);
      const direction = (glyphDx * ripple.vx + glyphDy * ripple.vy) / (Math.max(1, rippleDistance) * rippleVelocityLength);
      rippleLift = band * band * config.rippleLift * ripple.energy * rippleDecay * (0.82 + Math.max(0, direction) * 0.18);
    }

    const totalLift = hoverLift + rippleLift;
    const distanceScale = Math.max(metric.radius, distance);
    const directionalX = clamp(deltaX / distanceScale, -1, 1);
    const directionalY = clamp(deltaY / distanceScale, -1, 1);
    const offsetX = active && !prefersReducedMotion ? -directionalX * totalLift * 0.28 : 0;
    const offsetY = -(hoverLift * 0.72 + rippleLift * 0.96);
    const rotateY = active && !prefersReducedMotion ? clamp(-directionalX * (7 + hoverBase * 7), -15, 15) : 0;
    const rotateX = active && !prefersReducedMotion ? clamp(directionalY * (5 + hoverBase * 5) - totalLift * 0.14, -12, 12) : clamp(-totalLift * 0.08, -6, 6);
    const scale = 1 + clamp(totalLift * 0.01, 0, prefersReducedMotion ? 0.025 : 0.12);
    const shadow = clamp(totalLift / (config.hoverLift + config.rippleLift), 0.12, 1);
    setMenuCardVars(refs[index], baseDepth, hoverLift, rippleLift, shadow, offsetX, offsetY, rotateX, rotateY, scale);
  }
}

function setGlyphDepthVars(
  node: HTMLSpanElement | null,
  depth: number,
  lift: number,
  ripple: number,
  shadow: number,
  offsetX: number,
  offsetY: number,
  rotateX: number,
  rotateY: number,
  scale: number,
): void {
  if (!node) {
    return;
  }
  node.style.setProperty("--glyph-depth", `${depth.toFixed(3)}px`);
  node.style.setProperty("--glyph-lift", `${lift.toFixed(3)}px`);
  node.style.setProperty("--glyph-ripple", `${ripple.toFixed(3)}px`);
  node.style.setProperty("--glyph-shadow-alpha", shadow.toFixed(3));
  node.style.setProperty("--glyph-offset-x", `${offsetX.toFixed(3)}px`);
  node.style.setProperty("--glyph-offset-y", `${offsetY.toFixed(3)}px`);
  node.style.setProperty("--glyph-rotate-x", `${rotateX.toFixed(3)}deg`);
  node.style.setProperty("--glyph-rotate-y", `${rotateY.toFixed(3)}deg`);
  node.style.setProperty("--glyph-scale", scale.toFixed(4));
}

function updateDepthBlock(
  host: HTMLElement | null,
  metrics: GlyphMetric[],
  baseRefs: Array<HTMLSpanElement | null>,
  overlayRefs: Array<HTMLSpanElement | null>,
  pointer: { x: number; y: number },
  active: boolean,
  config: DepthConfig,
  motion: BlockMotionState,
  ripple: RippleState,
  prefersReducedMotion: boolean,
): void {
  if (!host) {
    return;
  }

  const rect = host.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const localX = clamp(pointer.x, 0, width);
  const localY = clamp(pointer.y, 0, height);
  const normalizedX = (localX / width - 0.5) * 2;
  const normalizedY = (localY / height - 0.5) * 2;

  const targetTiltX = active && !prefersReducedMotion ? clamp(-normalizedY * config.maxTiltX, -config.maxTiltX, config.maxTiltX) : 0;
  const targetTiltY = active && !prefersReducedMotion ? clamp(normalizedX * config.maxTiltY, -config.maxTiltY, config.maxTiltY) : 0;
  const targetShiftX = active && !prefersReducedMotion ? normalizedX * config.maxShiftX : 0;
  const targetShiftY = active && !prefersReducedMotion ? normalizedY * config.maxShiftY : 0;
  const smoothing = prefersReducedMotion ? 0.34 : 0.18;

  motion.tiltX += (targetTiltX - motion.tiltX) * smoothing;
  motion.tiltY += (targetTiltY - motion.tiltY) * smoothing;
  motion.shiftX += (targetShiftX - motion.shiftX) * smoothing;
  motion.shiftY += (targetShiftY - motion.shiftY) * smoothing;
  setBlockMotionVars(host, motion);

  const now = performance.now();
  let rippleProgress = 0;
  let rippleWave = 0;
  let rippleDecay = 0;
  let rippleVelocityLength = 1;
  if (ripple.active && !prefersReducedMotion) {
    rippleProgress = (now - ripple.startedAt) / config.rippleDurationMs;
    if (rippleProgress >= 1) {
      ripple.active = false;
    } else {
      rippleWave = rippleProgress * config.rippleDurationMs * config.rippleSpeedPxPerMs;
      rippleDecay = 1 - rippleProgress;
      rippleVelocityLength = Math.max(1, Math.hypot(ripple.vx, ripple.vy));
    }
  }

  const baseDepth = prefersReducedMotion ? config.baseDepth * 0.74 : config.baseDepth;

  for (let index = 0; index < metrics.length; index += 1) {
    const metric = metrics[index];
    const deltaX = metric.x - localX;
    const deltaY = metric.y - localY;
    const distance = Math.hypot(deltaX, deltaY);
    const hoverBase = active && !prefersReducedMotion
      ? clamp(1 - distance / (config.hoverRadius + metric.radius * 0.32), 0, 1)
      : 0;
    const hoverLift = hoverBase * hoverBase * config.hoverLift;

    let rippleLift = 0;
    if (ripple.active && !prefersReducedMotion) {
      const glyphDx = metric.x - ripple.x;
      const glyphDy = metric.y - ripple.y;
      const rippleDistance = Math.hypot(glyphDx, glyphDy);
      const band = clamp(1 - Math.abs(rippleDistance - rippleWave) / config.rippleBandPx, 0, 1);
      const direction = (glyphDx * ripple.vx + glyphDy * ripple.vy) / (Math.max(1, rippleDistance) * rippleVelocityLength);
      const directionBias = 0.78 + Math.max(0, direction) * 0.22;
      rippleLift = band * band * config.rippleLift * ripple.energy * rippleDecay * directionBias;
    }

    const totalLift = hoverLift + rippleLift;
    const distanceScale = Math.max(metric.radius, distance);
    const directionalX = clamp(deltaX / distanceScale, -1, 1);
    const directionalY = clamp(deltaY / distanceScale, -1, 1);
    const rippleNudge = ripple.active && !prefersReducedMotion
      ? clamp((metric.x - ripple.x) / Math.max(metric.radius * 1.2, 1), -1, 1) * rippleLift * 0.16
      : 0;
    const offsetX = active && !prefersReducedMotion
      ? (-directionalX * hoverLift * 0.22) + rippleNudge
      : rippleNudge * 0.6;
    const offsetY = -(hoverLift * 0.9 + rippleLift * 1.08);
    const rotateY = active && !prefersReducedMotion
      ? clamp(-directionalX * (8 + hoverBase * 6) + rippleNudge * 0.9, -16, 16)
      : clamp(rippleNudge * 0.4, -8, 8);
    const rotateX = active && !prefersReducedMotion
      ? clamp(directionalY * (6 + hoverBase * 5) - totalLift * 0.12, -14, 14)
      : clamp(-totalLift * 0.1, -8, 8);
    const scale = 1 + clamp(totalLift * 0.012, 0, prefersReducedMotion ? 0.03 : 0.18);
    const shadow = clamp(totalLift / (config.hoverLift + config.rippleLift), 0.08, 1);
    setGlyphDepthVars(baseRefs[index], baseDepth, hoverLift, rippleLift, shadow, offsetX, offsetY, rotateX, rotateY, scale);
    setGlyphDepthVars(overlayRefs[index], baseDepth, hoverLift, rippleLift, shadow, offsetX, offsetY, rotateX, rotateY, scale);
  }
}

function renderDepthGlyphs(
  text: string,
  seedStart: number,
  kind: DepthKind,
  tone: GlyphTone,
  refs: GlyphRefCollection,
  indexOffset = 0,
) {
  const faceStyle = tone === "plain" ? plainFaceStyle() : undefined;

  return Array.from(text).map((char, index) => {
    const glyph = char === " " ? "\u00A0" : char;
    const refIndex = indexOffset + index;
    const pulseStyle = kind === "title" ? idlePulseStyle(seedStart + (refIndex * 53)) : undefined;

    return (
      <span
        key={`${kind}-${tone}-${seedStart}-${index}`}
        ref={(node) => {
          refs.current[refIndex] = node;
        }}
        className={`chv-glyph-stack chv-glyph-stack--${kind}${char === " " ? " chv-glyph-stack--space" : ""}`}
        style={pulseStyle}
      >
        <span className="chv-glyph-pulse">
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--back">{glyph}</span>
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--slice chv-glyph-layer--slice-1">{glyph}</span>
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--slice chv-glyph-layer--slice-2">{glyph}</span>
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--slice chv-glyph-layer--slice-3">{glyph}</span>
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--slice chv-glyph-layer--slice-4">{glyph}</span>
          <span aria-hidden className="chv-glyph-layer chv-glyph-layer--slice chv-glyph-layer--slice-5">{glyph}</span>
          <span
            className={`chv-glyph-layer chv-glyph-layer--face ${
              tone === "painted" ? "chv-glyph-face--painted" : "chv-glyph-face--plain"
            }`}
            style={tone === "painted" ? paintStyle(seedStart + index * 37) : faceStyle}
          >
            {glyph}
          </span>
        </span>
      </span>
    );
  });
}

export default function ChloeverseMainLanding({
  titleFontClassName,
  monoFontClassName,
}: ChloeverseMainLandingProps) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorFillRef = useRef<HTMLDivElement>(null);
  const bgRainbowRef = useRef<HTMLDivElement>(null);
  const titleHitRef = useRef<HTMLDivElement>(null);
  const titleOverlayRef = useRef<HTMLDivElement>(null);
  const taglineHitRef = useRef<HTMLDivElement>(null);
  const taglineOverlayRef = useRef<HTMLDivElement>(null);
  const menuHitRef = useRef<HTMLElement>(null);
  const scrollHintRef = useRef<HTMLParagraphElement>(null);

  const titleBaseGlyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const titleOverlayGlyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const taglineBaseGlyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const taglineOverlayGlyphRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const menuCardRefs: MenuCardRefCollection = useRef<Array<HTMLAnchorElement | null>>([]);
  const titleGlyphMetricsRef = useRef<GlyphMetric[]>([]);
  const taglineGlyphMetricsRef = useRef<GlyphMetric[]>([]);
  const menuCardMetricsRef = useRef<GlyphMetric[]>([]);
  const titleBlockMotionRef = useRef<BlockMotionState>({ tiltX: 0, tiltY: 0, shiftX: 0, shiftY: 0 });
  const taglineBlockMotionRef = useRef<BlockMotionState>({ tiltX: 0, tiltY: 0, shiftX: 0, shiftY: 0 });
  const titleRippleRef = useRef<RippleState>(createRippleState());
  const taglineRippleRef = useRef<RippleState>(createRippleState());
  const menuRippleRef = useRef<RippleState>(createRippleState());

  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const pointerPrevRef = useRef({ x: 0, y: 0 });
  const pointerVelocityRef = useRef({ x: 0, y: 0 });
  const menuPointerTargetRef = useRef({ x: 0, y: 0 });
  const menuPointerCurrentRef = useRef({ x: 0, y: 0 });
  const titleMaskTargetRef = useRef({ x: 0, y: 0 });
  const titleMaskCurrentRef = useRef({ x: 0, y: 0 });
  const taglineMaskTargetRef = useRef({ x: 0, y: 0 });
  const taglineMaskCurrentRef = useRef({ x: 0, y: 0 });
  const bgRadiusCurrentRef = useRef(0);
  const sawFinePointerRef = useRef(false);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isFinePointer, setIsFinePointer] = useState(false);
  const [titleEntered, setTitleEntered] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const [activeSpotTarget, setActiveSpotTarget] = useState<SpotTarget>(null);
  const [hoverRegion, setHoverRegion] = useState<HoverRegion>("bg");
  const [hasPointer, setHasPointer] = useState(false);
  const [cursorMode, setCursorMode] = useState<CursorMode>("idle");
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuRevealNonce, setMenuRevealNonce] = useState(0);
  const [webglSupported, setWebglSupported] = useState(true);

  const backdropPaint = useMemo(() => paintBackdropStyle(1337), []);
  const cursorBgPaint = useMemo(() => paintCursorFillStyle(1337), []);
  const bgMaskStyle = useMemo<CssVars>(
    () => ({
      ...backdropPaint,
      "--bgx": "50vw",
      "--bgy": "50vh",
      "--bgr": "0px",
      "--bg-parallax-x": "0px",
      "--bg-parallax-y": "0px",
      "--bg-scale": "1",
      WebkitMaskImage:
        "radial-gradient(circle var(--bgr) at var(--bgx) var(--bgy), rgba(0,0,0,1) 0%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)",
      maskImage:
        "radial-gradient(circle var(--bgr) at var(--bgx) var(--bgy), rgba(0,0,0,1) 0%, rgba(0,0,0,1) 94%, rgba(0,0,0,0) 100%)",
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
      willChange: "mask-image, -webkit-mask-image, transform",
      transform: "translate3d(var(--bg-parallax-x), var(--bg-parallax-y), 0) scale(var(--bg-scale))",
    }),
    [backdropPaint],
  );
  const textMaskStyle = useMemo<CssVars>(
    () => ({
      "--mx": "50%",
      "--my": "50%",
      "--r": `${SPOTLIGHT_RADIUS}px`,
    }),
    [],
  );

  const titleTransition = prefersReducedMotion
    ? "none"
    : "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";
  const shouldPulseTitle = !prefersReducedMotion && activeSpotTarget !== "title";

  const syncPointerModeFromType = (pointerType: string | undefined) => {
    if (pointerType === "mouse" || pointerType === "pen") {
      sawFinePointerRef.current = true;
      if (!isFinePointer) {
        setIsFinePointer(true);
      }
      return true;
    }
    if (pointerType === "touch") {
      if (isFinePointer) {
        setIsFinePointer(false);
      }
      setHasPointer(false);
      setActiveSpotTarget(null);
      setHoverRegion("bg");
      setCursorMode("idle");
      return false;
    }
    return isFinePointer;
  };

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncMotion = () => setPrefersReducedMotion(reducedMotionQuery.matches);
    const syncPointerHint = () => {
      const fine = finePointerQuery.matches;
      if (fine) {
        setIsFinePointer(true);
        return;
      }
      if (sawFinePointerRef.current) {
        return;
      }
      setIsFinePointer(false);
      setHasPointer(false);
      setActiveSpotTarget(null);
      setHoverRegion("bg");
      setCursorMode("idle");
      bgRadiusCurrentRef.current = 0;
      bgRainbowRef.current?.style.setProperty("--bgr", "0px");
    };

    syncMotion();
    syncPointerHint();

    reducedMotionQuery.addEventListener("change", syncMotion);
    finePointerQuery.addEventListener("change", syncPointerHint);
    return () => {
      reducedMotionQuery.removeEventListener("change", syncMotion);
      finePointerQuery.removeEventListener("change", syncPointerHint);
    };
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const supported = Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
      setWebglSupported(supported);
    } catch {
      setWebglSupported(false);
    }
  }, []);

  useEffect(() => {
    const syncCenters = () => {
      titleBaseGlyphRefs.current.length = TITLE_GLYPH_COUNT;
      titleOverlayGlyphRefs.current.length = TITLE_GLYPH_COUNT;
      taglineBaseGlyphRefs.current.length = typedText.length;
      taglineOverlayGlyphRefs.current.length = typedText.length;
      menuCardRefs.current.length = MENU_LINKS.length;

      const titleRect = titleHitRef.current?.getBoundingClientRect();
      if (titleRect) {
        const center = { x: titleRect.width * 0.5, y: titleRect.height * 0.5 };
        titleMaskTargetRef.current = center;
        titleMaskCurrentRef.current = center;
        setMaskPosition(titleOverlayRef.current, center.x, center.y);
      }

      const taglineRect = taglineHitRef.current?.getBoundingClientRect();
      if (taglineRect) {
        const center = { x: taglineRect.width * 0.5, y: taglineRect.height * 0.5 };
        taglineMaskTargetRef.current = center;
        taglineMaskCurrentRef.current = center;
        setMaskPosition(taglineOverlayRef.current, center.x, center.y);
      }

      titleGlyphMetricsRef.current = measureGlyphMetrics(titleHitRef.current, titleBaseGlyphRefs.current, TITLE_GLYPH_COUNT);
      taglineGlyphMetricsRef.current = measureGlyphMetrics(taglineHitRef.current, taglineBaseGlyphRefs.current, typedText.length);

      if (menuVisible) {
        const menuRect = menuHitRef.current?.getBoundingClientRect();
        if (menuRect) {
          const center = { x: menuRect.width * 0.5, y: menuRect.height * 0.5 };
          menuPointerTargetRef.current = center;
          menuPointerCurrentRef.current = center;
        }
        menuCardMetricsRef.current = measureGlyphMetrics(menuHitRef.current, menuCardRefs.current, MENU_LINKS.length);
      } else {
        menuCardMetricsRef.current = [];
      }
    };

    let raf = window.requestAnimationFrame(syncCenters);
    window.addEventListener("resize", syncCenters);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncCenters);
    };
  }, [menuRevealNonce, menuVisible, typedText]);

  useEffect(() => {
    setTitleEntered(prefersReducedMotion);
    setTypedText(prefersReducedMotion ? TAGLINE : "");
    setTypingDone(prefersReducedMotion);

    if (prefersReducedMotion) {
      return;
    }

    let titleTimer = 0;
    let startTimer = 0;
    let stepTimer = 0;
    let index = 0;

    titleTimer = window.setTimeout(() => {
      setTitleEntered(true);
    }, 40);

    startTimer = window.setTimeout(() => {
      const tick = () => {
        index += 1;
        setTypedText(TAGLINE.slice(0, index));
        if (index >= TAGLINE.length) {
          setTypingDone(true);
          return;
        }
        stepTimer = window.setTimeout(tick, typingDelay(TAGLINE[index] ?? ""));
      };
      tick();
    }, 1000);

    return () => {
      window.clearTimeout(titleTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(stepTimer);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    stopCollabsBgm({ clearGestureListeners: true });
  }, []);

  useEffect(() => {
    let frame = 0;
    const pointerLerp = prefersReducedMotion ? 1 : POINTER_LERP;
    const maskLerp = prefersReducedMotion ? 1 : MASK_LERP;

    const animate = () => {
      if (!isFinePointer) {
        bgRadiusCurrentRef.current = 0;
        pointerVelocityRef.current = { x: 0, y: 0 };
        bgRainbowRef.current?.style.setProperty("--bgr", "0px");
        bgRainbowRef.current?.style.setProperty("--bg-parallax-x", "0px");
        bgRainbowRef.current?.style.setProperty("--bg-parallax-y", "0px");
        bgRainbowRef.current?.style.setProperty("--bg-scale", "1");
        cursorRef.current?.style.setProperty("--fillOpacity", "0");
        cursorRef.current?.style.setProperty("--fillInset", "6px");
        cursorRef.current?.style.setProperty("--lens-shadow-x", "0px");
        cursorRef.current?.style.setProperty("--lens-shadow-y", "0px");
        cursorRef.current?.style.setProperty("--lens-highlight-x", "0px");
        cursorRef.current?.style.setProperty("--lens-highlight-y", "0px");
        cursorRef.current?.style.setProperty("--lens-scale", "1");
        cursorRef.current?.style.setProperty("--lens-shadow-alpha", "0.22");
        frame = window.requestAnimationFrame(animate);
        return;
      }

      const pointerTarget = pointerTargetRef.current;
      const pointerCurrent = pointerCurrentRef.current;
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerLerp;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerLerp;
      const menuPointerTarget = menuPointerTargetRef.current;
      const menuPointerCurrent = menuPointerCurrentRef.current;
      menuPointerCurrent.x += (menuPointerTarget.x - menuPointerCurrent.x) * pointerLerp;
      menuPointerCurrent.y += (menuPointerTarget.y - menuPointerCurrent.y) * pointerLerp;

      const pointerVelocity = pointerVelocityRef.current;
      const prevPointer = pointerPrevRef.current;
      const rawVx = pointerCurrent.x - prevPointer.x;
      const rawVy = pointerCurrent.y - prevPointer.y;
      pointerVelocity.x += (rawVx - pointerVelocity.x) * 0.26;
      pointerVelocity.y += (rawVy - pointerVelocity.y) * 0.26;
      pointerPrevRef.current = { x: pointerCurrent.x, y: pointerCurrent.y };

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${pointerCurrent.x}px, ${pointerCurrent.y}px, 0) translate(-50%, -50%)`;
      }

      const titleTarget = titleMaskTargetRef.current;
      const titleCurrent = titleMaskCurrentRef.current;
      titleCurrent.x += (titleTarget.x - titleCurrent.x) * maskLerp;
      titleCurrent.y += (titleTarget.y - titleCurrent.y) * maskLerp;
      setMaskPosition(titleOverlayRef.current, titleCurrent.x, titleCurrent.y);

      const taglineTarget = taglineMaskTargetRef.current;
      const taglineCurrent = taglineMaskCurrentRef.current;
      taglineCurrent.x += (taglineTarget.x - taglineCurrent.x) * maskLerp;
      taglineCurrent.y += (taglineTarget.y - taglineCurrent.y) * maskLerp;
      setMaskPosition(taglineOverlayRef.current, taglineCurrent.x, taglineCurrent.y);

      updateDepthBlock(
        titleHitRef.current,
        titleGlyphMetricsRef.current,
        titleBaseGlyphRefs.current,
        titleOverlayGlyphRefs.current,
        titleCurrent,
        hasPointer && activeSpotTarget === "title",
        TITLE_DEPTH_CONFIG,
        titleBlockMotionRef.current,
        titleRippleRef.current,
        prefersReducedMotion,
      );

      updateDepthBlock(
        taglineHitRef.current,
        taglineGlyphMetricsRef.current,
        taglineBaseGlyphRefs.current,
        taglineOverlayGlyphRefs.current,
        taglineCurrent,
        hasPointer && activeSpotTarget === "tagline",
        TAGLINE_DEPTH_CONFIG,
        taglineBlockMotionRef.current,
        taglineRippleRef.current,
        prefersReducedMotion,
      );

      if (menuVisible) {
        updateMenuCards(
          menuHitRef.current,
          menuCardMetricsRef.current,
          menuCardRefs.current,
          menuPointerCurrent,
          hasPointer && hoverRegion === "small" && activeSpotTarget === null,
          MENU_CARD_DEPTH_CONFIG,
          menuRippleRef.current,
          prefersReducedMotion,
        );
      }

      const bgTarget = hasPointer && hoverRegion === "bg" ? BG_REVEAL_RADIUS : 0;
      if (prefersReducedMotion) {
        bgRadiusCurrentRef.current = bgTarget;
      } else {
        bgRadiusCurrentRef.current += (bgTarget - bgRadiusCurrentRef.current) * 0.2;
      }

      const lensVx = clamp(pointerVelocity.x * 6, -18, 18);
      const lensVy = clamp(pointerVelocity.y * 6, -18, 18);
      const bgParallaxX = hoverRegion === "bg" ? clamp(-lensVx * 0.42, -7, 7) : 0;
      const bgParallaxY = hoverRegion === "bg" ? clamp(-lensVy * 0.42, -7, 7) : 0;
      const lensScale = hoverRegion === "bg" ? 1.05 + Math.min(0.08, Math.hypot(lensVx, lensVy) * 0.0028) : 1;

      if (bgRainbowRef.current) {
        bgRainbowRef.current.style.setProperty("--bgx", `${pointerCurrent.x}px`);
        bgRainbowRef.current.style.setProperty("--bgy", `${pointerCurrent.y}px`);
        bgRainbowRef.current.style.setProperty("--bgr", `${Math.max(0, bgRadiusCurrentRef.current)}px`);
        bgRainbowRef.current.style.setProperty("--bg-parallax-x", `${bgParallaxX.toFixed(3)}px`);
        bgRainbowRef.current.style.setProperty("--bg-parallax-y", `${bgParallaxY.toFixed(3)}px`);
        bgRainbowRef.current.style.setProperty("--bg-scale", hoverRegion === "bg" ? lensScale.toFixed(4) : "1");
      }

      if (cursorRef.current) {
        const showCursorBg = hoverRegion === "bg";
        cursorRef.current.style.setProperty("--fillOpacity", showCursorBg ? "1" : "0");
        cursorRef.current.style.setProperty("--fillInset", showCursorBg ? "1px" : "6px");
        cursorRef.current.style.setProperty("--lens-shadow-x", `${(-lensVx * 0.62).toFixed(3)}px`);
        cursorRef.current.style.setProperty("--lens-shadow-y", `${(-lensVy * 0.62).toFixed(3)}px`);
        cursorRef.current.style.setProperty("--lens-highlight-x", `${(lensVx * 0.38).toFixed(3)}px`);
        cursorRef.current.style.setProperty("--lens-highlight-y", `${(lensVy * 0.34).toFixed(3)}px`);
        cursorRef.current.style.setProperty("--lens-scale", lensScale.toFixed(4));
        cursorRef.current.style.setProperty(
          "--lens-shadow-alpha",
          (showCursorBg ? clamp(0.26 + Math.hypot(lensVx, lensVy) * 0.006, 0.26, 0.56) : 0.2).toFixed(3),
        );
      }

      if (cursorFillRef.current) {
        const showCursorBg = hoverRegion === "bg";
        if (showCursorBg) {
          const ox = 50 + Math.sin(pointerCurrent.x * 0.012 + pointerCurrent.y * 0.004 + lensVx * 0.016) * 18;
          const oy = 50 + Math.cos(pointerCurrent.y * 0.011 - pointerCurrent.x * 0.003 + lensVy * 0.014) * 18;
          cursorFillRef.current.style.backgroundPosition = `${ox.toFixed(2)}% ${oy.toFixed(2)}%`;
        } else {
          cursorFillRef.current.style.backgroundPosition = "50% 50%";
        }
      }

      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [activeSpotTarget, hasPointer, hoverRegion, isFinePointer, menuVisible, prefersReducedMotion]);

  const applyRegion = (region: HoverRegion, spotTarget: SpotTarget) => {
    setHoverRegion(region);
    if (spotTarget) {
      setActiveSpotTarget(spotTarget);
      setCursorMode("text");
      return;
    }
    setActiveSpotTarget(null);
    setCursorMode("bg");
  };

  const onRootPointerEnter = (event: PointerEvent<HTMLElement>) => {
    const fine = syncPointerModeFromType(event.pointerType);
    if (!fine) {
      return;
    }
    pointerTargetRef.current = { x: event.clientX, y: event.clientY };
    if (!hasPointer) {
      pointerCurrentRef.current = { x: event.clientX, y: event.clientY };
      pointerPrevRef.current = { x: event.clientX, y: event.clientY };
    }
    setHasPointer(true);
    setHoverRegion("bg");
    setCursorMode("bg");
  };

  const onRootPointerMove = (event: PointerEvent<HTMLElement>) => {
    const fine = syncPointerModeFromType(event.pointerType);
    if (!fine) {
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    pointerTargetRef.current = { x, y };
    if (!hasPointer) {
      pointerCurrentRef.current = { x, y };
      pointerPrevRef.current = { x, y };
    }

    const inRect = (rect: DOMRect | undefined) => !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    const titleRect = titleHitRef.current?.getBoundingClientRect();
    const taglineRect = taglineHitRef.current?.getBoundingClientRect();
    const menuRect = menuVisible ? menuHitRef.current?.getBoundingClientRect() : undefined;
    const scrollRect = scrollHintRef.current?.getBoundingClientRect();
    const isTitle = inRect(titleRect);
    const isTagline = inRect(taglineRect);
    const isMenu = inRect(menuRect);
    const isScrollHint = inRect(scrollRect);

    const region: HoverRegion = isTitle
      ? "title"
      : (isTagline || isMenu || isScrollHint)
          ? "small"
          : "bg";
    const spotTarget: SpotTarget = isTitle ? "title" : isTagline ? "tagline" : null;

    if (spotTarget === "title") {
      const next = updateMaskTarget(x, y, titleHitRef.current, titleMaskTargetRef);
      if (next) {
        setRipplePointer(titleRippleRef.current, next.x, next.y, prefersReducedMotion);
      }
      taglineRippleRef.current.hasLast = false;
    } else if (spotTarget === "tagline") {
      const next = updateMaskTarget(x, y, taglineHitRef.current, taglineMaskTargetRef);
      if (next) {
        setRipplePointer(taglineRippleRef.current, next.x, next.y, prefersReducedMotion);
      }
      titleRippleRef.current.hasLast = false;
    } else {
      titleRippleRef.current.hasLast = false;
      taglineRippleRef.current.hasLast = false;
    }

    if (isMenu && menuHitRef.current) {
      const menuRect = menuHitRef.current.getBoundingClientRect();
      const local = {
        x: clamp(x - menuRect.left, 0, menuRect.width),
        y: clamp(y - menuRect.top, 0, menuRect.height),
      };
      if (!menuRippleRef.current.hasLast) {
        menuPointerCurrentRef.current = local;
      }
      menuPointerTargetRef.current = local;
      setRipplePointer(menuRippleRef.current, local.x, local.y, prefersReducedMotion);
    } else {
      menuRippleRef.current.hasLast = false;
    }

    applyRegion(region, spotTarget);
    setHasPointer(true);
  };

  const onRootPointerLeave = () => {
    setHasPointer(false);
    setActiveSpotTarget(null);
    setHoverRegion("bg");
    setCursorMode("idle");
    bgRadiusCurrentRef.current = 0;
    titleRippleRef.current.hasLast = false;
    taglineRippleRef.current.hasLast = false;
    menuRippleRef.current.hasLast = false;
    bgRainbowRef.current?.style.setProperty("--bgr", "0px");
  };

  const onRootPointerDown = () => {
    if (!menuVisible) {
      setMenuVisible(true);
      setMenuRevealNonce((value) => value + 1);
    }
  };

  const cursorSize = !hasPointer
    ? 10
    : hoverRegion === "bg"
      ? CURSOR_LARGE_SIZE
      : hoverRegion === "title"
        ? CURSOR_MEDIUM_SIZE
        : CURSOR_SMALL_SIZE;
  const cursorHaloSize = !hasPointer
    ? 16
    : hoverRegion === "bg"
      ? CURSOR_HALO_LARGE_SIZE
      : hoverRegion === "title"
        ? CURSOR_HALO_MEDIUM_SIZE
        : CURSOR_HALO_SMALL_SIZE;

  const cursorCoreClass =
    cursorMode === "text"
      ? "border-white/90 bg-white/10 shadow-[0_0_18px_rgba(255,255,255,0.35)]"
      : cursorMode === "bg"
        ? "border-white/60 bg-white/[0.03] shadow-[0_0_24px_rgba(255,255,255,0.16),inset_0_0_0_1px_rgba(255,255,255,0.07)]"
        : "border-white/50 bg-white/90 shadow-[0_0_12px_rgba(255,255,255,0.2)]";

  const cursorHaloClass =
    cursorMode === "text"
      ? "opacity-45 shadow-[0_0_28px_rgba(255,255,255,0.22)]"
      : cursorMode === "bg"
        ? "opacity-50 shadow-[0_0_24px_rgba(255,255,255,0.12),0_0_44px_rgba(255,255,255,0.08)]"
        : "opacity-40 shadow-[0_0_16px_rgba(255,255,255,0.14)]";
  const useAstroField = !prefersReducedMotion && webglSupported;
  const showBgRainbow = !useAstroField && isFinePointer && hoverRegion === "bg";

  return (
    <main
      onPointerEnter={onRootPointerEnter}
      onPointerMove={onRootPointerMove}
      onPointerLeave={onRootPointerLeave}
      onPointerDown={onRootPointerDown}
      className={`relative min-h-[240vh] overflow-x-clip bg-black text-white ${isFinePointer ? "chv-home-cursorless" : ""}`}
    >
      <div aria-hidden className="absolute inset-0 z-0 bg-black" />

      {useAstroField ? (
        <DesktopAstroField
          className="chv-home-astro-field pointer-events-none fixed inset-0 z-[8]"
        />
      ) : (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-10">
          <div ref={bgRainbowRef} className="absolute inset-0" style={bgMaskStyle} />
        </div>
      )}

      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 chv-vignette" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-20 chv-filmgrain" />

      {isFinePointer ? (
        <div
          ref={cursorRef}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-50 transition-opacity duration-200"
          style={{
            opacity: hasPointer ? 1 : 0,
            "--fillInset": "6px",
            "--fillOpacity": "0",
            "--fillBaseSize": `${cursorSize}px`,
            "--lens-shadow-x": "0px",
            "--lens-shadow-y": "0px",
            "--lens-highlight-x": "0px",
            "--lens-highlight-y": "0px",
            "--lens-scale": "1",
            "--lens-shadow-alpha": "0.22",
          } as CssVars}
        >
          <div
            className="chv-cursor-shadow absolute left-1/2 top-1/2"
            style={{ width: `${cursorSize + 26}px`, height: `${cursorSize + 26}px` }}
          />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${cursorHaloClass}`}
            style={{ width: `${cursorHaloSize}px`, height: `${cursorHaloSize}px` }}
          />
          <div
            className="chv-cursor-lens absolute left-1/2 top-1/2"
            style={{ width: `${cursorSize + 8}px`, height: `${cursorSize + 8}px` }}
          />
          <div
            className="chv-cursor-spec absolute left-1/2 top-1/2"
            style={{ width: `${Math.max(18, cursorSize * 0.6)}px`, height: `${Math.max(18, cursorSize * 0.6)}px` }}
          />
          <div
            ref={cursorFillRef}
            aria-hidden
            className="chv-cursor-fill absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: "calc(var(--fillBaseSize) - (var(--fillInset) * 2))",
              height: "calc(var(--fillBaseSize) - (var(--fillInset) * 2))",
              ...cursorBgPaint,
              opacity: "var(--fillOpacity)",
              transition: "opacity 120ms ease",
            }}
          />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-all duration-200 ${cursorCoreClass}`}
            style={{
              width: `${cursorSize}px`,
              height: `${cursorSize}px`,
              backgroundColor: showBgRainbow ? "transparent" : undefined,
            }}
          />
        </div>
      ) : null}

      <div className="relative z-30">
        <section className="sticky top-0 flex min-h-screen items-center justify-center px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center text-center">
            <div
              ref={titleHitRef}
              className={`relative inline-flex w-auto flex-col flex-nowrap items-center whitespace-nowrap overflow-visible px-6 select-none ${
                shouldPulseTitle ? "chv-title-idle-pulse" : ""
              }`}
              style={{
                opacity: titleEntered ? 1 : 0,
                transform: titleEntered ? "translateY(0px)" : "translateY(100px)",
                transition: titleTransition,
                "--block-tilt-x": "0deg",
                "--block-tilt-y": "0deg",
                "--block-shift-x": "0px",
                "--block-shift-y": "0px",
              } as CssVars}
            >
              <div className="chv-depth-stage chv-depth-stage--title">
                <div className={`${titleFontClassName} chv-depth-plane overflow-visible leading-[0.84] tracking-[0.02em]`}>
                  <div className="text-[clamp(2rem,4.85vw,3.45rem)]">
                    {renderDepthGlyphs(TITLE_TOP, 101, "title", "painted", titleBaseGlyphRefs, 0)}
                  </div>
                  <div className="-mt-1 inline-flex flex-nowrap whitespace-nowrap overflow-visible text-[clamp(3.5rem,13vw,12rem)]">
                    {renderDepthGlyphs(TITLE_MAIN, 701, "title", "painted", titleBaseGlyphRefs, TITLE_TOP_COUNT)}
                  </div>
                </div>

                <div
                  ref={titleOverlayRef}
                  aria-hidden
                  className={`chv-depth-plane chv-depth-plane--overlay pointer-events-none absolute inset-0 overflow-visible chv-spotlight-mask transition-opacity duration-200 ${
                    isFinePointer && activeSpotTarget === "title" ? "opacity-100" : "opacity-0"
                  }`}
                  style={textMaskStyle}
                >
                  <div className={`${titleFontClassName} overflow-visible leading-[0.84] tracking-[0.02em]`}>
                    <div className="text-[clamp(2rem,4.85vw,3.45rem)]">
                      {renderDepthGlyphs(TITLE_TOP, 1001, "title", "plain", titleOverlayGlyphRefs, 0)}
                    </div>
                    <div className="-mt-1 inline-flex flex-nowrap whitespace-nowrap overflow-visible text-[clamp(3.5rem,13vw,12rem)]">
                      {renderDepthGlyphs(TITLE_MAIN, 1601, "title", "plain", titleOverlayGlyphRefs, TITLE_TOP_COUNT)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div
              ref={taglineHitRef}
              className={`${monoFontClassName} relative mt-11 inline-block select-none text-[clamp(1rem,2vw,1.35rem)] tracking-[0.15em] text-white`}
              style={{
                "--block-tilt-x": "0deg",
                "--block-tilt-y": "0deg",
                "--block-shift-x": "0px",
                "--block-shift-y": "0px",
              } as CssVars}
            >
              <div className="chv-depth-stage chv-depth-stage--tagline">
                <div className="chv-depth-plane relative">
                  <span className="whitespace-pre-wrap text-white/95 [text-shadow:0_0_18px_rgba(255,255,255,0.12)]">
                    {renderDepthGlyphs(typedText, 2201, "tagline", "plain", taglineBaseGlyphRefs)}
                  </span>
                  <span
                    aria-hidden
                    className={typingDone ? "chv-type-cursor chv-type-cursor-done" : "chv-type-cursor"}
                  >
                    |
                  </span>
                </div>

                <div
                  ref={taglineOverlayRef}
                  aria-hidden
                  className={`chv-depth-plane chv-depth-plane--overlay pointer-events-none absolute inset-0 chv-spotlight-mask transition-opacity duration-150 ${
                    isFinePointer && activeSpotTarget === "tagline" ? "opacity-100" : "opacity-0"
                  }`}
                  style={textMaskStyle}
                >
                  <span className="whitespace-pre-wrap">
                    {renderDepthGlyphs(typedText, 2301, "tagline", "painted", taglineOverlayGlyphRefs)}
                  </span>
                </div>
              </div>
            </div>

            <p
              ref={scrollHintRef}
              className={`${monoFontClassName} mt-[4.5rem] text-[11px] uppercase tracking-[0.42em] text-white/72`}
              style={{
                opacity: titleEntered ? 1 : 0,
                transform: titleEntered ? "translateY(0px)" : "translateY(24px)",
                transition: titleTransition,
                transitionDelay: prefersReducedMotion ? "0ms" : "120ms",
              }}
            >
              <span className={prefersReducedMotion ? undefined : "chv-scroll-blink"}>click for portals</span>
            </p>
          </div>
        </section>

        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex w-full justify-center"
          style={{ top: `${PORTAL_LINKS_TOP_OFFSET_PX}px` }}
        >
          <div className="pointer-events-auto">
            <nav
              ref={menuHitRef}
              aria-label="Primary"
              className={`flex flex-wrap items-center justify-center gap-3 sm:gap-4 ${menuVisible ? "opacity-100" : "opacity-0"}`}
              style={{ transition: "none" }}
            >
              {MENU_LINKS.map((link, index) => (
                <Link
                  key={`${link.href}-${menuRevealNonce}`}
                  ref={(node) => {
                    menuCardRefs.current[index] = node;
                  }}
                  href={link.href}
                  prefetch={link.href === "/contact" ? false : undefined}
                  className={`${monoFontClassName} chv-menu-card group relative inline-flex items-center overflow-hidden rounded-full border border-black/10 bg-white px-5 py-2 text-[0.74rem] tracking-[0.22em] text-black backdrop-blur-md transition-colors duration-200 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/35`}
                  style={{
                    "--card-depth": "8.2px",
                    "--card-lift": "0px",
                    "--card-ripple": "0px",
                    "--card-shadow-alpha": "0.12",
                    "--card-offset-x": "0px",
                    "--card-offset-y": "0px",
                    "--card-rotate-x": "0deg",
                    "--card-rotate-y": "0deg",
                    "--card-scale": "1",
                    ...(menuVisible
                      ? {
                          animationName: "chv-portal-link-drop-bounce",
                          animationDuration: "1320ms",
                          animationTimingFunction: "cubic-bezier(0.16, 0.78, 0.2, 1)",
                          animationFillMode: "both",
                          animationDelay: `${index * 90}ms`,
                        }
                      : {}),
                  } as CssVars}
                >
                  <span className="chv-menu-card__label relative z-10">{link.label}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 bottom-[6px] h-px bg-gradient-to-r from-[#ff4ea8] via-[#ffd646] to-[#4ce4ff] opacity-0 transition-opacity duration-200 group-hover:opacity-70 group-focus-visible:opacity-70"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(255,78,168,0.07), rgba(255,214,70,0.04) 45%, rgba(76,228,255,0.07))",
                    }}
                  />
                </Link>
              ))}
            </nav>
          </div>
        </div>

        <section className="relative h-[140vh] px-6 pt-[56vh] pb-24" />
      </div>
    </main>
  );
}
