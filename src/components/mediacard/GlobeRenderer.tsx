"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";

import { TARGETS, type PanelId, type PanelTargetKey } from "./focusPresets";

export type HoverRegion = {
  label: string;
  panelLabel: string;
  panelKey?: PanelTargetKey;
  x: number;
  y: number;
};

export type RegionSelection = {
  regionKey: PanelId;
  lat: number;
  lon: number;
  zoom: number;
  continentLabel?: string;
};

export type FocusRequest = {
  key: PanelId;
  lat: number;
  lon: number;
  zoom?: number;
  distance?: number;
};

// MICRO-TUNING CHECKLIST:
// dots too big/small or bright/dim -> DOT_BASE_SIZE_PX, DOT_GLOW_MULT, DOT_MIN_SIZE_DPR, DOT_MAX_SIZE_DPR, DOT_GLOW_ALPHA
// cage too visible/invisible -> CAGE_COLOR, CAGE_OPACITY_INNER, CAGE_OPACITY_OUTER
// focus too fast/slow -> FOCUS_DURATION_MS, RESTORE_DURATION_MS, FOCUS_EASE_POWER, CAMERA_DEFAULT_DISTANCE, CAMERA_FOCUSED_DISTANCE
// menu/card placement -> MENU_* and CARD_* knobs
const TUNE = {
  MASK_THRESHOLD: 0.5,
  MASK_WORK_W: 720,
  MASK_WORK_H: 360,
  MASK_MIN_ISLAND_COMPONENT_PX: 0,
  CAGE_COLOR: 0xffffff,
  CAGE_OPACITY_INNER: 0.18,
  CAGE_OPACITY_OUTER: 0.085,
  CAGE_GHOST_OPACITY_INNER: 0.02,
  CAGE_GHOST_OPACITY_OUTER: 0.01,
  CAGE_SCALE_INNER: 1.024,
  CAGE_SCALE_OUTER: 1.09,
  MASK_BAD_SCORE_THRESHOLD: 0,
  POINT_PX: 1.68,
  GLOW_MULT: 1.28,
  LAND_DOT_TARGET: 176000,
  LAND_MAX_CANDIDATES: 760000,
  LAND_DOT_CAP: 190000,
  HOTSPOT_SIGMA_DEG: 11,
  HOTSPOT_EDGE0: 0.7,
  HOTSPOT_EDGE1: 0.95,
  DEBUG_MASK_ALPHA: 0.78,
  STAR_COUNT: 420,
  STAR_RADIUS_MIN: 7.8,
  STAR_RADIUS_MAX: 12.8,
  ATMOS_RADIUS: 1.045,
  ATMOS_ALPHA: 0.0022,
  ATMOS_RIM_RADIUS: 1.02,
  ATMOS_RIM_ALPHA: 0.06,
  ATMOS_GLASS_RADIUS: 1.012,
  ATMOS_GLASS_ALPHA: 0.035,
  SCANLINE_ROWS: 240,
  SCANLINE_SPEED: 1.2,
  IDLE_ROTATION_RAD_PER_SEC: 0.02,
  MASK_RETRY_MAX: 2,
  MASK_RETRY_DELAY_MS: 280,
} as const;

export const MEDIACARD_TUNING = {
  DOT_BASE_SIZE_PX: TUNE.POINT_PX,
  DOT_GLOW_MULT: TUNE.GLOW_MULT,
  DOT_MIN_SIZE_DPR: 1.7,
  DOT_MAX_SIZE_DPR: 2.9,
  DOT_BEAD_NEAR: 2.2,
  DOT_BEAD_FAR: 7.5,
  DOT_BEAD_BOOST: 1.35,
  DOT_COLOR_BASE: "#D98F2A",
  DOT_COLOR_SECONDARY: "#8D63E9",
  DOT_COLOR_ACCENT: "#B497FF",
  PURPLE_DENSITY: 0.008,
  DOT_GLOW_ALPHA: 0.034,
  CAGE_COLOR: "#FFFFFF",
  CAGE_OPACITY_INNER: TUNE.CAGE_OPACITY_INNER,
  CAGE_OPACITY_OUTER: TUNE.CAGE_OPACITY_OUTER,
  CAMERA_DEFAULT_DISTANCE: 3.35,
  CAMERA_FOCUSED_DISTANCE: 1.74,
  CAMERA_CLICK_DISTANCE: 1.95,
  FOCUS_DURATION_MS: 900,
  RESTORE_DURATION_MS: 760,
  FOCUS_EASE_POWER: 3,
  TRACKBALL_SENSITIVITY: 1.0,
  DRAG_THRESHOLD_PX: 8,
  INERTIA_DAMPING: 0.93,
  INERTIA_MAX_SPEED: 3.2,
  REGION_ANCHOR_THRESHOLD_DEG: 12,
  HOVER_ANCHOR_THRESHOLD_DEG: 9,
  LON_OFFSET_DEG: 0,
  INIT_AZIMUTH: null as number | null,
  INIT_POLAR: null as number | null,
  MENU_OFFSET_X_PX: 52,
  MENU_OFFSET_Y_PCT: 35,
  MENU_WIDTH_PX: 272,
  MENU_FONT_PX: 16,
  MENU_PAD_Y_PX: 13,
  MENU_PAD_X_PX: 17,
  CARD_OFFSET_X_PX: 0,
  CARD_OFFSET_Y_PX: -4,
  CARD_MAX_WIDTH_PX: 780,
} as const;

export type GlobeRendererHandle = {
  focusToLatLon: (target: FocusRequest) => void;
  resetFocus: () => void;
};

type GlobeRendererProps = {
  className?: string;
  onFocusSettled: (panel: PanelId) => void;
  onRestSettled?: () => void;
  onSelectRegion: (selection: RegionSelection) => void;
  onHoverRegion: (region: HoverRegion | null) => void;
  interactionLocked?: boolean;
  hoverMarketId?: number;
  activeMarketId?: number;
};

type FocusMode = "idle" | "focusingIn" | "focused" | "focusingOut";

const FRONT = new THREE.Vector3(0, 0, 1);
const GLOBE_RADIUS = 1;
const DPR_CAP = 2;
const EARTH_MASK_URL = "/mediacard/earth_mask.png";
const MEDIACARD_BUILD_TAG = "mediacard_marketOverlay_forceDebug_v1";

const MARKET_NONE_ID = 0;
const MARKET_ID = {
  us: 1,
  ca: 2,
  au: 3,
  kr: 4,
} as const;

const MARKETS = [
  {
    id: MARKET_ID.us,
    key: "us",
    panelKey: "audience",
    label: "United States",
    latDeg: 37.1,
    lonDeg: -95.7,
    hitRadiusDeg: 13,
    marketTint: "#9E7CFF",
  },
  {
    id: MARKET_ID.ca,
    key: "ca",
    panelKey: "metrics",
    label: "Canada",
    latDeg: 56.1,
    lonDeg: -106.3,
    hitRadiusDeg: 13,
    marketTint: "#8EA8FF",
  },
  {
    id: MARKET_ID.au,
    key: "au",
    panelKey: "collabs",
    label: "Australia",
    latDeg: -25.3,
    lonDeg: 133.8,
    hitRadiusDeg: 11,
    marketTint: "#8A96FF",
  },
  {
    id: MARKET_ID.kr,
    key: "kr",
    panelKey: "services",
    label: "South Korea",
    latDeg: 36.5,
    lonDeg: 127.9,
    hitRadiusDeg: 7,
    marketTint: "#73D2FF",
  },
] as const;

const PANEL_TO_MARKET_ID: Record<PanelTargetKey, number> = {
  audience: MARKET_ID.us,
  metrics: MARKET_ID.ca,
  services: MARKET_ID.kr,
  collabs: MARKET_ID.au,
};

export function panelToMarketId(panel: PanelId | PanelTargetKey | null | undefined) {
  if (!panel || panel === "comingSoon") return MARKET_NONE_ID;
  return PANEL_TO_MARKET_ID[panel];
}

// Market emphasis tuning (keep crisp and deterministic, no extra randomness).
const MARKET_EMPHASIS = {
  IDLE_TINT: 0.18,
  HOVER_BOOST: 0.45,
  ACTIVE_BOOST: 0.75,
  SIZE_BUMP: 0.16,
} as const;

const PANEL_LABELS: Record<PanelTargetKey, string> = {
  audience: "Audience",
  metrics: "Metrics",
  services: "Services/Rates",
  collabs: "Noteworthy Collaborations",
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const normalizeLon = (lonDeg: number) => ((lonDeg + 540) % 360) - 180;
const easeInOut = (v: number, p: number) => (v < 0.5 ? 0.5 * Math.pow(v * 2, p) : 1 - 0.5 * Math.pow((1 - v) * 2, p));
const hash2 = (a: number, b: number, seed = 0) => {
  const n = Math.sin(a * 127.1 + b * 311.7 + seed * 173.37) * 43758.5453123;
  return n - Math.floor(n);
};

function latLonToUnit(latDeg: number, lonDeg: number, lonOffsetDeg = 0) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(normalizeLon(lonDeg + lonOffsetDeg));
  return new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)).normalize();
}

function quatToFront(unit: THREE.Vector3) {
  return new THREE.Quaternion().setFromUnitVectors(unit.clone().normalize(), FRONT);
}

function azimuthPolarToUnit(azimuthRad: number, polarRad: number) {
  const polar = clamp(polarRad, 0.0001, Math.PI - 0.0001);
  const sinPolar = Math.sin(polar);
  return new THREE.Vector3(sinPolar * Math.sin(azimuthRad), Math.cos(polar), sinPolar * Math.cos(azimuthRad)).normalize();
}

function zoomToDistance(zoom: number) {
  return clamp(
    MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE / Math.max(zoom, 0.001),
    MEDIACARD_TUNING.CAMERA_FOCUSED_DISTANCE,
    MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE
  );
}

function projectToTrackball(clientX: number, clientY: number, rect: DOMRect) {
  let x = ((clientX - rect.left) / rect.width) * 2 - 1;
  let y = -(((clientY - rect.top) / rect.height) * 2 - 1);
  const z2 = 1 - x * x - y * y;
  let z = 0;
  if (z2 > 0) z = Math.sqrt(z2);
  else {
    const inv = 1 / Math.sqrt(x * x + y * y);
    x *= inv;
    y *= inv;
  }
  return new THREE.Vector3(x, y, z).normalize();
}

type DotBuffers = {
  positions: Float32Array;
  hot: Float32Array;
  phases: Float32Array;
  marketId: Float32Array;
  marketW: Float32Array;
};

type MaskChannel = "r" | "g" | "b" | "a" | "lum";

type MaskSampler = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  channel: MaskChannel;
};

function createEmptyDots(): DotBuffers {
  return {
    positions: new Float32Array(0),
    hot: new Float32Array(0),
    phases: new Float32Array(0),
    marketId: new Float32Array(0),
    marketW: new Float32Array(0),
  };
}

function wrap01(v: number) {
  return ((v % 1) + 1) % 1;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

type MaskCalibration = {
  uFlip: boolean;
  vFlip: boolean;
  uOffset: number;
  invert: number;
  channel: MaskChannel;
  thresh: number;
  score: number;
};

function maskChannelToCode(channel: MaskChannel) {
  if (channel === "r") return 0;
  if (channel === "g") return 1;
  if (channel === "b") return 2;
  if (channel === "a") return 3;
  return 4;
}

const LAND_CALIBRATION_ANCHORS = [
  { lat: 51.5074, lon: -0.1278, name: "London" },
  { lat: 40.7128, lon: -74.006, name: "NYC" },
  { lat: 35.6895, lon: 139.6917, name: "Tokyo" },
  { lat: 30.0444, lon: 31.2357, name: "Cairo" },
  { lat: -33.8688, lon: 151.2093, name: "Sydney" },
] as const;

const OCEAN_CALIBRATION_ANCHORS = [
  { lat: 0, lon: -140, name: "Pacific" },
  { lat: -30, lon: -120, name: "SouthPacific" },
  { lat: 0, lon: -30, name: "MidAtlantic" },
  { lat: -55, lon: 20, name: "SouthernOcean" },
] as const;

const CALIBRATION_CANDIDATES = [
  { uFlip: false, vFlip: false, uOffset: 0 },
  { uFlip: true, vFlip: false, uOffset: 0 },
  { uFlip: false, vFlip: true, uOffset: 0 },
  { uFlip: true, vFlip: true, uOffset: 0 },
  { uFlip: false, vFlip: false, uOffset: 0.5 },
  { uFlip: true, vFlip: false, uOffset: 0.5 },
  { uFlip: false, vFlip: true, uOffset: 0.5 },
  { uFlip: true, vFlip: true, uOffset: 0.5 },
] as const;

function latLonToUv(latDeg: number, lonDeg: number, lonOffsetDeg = 0) {
  const latRad = THREE.MathUtils.degToRad(clamp(latDeg, -90, 90));
  const lonRad = THREE.MathUtils.degToRad(normalizeLon(lonDeg + lonOffsetDeg));
  return {
    u: wrap01(lonRad / (Math.PI * 2) + 0.5),
    v: clamp(0.5 - latRad / Math.PI, 0, 1),
  };
}

function applyMaskCalibrationUv(u: number, v: number, calibration: Pick<MaskCalibration, "uFlip" | "vFlip" | "uOffset">) {
  let uu = wrap01(u);
  let vv = clamp(v, 0, 1);
  if (calibration.uFlip) uu = 1 - uu;
  if (calibration.vFlip) vv = 1 - vv;
  uu = wrap01(uu + calibration.uOffset);
  return { u: uu, v: vv };
}

function createMaskSampler(image: CanvasImageSource & { width: number; height: number }, targetW: number, targetH: number) {
  if (!image.width || !image.height || targetW <= 0 || targetH <= 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, targetW, targetH);
  ctx.drawImage(image, 0, 0, targetW, targetH);
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, targetW, targetH).data;
  } catch (error) {
    console.warn("[mediacard] unable to read mask image data from canvas.", error);
    return null;
  }
  const totalPx = targetW * targetH;
  const desiredSamples = 4096;
  const sampleStepPx = Math.max(1, Math.floor(totalPx / desiredSamples));
  const sampleStepBytes = sampleStepPx * 4;
  let minA = 1;
  let maxA = 0;
  let minR = 1;
  let maxR = 0;
  let minG = 1;
  let maxG = 0;
  let minB = 1;
  let maxB = 0;
  for (let idx = 0; idx < pixels.length; idx += sampleStepBytes) {
    const red = pixels[idx] / 255;
    const green = pixels[idx + 1] / 255;
    const blue = pixels[idx + 2] / 255;
    const alpha = pixels[idx + 3] / 255;
    if (alpha < minA) minA = alpha;
    if (alpha > maxA) maxA = alpha;
    if (red < minR) minR = red;
    if (red > maxR) maxR = red;
    if (green < minG) minG = green;
    if (green > maxG) maxG = green;
    if (blue < minB) minB = blue;
    if (blue > maxB) maxB = blue;
  }
  const alphaRange = maxA - minA;
  const redRange = maxR - minR;
  const greenRange = maxG - minG;
  const blueRange = maxB - minB;
  let channel: MaskSampler["channel"] = "r";
  if (alphaRange > Math.max(redRange, greenRange, blueRange) && alphaRange >= 0.02) channel = "a";
  console.log(
    `[mediacard] mask channelAuto=${channel} ranges r=${redRange.toFixed(3)} g=${greenRange.toFixed(3)} b=${blueRange.toFixed(3)} a=${alphaRange.toFixed(3)}`
  );
  return { width: targetW, height: targetH, data: pixels, channel } satisfies MaskSampler;
}

function sampleMaskPixel(mask: MaskSampler, x: number, y: number, channel: MaskChannel) {
  const sx = Math.max(0, Math.min(mask.width - 1, x));
  const sy = Math.max(0, Math.min(mask.height - 1, y));
  const idx = (sy * mask.width + sx) * 4;
  const red = mask.data[idx] / 255;
  const green = mask.data[idx + 1] / 255;
  const blue = mask.data[idx + 2] / 255;
  const alpha = mask.data[idx + 3] / 255;
  if (channel === "r") return red;
  if (channel === "g") return green;
  if (channel === "b") return blue;
  if (channel === "a") return alpha;
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function sampleMaskRawAtUv(mask: MaskSampler, u: number, v: number, channel: MaskChannel) {
  const uu = wrap01(u);
  const vv = clamp(v, 0, 1);
  const x = Math.min(mask.width - 1, Math.max(0, Math.floor(uu * (mask.width - 1) + 0.5)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.floor(vv * (mask.height - 1) + 0.5)));
  return sampleMaskPixel(mask, x, y, channel);
}

function sampleMaskAtUv(mask: MaskSampler, u: number, v: number, calibration: MaskCalibration) {
  const uv = applyMaskCalibrationUv(u, v, calibration);
  let sample = sampleMaskRawAtUv(mask, uv.u, uv.v, calibration.channel);
  if (calibration.invert > 0.5) sample = 1 - sample;
  return sample;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function deriveAdaptiveThreshold(landSamples: number[], oceanSamples: number[]) {
  const oceanMax = oceanSamples.length ? Math.max(...oceanSamples) : 0;
  const landMedian = median(landSamples);
  return clamp((landMedian + oceanMax) * 0.5, 0.03, 0.4);
}

type CalibrationScoreResult = {
  score: number;
  threshold: number;
  landSamples: number[];
  oceanSamples: number[];
};

function scoreMaskCalibration(mask: MaskSampler, calibration: MaskCalibration, lonOffsetDeg: number, forcedThreshold: number | null): CalibrationScoreResult {
  const landSamples: number[] = [];
  const oceanSamples: number[] = [];
  for (const anchor of LAND_CALIBRATION_ANCHORS) {
    const uv = latLonToUv(anchor.lat, anchor.lon, lonOffsetDeg);
    const sample = sampleMaskAtUv(mask, uv.u, uv.v, calibration);
    landSamples.push(sample);
  }
  for (const anchor of OCEAN_CALIBRATION_ANCHORS) {
    const uv = latLonToUv(anchor.lat, anchor.lon, lonOffsetDeg);
    const sample = sampleMaskAtUv(mask, uv.u, uv.v, calibration);
    oceanSamples.push(sample);
  }
  const threshold = forcedThreshold ?? deriveAdaptiveThreshold(landSamples, oceanSamples);
  let score = 0;
  for (const sample of landSamples) score += sample > threshold ? 2 : -2;
  for (const sample of oceanSamples) score += sample <= threshold ? 2 : -2;
  return { score, threshold, landSamples, oceanSamples };
}

function calibrateMaskProjection(mask: MaskSampler, lonOffsetDeg: number, channel: MaskChannel, forcedThreshold: number | null) {
  const evaluateSet = (invert: number) => {
    let best: MaskCalibration | null = null;
    for (const candidate of CALIBRATION_CANDIDATES) {
      const calibration: MaskCalibration = {
        uFlip: candidate.uFlip,
        vFlip: candidate.vFlip,
        uOffset: candidate.uOffset,
        invert,
        channel,
        thresh: TUNE.MASK_THRESHOLD,
        score: 0,
      };
      const scored = scoreMaskCalibration(mask, calibration, lonOffsetDeg, forcedThreshold);
      calibration.score = scored.score;
      calibration.thresh = scored.threshold;
      if (!best || calibration.score > best.score) best = calibration;
    }
    return best;
  };

  let best = evaluateSet(0);
  if (!best) {
    return { uFlip: false, vFlip: false, uOffset: 0, invert: 0, channel, thresh: TUNE.MASK_THRESHOLD, score: -9999 } satisfies MaskCalibration;
  }
  if (best.score < TUNE.MASK_BAD_SCORE_THRESHOLD) {
    const invertedBest = evaluateSet(1);
    if (invertedBest && invertedBest.score > best.score) best = invertedBest;
  }
  return best;
}

function logMaskDiagnosticsDev(mask: MaskSampler, lonOffsetDeg: number, calibration: MaskCalibration) {
  if (process.env.NODE_ENV === "production") return;
  const rows = [...LAND_CALIBRATION_ANCHORS, ...OCEAN_CALIBRATION_ANCHORS].map((anchor) => {
    const uv = latLonToUv(anchor.lat, anchor.lon, lonOffsetDeg);
    const m = sampleMaskAtUv(mask, uv.u, uv.v, calibration);
    const land = m >= calibration.thresh ? 1 : 0;
    return `${anchor.name}:${m.toFixed(3)}:${land}`;
  });
  console.log(
    `[mediacard] maskDiag score=${calibration.score} invert=${calibration.invert} chan=${calibration.channel} uFlip=${Number(calibration.uFlip)} vFlip=${Number(calibration.vFlip)} uOffset=${calibration.uOffset.toFixed(1)} threshold=${calibration.thresh.toFixed(3)} ${rows.join(" | ")}`
  );
}

const HOTSPOT_CITIES = [
  { lat: 37.7749, lon: -122.4194 }, // SF
  { lat: 40.7128, lon: -74.006 }, // NYC
  { lat: 51.5074, lon: -0.1278 }, // London
  { lat: 52.52, lon: 13.405 }, // Berlin
  { lat: 37.5665, lon: 126.978 }, // Seoul
  { lat: -33.8688, lon: 151.2093 }, // Sydney
] as const;

type BinaryLandMask = {
  width: number;
  height: number;
  land: Uint8Array;
};

function sampleMaskSuperAtUv(mask: MaskSampler, u: number, v: number, calibration: MaskCalibration) {
  const du = 1 / Math.max(1, mask.width);
  const dv = 1 / Math.max(1, mask.height);
  const u0 = u - du * 0.5;
  const u1 = u + du * 0.5;
  const v0 = v - dv * 0.5;
  const v1 = v + dv * 0.5;
  return (
    sampleMaskAtUv(mask, u0, v0, calibration) +
    sampleMaskAtUv(mask, u1, v0, calibration) +
    sampleMaskAtUv(mask, u0, v1, calibration) +
    sampleMaskAtUv(mask, u1, v1, calibration)
  ) * 0.25;
}

function buildBinaryLandMask(mask: MaskSampler, calibration: MaskCalibration, shrink: number): BinaryLandMask {
  const width = mask.width;
  const height = mask.height;
  const total = width * height;
  const land = new Uint8Array(total);
  const acceptanceThreshold = clamp(calibration.thresh + shrink, 0, 0.99);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const u = (x + 0.5) / width;
      const v = (y + 0.5) / height;
      const sample = sampleMaskSuperAtUv(mask, u, v, calibration);
      land[idx] = sample > acceptanceThreshold ? 1 : 0;
    }
  }

  // Border-connected water is ocean water; enclosed water gets filled as land.
  const ocean = new Uint8Array(total);
  const queue = new Int32Array(total);
  let qHead = 0;
  let qTail = 0;
  const tryEnqueueOcean = (x: number, y: number) => {
    const idx = y * width + x;
    if (land[idx] !== 0 || ocean[idx] !== 0) return;
    ocean[idx] = 1;
    queue[qTail] = idx;
    qTail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    tryEnqueueOcean(x, 0);
    tryEnqueueOcean(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    tryEnqueueOcean(0, y);
    tryEnqueueOcean(width - 1, y);
  }

  while (qHead < qTail) {
    const idx = queue[qHead];
    qHead += 1;
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x > 0) tryEnqueueOcean(x - 1, y);
    if (x + 1 < width) tryEnqueueOcean(x + 1, y);
    if (y > 0) tryEnqueueOcean(x, y - 1);
    if (y + 1 < height) tryEnqueueOcean(x, y + 1);
  }

  for (let idx = 0; idx < total; idx += 1) {
    if (land[idx] === 0 && ocean[idx] === 0) land[idx] = 1;
  }

  if (TUNE.MASK_MIN_ISLAND_COMPONENT_PX > 0) {
    const visited = new Uint8Array(total);
    const ccQueue = new Int32Array(total);
    for (let start = 0; start < total; start += 1) {
      if (land[start] === 0 || visited[start] !== 0) continue;
      let ccHead = 0;
      let ccTail = 0;
      const component: number[] = [];
      visited[start] = 1;
      ccQueue[ccTail] = start;
      ccTail += 1;
      while (ccHead < ccTail) {
        const idx = ccQueue[ccHead];
        ccHead += 1;
        component.push(idx);
        const x = idx % width;
        const y = Math.floor(idx / width);
        if (x > 0) {
          const n = idx - 1;
          if (land[n] === 1 && visited[n] === 0) {
            visited[n] = 1;
            ccQueue[ccTail] = n;
            ccTail += 1;
          }
        }
        if (x + 1 < width) {
          const n = idx + 1;
          if (land[n] === 1 && visited[n] === 0) {
            visited[n] = 1;
            ccQueue[ccTail] = n;
            ccTail += 1;
          }
        }
        if (y > 0) {
          const n = idx - width;
          if (land[n] === 1 && visited[n] === 0) {
            visited[n] = 1;
            ccQueue[ccTail] = n;
            ccTail += 1;
          }
        }
        if (y + 1 < height) {
          const n = idx + width;
          if (land[n] === 1 && visited[n] === 0) {
            visited[n] = 1;
            ccQueue[ccTail] = n;
            ccTail += 1;
          }
        }
      }
      if (component.length < TUNE.MASK_MIN_ISLAND_COMPONENT_PX) {
        for (const idx of component) land[idx] = 0;
      }
    }
  }

  return { width, height, land };
}

function sampleBinaryLandAtUv(mask: BinaryLandMask, u: number, v: number) {
  const uu = wrap01(u);
  const vv = clamp(v, 0, 1);
  const x = Math.min(mask.width - 1, Math.max(0, Math.floor(uu * (mask.width - 1) + 0.5)));
  const y = Math.min(mask.height - 1, Math.max(0, Math.floor(vv * (mask.height - 1) + 0.5)));
  return mask.land[y * mask.width + x];
}

function createDotsFromMask(
  landMask: BinaryLandMask,
  mask: MaskSampler,
  calibration: MaskCalibration,
  lonOffsetDeg: number,
  shrink: number
): DotBuffers {
  const targetCount = TUNE.LAND_DOT_TARGET;
  if (targetCount <= 0) return createEmptyDots();
  const acceptanceThreshold = clamp(calibration.thresh + shrink, 0, 0.99);

  let landPx = 0;
  for (let i = 0; i < landMask.land.length; i += 1) {
    landPx += landMask.land[i];
  }
  const landCoverage = clamp(landPx / Math.max(1, landMask.land.length), 0.04, 0.96);
  const candidateCount = Math.min(TUNE.LAND_MAX_CANDIDATES, Math.ceil((targetCount / landCoverage) * 1.08));

  const positions = new Float32Array(targetCount * 3);
  const hot = new Float32Array(targetCount);
  const phases = new Float32Array(targetCount);
  const marketId = new Float32Array(targetCount);
  const marketW = new Float32Array(targetCount);

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const sigmaRad = THREE.MathUtils.degToRad(TUNE.HOTSPOT_SIGMA_DEG);
  const sigma2 = Math.max(0.000001, sigmaRad * sigmaRad);
  const lonOffsetU = lonOffsetDeg / 360;
  const hotspotCenters = HOTSPOT_CITIES.map((city) => latLonToUnit(city.lat, city.lon, lonOffsetDeg));
  const marketCenters = MARKETS.map((market) => ({
    id: market.id,
    center: latLonToUnit(market.latDeg, market.lonDeg, lonOffsetDeg),
    hitCos: Math.cos(THREE.MathUtils.degToRad(market.hitRadiusDeg)),
  }));

  let accepted = 0;
  for (let i = 0; i < candidateCount && accepted < targetCount; i += 1) {
    const t = i + 0.5;
    const y = 1 - (2 * t) / candidateCount;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * goldenAngle;
    const x = Math.cos(theta) * radial;
    const z = Math.sin(theta) * radial;

    const lon = Math.atan2(x, z);
    const lat = Math.asin(clamp(y, -1, 1));
    const u = wrap01(lon / (Math.PI * 2) + 0.5 + lonOffsetU);
    const v = clamp(0.5 - lat / Math.PI, 0, 1);
    if (sampleBinaryLandAtUv(landMask, u, v) === 0) continue;
    const lum = sampleMaskSuperAtUv(mask, u, v, calibration);
    if (lum <= acceptanceThreshold) continue;

    let rawHot = 0;
    for (const center of hotspotCenters) {
      const dot = clamp(x * center.x + y * center.y + z * center.z, -1, 1);
      const angle = Math.acos(dot);
      const gaussian = Math.exp(-(angle * angle) / (2 * sigma2));
      if (gaussian > rawHot) rawHot = gaussian;
    }
    const hotPeak = smoothstep(TUNE.HOTSPOT_EDGE0, TUNE.HOTSPOT_EDGE1, rawHot);
    let bestMarketId = MARKET_NONE_ID;
    let bestMarketW = 0;
    for (const region of marketCenters) {
      const mDot = clamp(x * region.center.x + y * region.center.y + z * region.center.z, -1, 1);
      const weight = smoothstep(region.hitCos, 1, mDot);
      if (weight > bestMarketW) {
        bestMarketW = weight;
        bestMarketId = region.id;
      }
    }

    positions[accepted * 3] = x * GLOBE_RADIUS;
    positions[accepted * 3 + 1] = y * GLOBE_RADIUS;
    positions[accepted * 3 + 2] = z * GLOBE_RADIUS;
    hot[accepted] = hotPeak;
    phases[accepted] = hash2(i, accepted, 9.17);
    marketId[accepted] = bestMarketId;
    marketW[accepted] = bestMarketW;
    accepted += 1;
  }

  return {
    positions: positions.slice(0, accepted * 3),
    hot: hot.slice(0, accepted),
    phases: phases.slice(0, accepted),
    marketId: marketId.slice(0, accepted),
    marketW: marketW.slice(0, accepted),
  };
}

function capDotBuffers(dots: DotBuffers, maxPoints: number): DotBuffers {
  const count = Math.floor(dots.positions.length / 3);
  if (count <= maxPoints) return dots;
  const stride = Math.max(1, Math.ceil(count / Math.max(1, maxPoints)));
  const cappedCount = Math.ceil(count / stride);
  const positions = new Float32Array(cappedCount * 3);
  const hot = new Float32Array(cappedCount);
  const phases = new Float32Array(cappedCount);
  const marketId = new Float32Array(cappedCount);
  const marketW = new Float32Array(cappedCount);
  let dst = 0;
  for (let src = 0; src < count && dst < cappedCount; src += stride) {
    positions[dst * 3] = dots.positions[src * 3];
    positions[dst * 3 + 1] = dots.positions[src * 3 + 1];
    positions[dst * 3 + 2] = dots.positions[src * 3 + 2];
    hot[dst] = dots.hot[src];
    phases[dst] = dots.phases[src];
    marketId[dst] = dots.marketId[src];
    marketW[dst] = dots.marketW[src];
    dst += 1;
  }
  return {
    positions: positions.slice(0, dst * 3),
    hot: hot.slice(0, dst),
    phases: phases.slice(0, dst),
    marketId: marketId.slice(0, dst),
    marketW: marketW.slice(0, dst),
  };
}

function createMaskPreviewTexture(mask: MaskSampler) {
  const pixels = new Uint8Array(mask.data);
  const texture = new THREE.DataTexture(pixels, mask.width, mask.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function createDebugAnchorMarkers(lonOffsetDeg: number) {
  const anchors = [
    ...LAND_CALIBRATION_ANCHORS.map((anchor) => ({ ...anchor, isLand: true })),
    ...OCEAN_CALIBRATION_ANCHORS.map((anchor) => ({ ...anchor, isLand: false })),
  ];
  const positions = new Float32Array(anchors.length * 3);
  const colors = new Float32Array(anchors.length * 3);
  anchors.forEach((anchor, index) => {
    const unit = latLonToUnit(anchor.lat, anchor.lon, lonOffsetDeg);
    positions[index * 3] = unit.x * (GLOBE_RADIUS * 1.03);
    positions[index * 3 + 1] = unit.y * (GLOBE_RADIUS * 1.03);
    positions[index * 3 + 2] = unit.z * (GLOBE_RADIUS * 1.03);
    colors[index * 3] = 0.6;
    colors[index * 3 + 1] = 0.6;
    colors[index * 3 + 2] = 0.6;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.04,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry, material);
}

function updateDebugAnchorMarkerColors(markers: THREE.Points, mask: MaskSampler, calibration: MaskCalibration, lonOffsetDeg: number) {
  const anchors = [
    ...LAND_CALIBRATION_ANCHORS.map((anchor) => ({ ...anchor, isLand: true })),
    ...OCEAN_CALIBRATION_ANCHORS.map((anchor) => ({ ...anchor, isLand: false })),
  ];
  const colorAttr = markers.geometry.getAttribute("color");
  if (!(colorAttr instanceof THREE.BufferAttribute)) return;
  anchors.forEach((anchor, index) => {
    const uv = latLonToUv(anchor.lat, anchor.lon, lonOffsetDeg);
    const sample = sampleMaskAtUv(mask, uv.u, uv.v, calibration);
    const passes = anchor.isLand ? sample > calibration.thresh : sample <= calibration.thresh;
    colorAttr.setXYZ(index, passes ? 0.12 : 0.96, passes ? 0.96 : 0.18, passes ? 0.22 : 0.2);
  });
  colorAttr.needsUpdate = true;
}

function createStarfield(count: number, radiusMin: number, radiusMax: number) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    const sinPhi = Math.sin(phi);
    const x = radius * sinPhi * Math.cos(theta);
    const y = radius * Math.cos(phi);
    const z = radius * sinPhi * Math.sin(theta);
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    const twinkle = 0.55 + Math.random() * 0.45;
    colors[i * 3] = 0.72 * twinkle;
    colors[i * 3 + 1] = 0.8 * twinkle;
    colors[i * 3 + 2] = twinkle;
  }
  return { positions, colors };
}

function createMarketBeaconTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = size * 0.5;
  const cy = size * 0.5;
  ctx.clearRect(0, 0, size, size);
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
  glow.addColorStop(0, "rgba(214, 232, 255, 0.68)");
  glow.addColorStop(0.22, "rgba(178, 146, 255, 0.36)");
  glow.addColorStop(0.5, "rgba(124, 58, 237, 0.14)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(244, 248, 255, 0.98)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(198, 221, 255, 0.82)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.155, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

export const GlobeRenderer = forwardRef<GlobeRendererHandle, GlobeRendererProps>(function GlobeRenderer(
  { className, onFocusSettled, onRestSettled, onSelectRegion, onHoverRegion, interactionLocked = false, hoverMarketId = 0, activeMarketId = 0 },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef(false);
  const aliveRef = useRef(false);
  const focusToLatLonRef = useRef<(target: FocusRequest) => void>(() => {});
  const resetFocusRef = useRef<() => void>(() => {});
  const onFocusSettledRef = useRef(onFocusSettled);
  const onRestSettledRef = useRef(onRestSettled);
  const onSelectRegionRef = useRef(onSelectRegion);
  const onHoverRegionRef = useRef(onHoverRegion);
  const interactionLockedRef = useRef(interactionLocked);
  const hoverMarketIdRef = useRef(hoverMarketId);
  const activeMarketIdRef = useRef(activeMarketId);
  const cursorHoverMarketIdRef = useRef(MARKET_NONE_ID);
  const cageGroupRef = useRef<THREE.Group | null>(null);
  const dotsGroupRef = useRef<THREE.Group | null>(null);
  const marketOverlayGroupRef = useRef<THREE.Group | null>(null);
  const marketBeaconGroupRef = useRef<THREE.Group | null>(null);

  useEffect(() => void (onFocusSettledRef.current = onFocusSettled), [onFocusSettled]);
  useEffect(() => void (onRestSettledRef.current = onRestSettled), [onRestSettled]);
  useEffect(() => void (onSelectRegionRef.current = onSelectRegion), [onSelectRegion]);
  useEffect(() => void (onHoverRegionRef.current = onHoverRegion), [onHoverRegion]);
  useEffect(() => void (interactionLockedRef.current = interactionLocked), [interactionLocked]);
  useEffect(() => void (hoverMarketIdRef.current = hoverMarketId), [hoverMarketId]);
  useEffect(() => void (activeMarketIdRef.current = activeMarketId), [activeMarketId]);

  useImperativeHandle(ref, () => ({
    focusToLatLon: (target) => focusToLatLonRef.current(target),
    resetFocus: () => resetFocusRef.current(),
  }));

  useEffect(() => {
    const host = hostRef.current;
    if (!host || initializedRef.current) return;
    initializedRef.current = true;
    aliveRef.current = true;
    console.info("[MediaCard Globe]", MEDIACARD_BUILD_TAG);
    console.log("[mediacard] BUILD", MEDIACARD_BUILD_TAG);
    console.log("[mediacard] marketPatchKILL active");
    let maskImg: HTMLImageElement | null = null;
    let debugMaskTexture: THREE.Texture | null = null;
    let maskCalibration: MaskCalibration = {
      uFlip: false,
      vFlip: false,
      uOffset: 0,
      invert: 0,
      channel: "r",
      thresh: TUNE.MASK_THRESHOLD,
      score: 0,
    };
    let pointCount = 0;
    let lastMaskStatus = "boot";
    let lastGoodDots: DotBuffers | null = null;
    let maskRetryAttempts = 0;
    let retryTimer: number | null = null;
    const syncDebugGlobal = () => {
      const debugGlobal = globalThis as typeof globalThis & {
        __mediacard?: {
          buildTag: string;
          maskCalibration: MaskCalibration;
          pointCount: number;
          lastMaskStatus: string;
        };
      };
      debugGlobal.__mediacard = {
        buildTag: MEDIACARD_BUILD_TAG,
        maskCalibration: { ...maskCalibration },
        pointCount,
        lastMaskStatus,
      };
    };
    const cloneDotBuffers = (dots: DotBuffers): DotBuffers => ({
      positions: dots.positions.slice(),
      hot: dots.hot.slice(),
      phases: dots.phases.slice(),
      marketId: dots.marketId.slice(),
      marketW: dots.marketW.slice(),
    });
    const marketRuntime = MARKETS.map((market) => ({
      ...market,
      center: latLonToUnit(market.latDeg, market.lonDeg, MEDIACARD_TUNING.LON_OFFSET_DEG),
      hitCos: Math.cos(THREE.MathUtils.degToRad(market.hitRadiusDeg)),
    }));
    const marketStrengths = new THREE.Vector4(0, 0, 0, 0);
    const setMarketStrength = (marketId: number, value: number) => {
      if (marketId === MARKET_ID.us) marketStrengths.x = Math.max(marketStrengths.x, value);
      else if (marketId === MARKET_ID.ca) marketStrengths.y = Math.max(marketStrengths.y, value);
      else if (marketId === MARKET_ID.au) marketStrengths.z = Math.max(marketStrengths.z, value);
      else if (marketId === MARKET_ID.kr) marketStrengths.w = Math.max(marketStrengths.w, value);
    };
    let activeFlashMarket = MARKET_NONE_ID;
    let activeFlashUntilMs = 0;
    let lastActiveMarketSeen = activeMarketIdRef.current;
    const computeMarketStrengths = (timeSec: number) => {
      const nowMs = timeSec * 1000;
      if (activeMarketIdRef.current !== lastActiveMarketSeen) {
        if (activeMarketIdRef.current > 0) {
          activeFlashMarket = activeMarketIdRef.current;
          activeFlashUntilMs = nowMs + 800;
        }
        lastActiveMarketSeen = activeMarketIdRef.current;
      }
      marketStrengths.set(0, 0, 0, 0);
      // Always keep a subtle market read at rest.
      for (const market of MARKETS) setMarketStrength(market.id, MARKET_EMPHASIS.IDLE_TINT);
      if (hoverMarketIdRef.current > 0) setMarketStrength(hoverMarketIdRef.current, MARKET_EMPHASIS.HOVER_BOOST);
      if (activeFlashMarket > 0 && nowMs < activeFlashUntilMs) {
        const flash = 0.08 * (0.5 + 0.5 * Math.sin(timeSec * 5.2));
        setMarketStrength(activeFlashMarket, MARKET_EMPHASIS.ACTIVE_BOOST + flash);
      }
      marketStrengths.x = clamp(marketStrengths.x, 0, 1);
      marketStrengths.y = clamp(marketStrengths.y, 0, 1);
      marketStrengths.z = clamp(marketStrengths.z, 0, 1);
      marketStrengths.w = clamp(marketStrengths.w, 0, 1);
      return marketStrengths;
    };
    const strengthForMarket = (id: number, strengths: THREE.Vector4) => {
      if (id === MARKET_ID.us) return strengths.x;
      if (id === MARKET_ID.ca) return strengths.y;
      if (id === MARKET_ID.au) return strengths.z;
      if (id === MARKET_ID.kr) return strengths.w;
      return 0;
    };
    syncDebugGlobal();

    const targets = (Object.keys(TARGETS) as PanelTargetKey[]).map((key) => {
      const cfg = TARGETS[key];
      const unit = latLonToUnit(cfg.lat, cfg.lon, MEDIACARD_TUNING.LON_OFFSET_DEG);
      return { key, cfg, unit, quat: quatToFront(unit), dist: zoomToDistance(cfg.zoom) };
    });
    let restQuat = targets.find((x) => x.key === "audience")?.quat.clone() ?? quatToFront(latLonToUnit(39.5, -98.35));
    if (Number.isFinite(MEDIACARD_TUNING.INIT_AZIMUTH) && Number.isFinite(MEDIACARD_TUNING.INIT_POLAR)) {
      const initUnit = azimuthPolarToUnit(MEDIACARD_TUNING.INIT_AZIMUTH as number, MEDIACARD_TUNING.INIT_POLAR as number);
      restQuat = quatToFront(initUnit);
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 30);
    let cameraDistance = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
    let cameraDistanceTarget = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
    camera.position.set(0, 0, cameraDistance);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.touchAction = "none";
    host.appendChild(renderer.domElement);

    const starsData = createStarfield(TUNE.STAR_COUNT, TUNE.STAR_RADIUS_MIN, TUNE.STAR_RADIUS_MAX);
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute("position", new THREE.BufferAttribute(starsData.positions, 3));
    starsGeometry.setAttribute("color", new THREE.BufferAttribute(starsData.colors, 3));
    const starsMaterial = new THREE.PointsMaterial({
      size: 0.03,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    stars.renderOrder = -10;
    scene.add(stars);

    const globeGroup = new THREE.Group();
    globeGroup.quaternion.copy(restQuat);
    scene.add(globeGroup);

    const disposeCageGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.parent?.remove(group);
      group.traverse((obj) => {
        if (!(obj instanceof THREE.LineSegments)) return;
        if (obj.geometry instanceof THREE.BufferGeometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          for (const material of obj.material) material.dispose();
        } else obj.material.dispose();
      });
    };

    const occluder = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS * 0.985, 48, 48),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, depthTest: true })
    );
    occluder.renderOrder = -1;
    globeGroup.add(occluder);

    const cageVertexShader = `
      precision highp float;
      uniform float uFresnelPower;
      varying float vFresnel;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(worldPos.xyz);
        vec3 v = normalize(cameraPosition - worldPos.xyz);
        vFresnel = pow(clamp(1.0 - abs(dot(n, v)), 0.0, 1.0), uFresnelPower);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `;
    const cageFragmentShader = `
      precision highp float;
      uniform vec3 uColor;
      uniform float uBaseOpacity;
      uniform float uBias;
      uniform float uGain;
      varying float vFresnel;
      void main() {
        float alpha = uBaseOpacity * (uBias + uGain * clamp(vFresnel, 0.0, 1.0));
        gl_FragColor = vec4(uColor, alpha);
      }
    `;
    const cageColor = new THREE.Color(TUNE.CAGE_COLOR);
    const makeCageMaterial = (
      baseOpacity: number,
      fresnelPower: number,
      bias: number,
      gain: number,
      depthTest: boolean,
      blending: THREE.Blending,
      cacheKey: string
    ) => {
      const shader = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest,
        blending,
        toneMapped: false,
        uniforms: {
          uColor: { value: cageColor.clone() },
          uBaseOpacity: { value: baseOpacity },
          uFresnelPower: { value: fresnelPower },
          uBias: { value: bias },
          uGain: { value: gain },
        },
        vertexShader: cageVertexShader,
        fragmentShader: cageFragmentShader,
      });
      shader.customProgramCacheKey = () => cacheKey;
      shader.needsUpdate = true;
      return shader;
    };
    const cageMaterial = makeCageMaterial(TUNE.CAGE_OPACITY_INNER, 2.0, 0.12, 0.88, false, THREE.AdditiveBlending, `cage_inner_${MEDIACARD_BUILD_TAG}`);
    const cageOuterMaterial = makeCageMaterial(TUNE.CAGE_OPACITY_OUTER, 2.0, 0.12, 0.88, false, THREE.AdditiveBlending, `cage_outer_${MEDIACARD_BUILD_TAG}`);
    disposeCageGroup(cageGroupRef.current);
    cageGroupRef.current = null;
    const cageInnerGeometry = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(GLOBE_RADIUS, 2));
    const cageOuterGeometry = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(GLOBE_RADIUS, 2));
    const cage = new THREE.LineSegments(cageInnerGeometry, cageMaterial);
    const cageOuter = new THREE.LineSegments(cageOuterGeometry, cageOuterMaterial);
    cage.scale.setScalar(TUNE.CAGE_SCALE_INNER);
    cageOuter.scale.setScalar(TUNE.CAGE_SCALE_OUTER);
    cageOuter.renderOrder = 50.0;
    cage.renderOrder = 50.1;
    cage.frustumCulled = false;
    cageOuter.frustumCulled = false;
    const cageGroup = new THREE.Group();
    cageGroup.name = "mediacard-cage-group";
    cageGroup.add(cageOuter, cage);
    globeGroup.add(cageGroup);
    cageGroupRef.current = cageGroup;

    const atmosphereMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        uAlpha: { value: TUNE.ATMOS_ALPHA },
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize((modelMatrix * vec4(normalize(position), 0.0)).xyz);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDirW)), 0.0), 4.0);
          vec3 col = mix(vec3(0.01, 0.02, 0.04), vec3(0.04, 0.06, 0.10), clamp(vNormalW.y * 0.5 + 0.5, 0.0, 1.0));
          gl_FragColor = vec4(col, rim * uAlpha);
        }
      `,
    });
    atmosphereMaterial.customProgramCacheKey = () => `atmosphere_${MEDIACARD_BUILD_TAG}`;
    atmosphereMaterial.needsUpdate = true;
    const atmosphereRimMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAlpha: { value: TUNE.ATMOS_RIM_ALPHA },
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize((modelMatrix * vec4(normalize(position), 0.0)).xyz);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDirW))), 3.0);
          vec3 cool = mix(vec3(0.10, 0.18, 0.35), vec3(0.45, 0.30, 0.70), clamp(rim, 0.0, 1.0));
          gl_FragColor = vec4(cool, rim * uAlpha);
        }
      `,
    });
    atmosphereRimMaterial.customProgramCacheKey = () => `atmosphere_rim_${MEDIACARD_BUILD_TAG}`;
    atmosphereRimMaterial.needsUpdate = true;
    const atmosphereGlassMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uAlpha: { value: TUNE.ATMOS_GLASS_ALPHA },
      },
      vertexShader: `
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize((modelMatrix * vec4(normalize(position), 0.0)).xyz);
          vViewDirW = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uAlpha;
        varying vec3 vNormalW;
        varying vec3 vViewDirW;
        void main() {
          float glint = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDirW))), 6.0);
          gl_FragColor = vec4(vec3(0.85, 0.90, 1.0), glint * uAlpha);
        }
      `,
    });
    atmosphereGlassMaterial.customProgramCacheKey = () => `atmosphere_glass_${MEDIACARD_BUILD_TAG}`;
    atmosphereGlassMaterial.needsUpdate = true;
    const atmosphereGlass = new THREE.Mesh(new THREE.SphereGeometry(TUNE.ATMOS_GLASS_RADIUS, 52, 52), atmosphereGlassMaterial);
    atmosphereGlass.renderOrder = 2.6;
    const atmosphereRim = new THREE.Mesh(new THREE.SphereGeometry(TUNE.ATMOS_RIM_RADIUS, 52, 52), atmosphereRimMaterial);
    atmosphereRim.renderOrder = 2.7;
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(TUNE.ATMOS_RADIUS, 42, 42), atmosphereMaterial);
    atmosphere.renderOrder = 2.8;
    globeGroup.add(atmosphereGlass, atmosphereRim, atmosphere);

    const disposeMarketBeaconGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.parent?.remove(group);
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Sprite)) return;
        if (obj.material instanceof THREE.SpriteMaterial) obj.material.dispose();
      });
      const tex = group.userData.sharedTexture;
      if (tex instanceof THREE.Texture) tex.dispose();
    };
    disposeMarketBeaconGroup(marketBeaconGroupRef.current);
    marketBeaconGroupRef.current = null;
    const beaconTexture = createMarketBeaconTexture();
    const beaconGroup = new THREE.Group();
    beaconGroup.name = "mediacard-market-beacons";
    const beaconSprites: THREE.Sprite[] = [];
    for (const market of marketRuntime) {
      const material = new THREE.SpriteMaterial({
        map: beaconTexture ?? null,
        color: new THREE.Color("#D2DDFF"),
        transparent: true,
        opacity: 0.18,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(market.center.clone().multiplyScalar(GLOBE_RADIUS * 1.013));
      sprite.renderOrder = 3.6;
      sprite.userData.marketId = market.id;
      sprite.userData.panelKey = market.panelKey;
      sprite.userData.label = market.label;
      beaconGroup.add(sprite);
      beaconSprites.push(sprite);
    }
    beaconGroup.userData.sharedTexture = beaconTexture;
    globeGroup.add(beaconGroup);
    marketBeaconGroupRef.current = beaconGroup;

    const geo = new THREE.BufferGeometry();
    const marketOverlayGeo = new THREE.BufferGeometry();
    const applyDotBuffers = (dots: DotBuffers) => {
      geo.setAttribute("position", new THREE.Float32BufferAttribute(dots.positions, 3));
      geo.setAttribute("aHot", new THREE.Float32BufferAttribute(dots.hot, 1));
      geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(dots.phases, 1));
      geo.computeBoundingSphere();
    };
    const applyMarketOverlayBuffers = (dots: DotBuffers) => {
      const count = dots.marketId.length;
      let overlayCount = 0;
      for (let i = 0; i < count; i += 1) {
        if (dots.marketId[i] > 0.5 && dots.marketW[i] > 0.001) overlayCount += 1;
      }
      const positions = new Float32Array(overlayCount * 3);
      const phases = new Float32Array(overlayCount);
      const marketId = new Float32Array(overlayCount);
      const marketW = new Float32Array(overlayCount);
      let dst = 0;
      for (let src = 0; src < count; src += 1) {
        const id = dots.marketId[src];
        const weight = dots.marketW[src];
        if (id <= 0.5 || weight <= 0.001) continue;
        const src3 = src * 3;
        const dst3 = dst * 3;
        positions[dst3] = dots.positions[src3];
        positions[dst3 + 1] = dots.positions[src3 + 1];
        positions[dst3 + 2] = dots.positions[src3 + 2];
        phases[dst] = dots.phases[src];
        marketId[dst] = id;
        marketW[dst] = weight;
        dst += 1;
      }
      marketOverlayGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      marketOverlayGeo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
      marketOverlayGeo.setAttribute("aMarketId", new THREE.Float32BufferAttribute(marketId, 1));
      marketOverlayGeo.setAttribute("aMarketW", new THREE.Float32BufferAttribute(marketW, 1));
      marketOverlayGeo.computeBoundingSphere();
      console.log("[mediacard] overlayDots", overlayCount);
    };
    const applyAllDotBuffers = (dots: DotBuffers) => {
      applyDotBuffers(dots);
      applyMarketOverlayBuffers(dots);
    };
    applyAllDotBuffers(createEmptyDots());
    pointCount = 0;
    syncDebugGlobal();

    const dpr = renderer.getPixelRatio();
    const uniforms = {
      uPointPx: { value: TUNE.POINT_PX },
      uDpr: { value: dpr },
      uBeadNear: { value: MEDIACARD_TUNING.DOT_BEAD_NEAR },
      uBeadFar: { value: MEDIACARD_TUNING.DOT_BEAD_FAR },
      uBeadBoost: { value: MEDIACARD_TUNING.DOT_BEAD_BOOST },
      uKeyDirWorld: { value: new THREE.Vector3(0.55, 0.18, 1.0).normalize() },
      uCineStrength: { value: 1.0 },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uBase: { value: new THREE.Color(MEDIACARD_TUNING.DOT_COLOR_BASE) },
      uViolet: { value: new THREE.Color(MEDIACARD_TUNING.DOT_COLOR_SECONDARY) },
    };
    const glowUniforms = {
      uPointPx: { value: TUNE.POINT_PX * 1.35 },
      uDpr: { value: dpr },
      uBeadNear: { value: MEDIACARD_TUNING.DOT_BEAD_NEAR },
      uBeadFar: { value: MEDIACARD_TUNING.DOT_BEAD_FAR },
      uBeadBoost: { value: 1.0 },
      uKeyDirWorld: { value: new THREE.Vector3(0.55, 0.18, 1.0).normalize() },
      uCineStrength: { value: 1.0 },
      uTime: { value: 0 },
      uReveal: { value: 0 },
      uBase: { value: new THREE.Color(MEDIACARD_TUNING.DOT_COLOR_BASE) },
      uViolet: { value: new THREE.Color(MEDIACARD_TUNING.DOT_COLOR_SECONDARY) },
    };
    const marketOverlayUniforms = {
      uPointPx: { value: TUNE.POINT_PX },
      uDpr: { value: dpr },
      uReveal: { value: 0 },
      uHoverMarket: { value: hoverMarketIdRef.current },
      uActiveMarket: { value: activeMarketIdRef.current },
    };

    const vertexShader = `
      precision highp float;
      attribute float aHot;
      attribute float aPhase;
      uniform float uPointPx;
      uniform float uDpr;
      uniform float uBeadNear;
      uniform float uBeadFar;
      uniform float uBeadBoost;
      varying float vHot;
      varying float vPhase;
      varying float vFacing;
      varying float vReveal;
      varying vec3 vWorldN;
      varying vec3 vWorldPos;
      varying float vVar;
      void main() {
        vHot = aHot;
        vPhase = aPhase;
        vec3 unit = normalize(position);
        vReveal = clamp(0.5 - asin(clamp(unit.y, -1.0, 1.0)) / 3.14159265359, 0.0, 1.0);
        vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 worldNormal = normalize((modelMatrix * vec4(unit, 0.0)).xyz);
        vec3 viewDir = normalize(cameraPosition - worldPos);
        vFacing = dot(worldNormal, viewDir);
        vWorldN = normalize(worldPos);
        vWorldPos = worldPos;
        vVar = fract(sin(dot(worldPos.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float hotBoost = 1.0 + vHot * 0.14;
        float size = uPointPx * hotBoost;
        gl_PointSize = clamp(size, ${MEDIACARD_TUNING.DOT_MIN_SIZE_DPR.toFixed(1)} * uDpr, ${MEDIACARD_TUNING.DOT_MAX_SIZE_DPR.toFixed(1)} * uDpr);
        float d = length(mv.xyz);
        float t = smoothstep(uBeadFar, uBeadNear, d);
        gl_PointSize *= mix(1.0, uBeadBoost, t);
      }
    `;
    const fragmentShader = `
      precision highp float;
      varying float vHot;
      varying float vPhase;
      varying float vFacing;
      varying float vReveal;
      varying vec3 vWorldN;
      varying vec3 vWorldPos;
      varying float vVar;
      uniform float uTime;
      uniform float uReveal;
      uniform vec3 uBase;
      uniform vec3 uViolet;
      uniform vec3 uKeyDirWorld;
      uniform float uCineStrength;
      void main() {
        if (vReveal > uReveal) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;

        float z = sqrt(max(0.0, 1.0 - r2));
        vec3 n = normalize(vec3(p, z));
        vec3 L = normalize(vec3(-0.35, 0.55, 1.0));
        vec3 V = vec3(0.0, 0.0, 1.0);

        float diff = clamp(dot(n, L), 0.0, 1.0);
        vec3 beadH = normalize(L + V);
        float spec = pow(clamp(dot(n, beadH), 0.0, 1.0), 80.0);
        float rim = pow(1.0 - n.z, 2.2);

        float hotRaw = vHot;
        float hotPeaks = smoothstep(0.78, 0.96, hotRaw);
        hotPeaks = pow(hotPeaks, 1.6);
        float hotMix = clamp(hotPeaks, 0.0, 1.0);
        float var = mix(0.985, 1.015, vVar);
        spec *= var;
        float pulse = 0.92 + 0.08 * sin(uTime * 0.55 + vPhase * 6.2831);
        spec *= mix(1.0, pulse, hotMix);

        vec3 amber = uBase * vec3(0.90, 0.76, 0.50);
        vec3 albedo = amber;
        vec3 color = albedo * (0.62 + 0.55 * diff)
                   + vec3(1.0) * (0.28 * spec)
                   + albedo * (0.10 * rim);
        vec3 worldN = normalize(vWorldN);
        vec3 keyDir = normalize(uKeyDirWorld);
        float cineStrength = clamp(uCineStrength, 0.0, 2.0);
        float ndk = dot(worldN, keyDir);
        float day = smoothstep(-0.05, 0.35, ndk);
        float cine = mix(0.92, 1.06, day);
        vec3 warm = vec3(1.02, 1.00, 0.97);
        vec3 cool = vec3(0.96, 0.99, 1.04);
        vec3 grade = mix(cool, warm, day);
        color *= mix(vec3(1.0), grade * cine, cineStrength * 0.45);
        vec3 Vw = normalize(cameraPosition - vWorldPos);
        vec3 cineH = normalize(keyDir + Vw);
        float cineSpec = pow(max(dot(worldN, cineH), 0.0), 80.0);
        color += vec3(1.0) * (cineSpec * 0.12 * day);
        vec3 hotspotHue = mix(uViolet * vec3(0.84, 0.66, 1.02), vec3(0.55, 0.32, 0.92), 0.82);
        vec3 hotspotTint = mix(vec3(1.0), hotspotHue, 0.52);
        color = mix(color, color * hotspotTint, hotMix);
        float r = sqrt(r2);
        float coreMask = 1.0 - smoothstep(0.0, 0.24, r);
        float haloMask = (1.0 - smoothstep(0.28, 0.55, r)) * 0.18;
        color *= (1.0 + coreMask * 0.18);
        float core = 1.0 - smoothstep(0.0, 1.0, r);
        core = pow(core, 1.65);
        float haloStart = 0.72;
        float halo = 1.0 - smoothstep(0.0, 1.0, (r - haloStart) / 0.28);
        halo = pow(halo, 2.2);
        float alpha = core * 0.95 + halo * 0.12;
        alpha *= 1.0 + haloMask * 0.06;
        float existingOverallAlpha = smoothstep(-0.28, 0.10, vFacing);
        float outA = min(1.0, alpha * existingOverallAlpha * 1.12);
        gl_FragColor = vec4(color * outA, outA);
      }
    `;
    const glowFragmentShader = `
      precision highp float;
      varying float vHot;
      varying float vPhase;
      varying float vFacing;
      varying float vReveal;
      varying vec3 vWorldN;
      varying vec3 vWorldPos;
      varying float vVar;
      uniform float uReveal;
      uniform float uTime;
      uniform vec3 uBase;
      uniform vec3 uViolet;
      uniform vec3 uKeyDirWorld;
      uniform float uCineStrength;
      void main() {
        if (vReveal > uReveal) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.15) discard;

        float front = smoothstep(-0.26, 0.08, vFacing);
        float body = 1.0 - smoothstep(0.10, 0.85, r);
        float edge = 1.0 - smoothstep(0.42, 1.08, r);
        edge = pow(edge, 1.6);

        float hotRaw = vHot;
        float hotPeaks = smoothstep(0.78, 0.96, hotRaw);
        hotPeaks = pow(hotPeaks, 1.6);
        float hotMix = clamp(hotPeaks, 0.0, 1.0);

        vec3 worldN = normalize(vWorldN);
        vec3 keyDir = normalize(uKeyDirWorld);
        float day = smoothstep(-0.05, 0.35, dot(worldN, keyDir));
        float cine = mix(0.94, 1.04, day);
        vec3 warm = vec3(1.02, 1.00, 0.97);
        vec3 cool = vec3(0.96, 0.99, 1.04);
        vec3 grade = mix(cool, warm, day);

        vec3 haloCol = mix(uBase * vec3(0.70, 0.56, 0.34), uViolet * vec3(0.72, 0.60, 0.90), hotMix * 0.5);
        haloCol *= mix(vec3(1.0), grade * cine, clamp(uCineStrength, 0.0, 2.0) * 0.45);
        float alpha = (0.032 * body + 0.078 * edge) * front;
        gl_FragColor = vec4(haloCol, alpha);
      }
    `;
    const marketOverlayVertexShader = `
      precision highp float;
      attribute float aPhase;
      attribute float aMarketId;
      attribute float aMarketW;
      uniform float uPointPx;
      uniform float uDpr;
      uniform float uHoverMarket;
      uniform float uActiveMarket;
      varying float vMarketId;
      varying float vMarketW;
      varying float vReveal;
      void main() {
        vec3 unit = normalize(position);
        vMarketId = aMarketId;
        vMarketW = aMarketW;
        vReveal = clamp(0.5 - asin(clamp(unit.y, -1.0, 1.0)) / 3.14159265359, 0.0, 1.0);
        float isHover = step(0.5, 1.0 - abs(aMarketId - uHoverMarket));
        float isActive = step(0.5, 1.0 - abs(aMarketId - uActiveMarket));
        float w = clamp(aMarketW * (isHover + isActive), 0.0, 1.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(uPointPx, ${MEDIACARD_TUNING.DOT_MIN_SIZE_DPR.toFixed(1)} * uDpr, ${(MEDIACARD_TUNING.DOT_MAX_SIZE_DPR * 1.25).toFixed(1)} * uDpr);
        gl_PointSize *= (1.0 + 0.10 * w);
      }
    `;
    const marketOverlayFragmentShader = `
      precision highp float;
      varying float vMarketId;
      varying float vMarketW;
      varying float vReveal;
      uniform float uReveal;
      uniform float uHoverMarket;
      uniform float uActiveMarket;
      void main() {
        if (vReveal > uReveal) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        float r = sqrt(r2);
        float isHover = step(0.5, 1.0 - abs(vMarketId - uHoverMarket));
        float isActive = step(0.5, 1.0 - abs(vMarketId - uActiveMarket));
        float w = clamp(vMarketW * (isHover + isActive), 0.0, 1.0);
        vec3 accent = vec3(0.90, 0.84, 1.00);
        float disc = 1.0 - smoothstep(0.86, 1.0, r);
        float a = 0.70 * w;
        float outA = a * disc;
        gl_FragColor = vec4(accent * outA, outA);
      }
    `;

    const debugMaskUniforms = {
      uMask: { value: null as THREE.Texture | null },
      uOpacity: { value: TUNE.DEBUG_MASK_ALPHA },
      uLonOffset: { value: MEDIACARD_TUNING.LON_OFFSET_DEG / 360 },
      uFlipU: { value: 0 },
      uFlipV: { value: 0 },
      uOffset: { value: 0 },
      uInvert: { value: 0 },
      uThreshold: { value: TUNE.MASK_THRESHOLD },
      uChannel: { value: 0 },
    };
    const debugMaskMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: debugMaskUniforms,
      vertexShader: `
        varying vec3 vUnit;
        void main() {
          vUnit = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vUnit;
        uniform sampler2D uMask;
        uniform float uOpacity;
        uniform float uLonOffset;
        uniform float uFlipU;
        uniform float uFlipV;
        uniform float uOffset;
        uniform float uInvert;
        uniform float uThreshold;
        uniform float uChannel;
        void main() {
          float lon = atan(vUnit.x, vUnit.z);
          float lat = asin(clamp(vUnit.y, -1.0, 1.0));
          vec2 uv = vec2(fract(lon / 6.28318530718 + 0.5 + uLonOffset), clamp(0.5 - lat / 3.14159265359, 0.0, 1.0));
          if (uFlipU > 0.5) uv.x = 1.0 - uv.x;
          if (uFlipV > 0.5) uv.y = 1.0 - uv.y;
          uv.x = fract(uv.x + uOffset);
          vec4 tex = texture2D(uMask, uv);
          float sampleValue = tex.r;
          if (uChannel > 0.5 && uChannel < 1.5) sampleValue = tex.g;
          else if (uChannel > 1.5 && uChannel < 2.5) sampleValue = tex.b;
          else if (uChannel > 2.5 && uChannel < 3.5) sampleValue = tex.a;
          else if (uChannel > 3.5) sampleValue = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
          if (uInvert > 0.5) sampleValue = 1.0 - sampleValue;
          float land = step(uThreshold, sampleValue);
          vec3 ocean = vec3(0.01, 0.02, 0.04);
          vec3 landColor = vec3(0.98, 0.90, 0.68);
          vec3 raw = vec3(sampleValue);
          vec3 maskColor = mix(ocean, landColor, land);
          gl_FragColor = vec4(mix(raw * 0.26, maskColor, 0.88), uOpacity);
        }
      `,
    });
    debugMaskMaterial.customProgramCacheKey = () => `debugmask_${MEDIACARD_BUILD_TAG}`;
    const debugMaskMesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.002, 64, 64), debugMaskMaterial);
    debugMaskMesh.visible = false;
    debugMaskMesh.renderOrder = 3.2;
    globeGroup.add(debugMaskMesh);
    const debugAnchorMarkers = createDebugAnchorMarkers(MEDIACARD_TUNING.LON_OFFSET_DEG);
    debugAnchorMarkers.visible = false;
    debugAnchorMarkers.renderOrder = 3.3;
    globeGroup.add(debugAnchorMarkers);

    const disposeMarketOverlayGroup = (group: THREE.Group | null) => {
      if (!group) return;
      group.parent?.remove(group);
      group.traverse((obj) => {
        if (!(obj instanceof THREE.Points)) return;
        if (obj.geometry instanceof THREE.BufferGeometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          for (const material of obj.material) material.dispose();
        } else obj.material.dispose();
      });
    };

    let material: THREE.ShaderMaterial;
    let glowMaterial: THREE.ShaderMaterial;
    let marketOverlayMaterial: THREE.ShaderMaterial;
    try {
      material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        premultipliedAlpha: true,
      });
      glowMaterial = new THREE.ShaderMaterial({
        uniforms: glowUniforms,
        vertexShader,
        fragmentShader: glowFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      marketOverlayMaterial = new THREE.ShaderMaterial({
        uniforms: marketOverlayUniforms,
        vertexShader: marketOverlayVertexShader,
        fragmentShader: marketOverlayFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: false,
        premultipliedAlpha: true,
      });
    } catch (error) {
      console.error("[mediacard] dot shader compile failed", error);
      const fallbackVertexShader = `
        precision highp float;
        attribute float aHot;
        uniform float uPointPx;
        uniform float uDpr;
        uniform float uReveal;
        varying float vHot;
        varying float vReveal;
        void main() {
          vHot = aHot;
          vec3 unit = normalize(position);
          vReveal = clamp(0.5 - asin(clamp(unit.y, -1.0, 1.0)) / 3.14159265359, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPointPx, ${MEDIACARD_TUNING.DOT_MIN_SIZE_DPR.toFixed(1)} * uDpr, ${MEDIACARD_TUNING.DOT_MAX_SIZE_DPR.toFixed(1)} * uDpr);
        }
      `;
      const fallbackFragmentShader = `
        precision highp float;
        varying float vHot;
        varying float vReveal;
        uniform float uReveal;
        uniform vec3 uBase;
        uniform vec3 uViolet;
        void main() {
          if (vReveal > uReveal) discard;
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float r = sqrt(r2);
          float alpha = pow(1.0 - r, 1.5);
          vec3 color = mix(uBase * vec3(0.90, 0.76, 0.50), uViolet * vec3(0.84, 0.66, 1.02), smoothstep(0.78, 0.96, vHot));
          gl_FragColor = vec4(color * alpha, alpha);
        }
      `;
      const fallbackGlowFragmentShader = `
        precision highp float;
        varying float vHot;
        varying float vReveal;
        uniform float uReveal;
        uniform vec3 uViolet;
        void main() {
          if (vReveal > uReveal) discard;
          if (vHot <= 0.001) discard;
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r = length(p);
          if (r > 1.3) discard;
          float ring = smoothstep(1.3, 0.42, r);
          float alpha = ring * vHot * ${MEDIACARD_TUNING.DOT_GLOW_ALPHA.toFixed(3)};
          gl_FragColor = vec4(uViolet, alpha);
        }
      `;
      const fallbackMarketVertexShader = `
        precision highp float;
        attribute float aMarketW;
        uniform float uPointPx;
        uniform float uDpr;
        varying float vMarketW;
        varying float vReveal;
        void main() {
          vMarketW = aMarketW;
          vec3 unit = normalize(position);
          vReveal = clamp(0.5 - asin(clamp(unit.y, -1.0, 1.0)) / 3.14159265359, 0.0, 1.0);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(uPointPx, ${MEDIACARD_TUNING.DOT_MIN_SIZE_DPR.toFixed(1)} * uDpr, ${(MEDIACARD_TUNING.DOT_MAX_SIZE_DPR * 1.25).toFixed(1)} * uDpr) * 1.08;
        }
      `;
      const fallbackMarketFragmentShader = `
        precision highp float;
        varying float vMarketW;
        varying float vReveal;
        uniform float uReveal;
        void main() {
          if (vReveal > uReveal) discard;
          vec2 p = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(p, p);
          if (r2 > 1.0) discard;
          float alpha = pow(1.0 - sqrt(r2), 1.8) * vMarketW * 0.32;
          vec3 col = vec3(0.70, 0.60, 1.00);
          gl_FragColor = vec4(col * alpha, alpha);
        }
      `;
      material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: fallbackVertexShader,
        fragmentShader: fallbackFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        premultipliedAlpha: true,
      });
      glowMaterial = new THREE.ShaderMaterial({
        uniforms: glowUniforms,
        vertexShader: fallbackVertexShader,
        fragmentShader: fallbackGlowFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
      });
      marketOverlayMaterial = new THREE.ShaderMaterial({
        uniforms: marketOverlayUniforms,
        vertexShader: fallbackMarketVertexShader,
        fragmentShader: fallbackMarketFragmentShader,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        toneMapped: false,
        premultipliedAlpha: true,
      });
    }
    material.customProgramCacheKey = () => `dots_${MEDIACARD_BUILD_TAG}`;
    glowMaterial.customProgramCacheKey = () => `glow_${MEDIACARD_BUILD_TAG}`;
    marketOverlayMaterial.customProgramCacheKey = () => `market_overlay_${MEDIACARD_BUILD_TAG}`;
    material.needsUpdate = true;
    glowMaterial.needsUpdate = true;
    marketOverlayMaterial.needsUpdate = true;
    const points = new THREE.Points(geo, material);
    const glow = new THREE.Points(geo, glowMaterial);
    const marketOverlay = new THREE.Points(marketOverlayGeo, marketOverlayMaterial);
    points.renderOrder = 2;
    glow.renderOrder = 1.95;
    marketOverlay.renderOrder = 999;
    points.frustumCulled = false;
    glow.frustumCulled = false;
    marketOverlay.frustumCulled = false;
    if (dotsGroupRef.current) dotsGroupRef.current.parent?.remove(dotsGroupRef.current);
    disposeMarketOverlayGroup(marketOverlayGroupRef.current);
    marketOverlayGroupRef.current = null;
    const dotsGroup = new THREE.Group();
    dotsGroup.name = "mediacard-dots-group";
    const marketOverlayGroup = new THREE.Group();
    marketOverlayGroup.name = "mediacard-market-overlay-group";
    marketOverlayGroup.add(marketOverlay);
    dotsGroup.add(glow, points, marketOverlayGroup);
    globeGroup.add(dotsGroup);
    marketOverlayGroupRef.current = marketOverlayGroup;
    dotsGroupRef.current = dotsGroup;

    let debugMaskEnabled = false;
    let forcedMaskThreshold: number | null = null;
    let maskShrink = 0;
    let forcedMaskChannel: MaskChannel | null = null;
    if (typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search);
      debugMaskEnabled = qs.get("debugMask") === "1";
      const threshParam = qs.get("maskThresh");
      if (threshParam !== null) {
        const parsed = Number(threshParam);
        if (Number.isFinite(parsed)) forcedMaskThreshold = clamp(parsed, 0.01, 0.99);
      }
      const shrinkParam = qs.get("maskShrink");
      if (shrinkParam !== null) {
        const parsed = Number(shrinkParam);
        if (Number.isFinite(parsed)) maskShrink = clamp(parsed, 0, 0.2);
      }
      const channelParam = (qs.get("maskChan") ?? "").toLowerCase();
      if (channelParam === "r" || channelParam === "g" || channelParam === "b" || channelParam === "a" || channelParam === "lum") {
        forcedMaskChannel = channelParam;
      }
      if (forcedMaskThreshold !== null || maskShrink > 0 || forcedMaskChannel) {
        console.info(
          `[mediacard] maskOverrides thresh=${forcedMaskThreshold?.toFixed(3) ?? "auto"} shrink=${maskShrink.toFixed(3)} channel=${forcedMaskChannel ?? "auto"}`
        );
      }
    }
    const syncDebugMaskVisibility = () => {
      const debugVisible = debugMaskEnabled && Boolean(debugMaskUniforms.uMask.value);
      debugMaskMesh.visible = debugVisible;
      debugAnchorMarkers.visible = debugVisible;
      dotsGroup.visible = !debugVisible;
      atmosphereGlass.visible = !debugVisible;
      atmosphereRim.visible = !debugVisible;
      atmosphere.visible = !debugVisible;
      beaconGroup.visible = !debugVisible;
      cageGroup.visible = !debugVisible;
    };
    const scheduleMaskRetry = (reason: string) => {
      if (maskRetryAttempts >= TUNE.MASK_RETRY_MAX) {
        lastMaskStatus = "failed-retry-exhausted";
        syncDebugGlobal();
        console.warn(`[mediacard] mask retry budget exhausted (${TUNE.MASK_RETRY_MAX}). Keeping last-good dots.`);
        return;
      }
      maskRetryAttempts += 1;
      lastMaskStatus = `retry-${maskRetryAttempts}-scheduled`;
      syncDebugGlobal();
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      const delay = TUNE.MASK_RETRY_DELAY_MS * maskRetryAttempts;
      console.warn(`[mediacard] scheduling mask retry ${maskRetryAttempts}/${TUNE.MASK_RETRY_MAX}: ${reason}`);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        startMaskLoad(true);
      }, delay);
    };
    const retainLastGoodDots = () => {
      if (!lastGoodDots) return;
      applyAllDotBuffers(lastGoodDots);
      pointCount = lastGoodDots.positions.length / 3;
    };
    const failMaskLoad = (message: string, retryable = true) => {
      console.warn(message);
      lastMaskStatus = "failed-retained";
      retainLastGoodDots();
      syncDebugGlobal();
      syncDebugMaskVisibility();
      if (retryable) scheduleMaskRetry(message);
    };
    const onMaskLoaded = (img: HTMLImageElement) => {
      if (!aliveRef.current) return;
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      console.log("[mediacard] earth_mask loaded", width, height);

      if (!width || !height) {
        failMaskLoad("[mediacard] landmask loaded with invalid dimensions; keeping last-good dots.");
        return;
      }

      const sampler = createMaskSampler(img, TUNE.MASK_WORK_W, TUNE.MASK_WORK_H);
      if (!sampler) {
        failMaskLoad("[mediacard] failed to read landmask pixel data; keeping last-good dots.");
        return;
      }

      try {
        const selectedChannel = forcedMaskChannel ?? sampler.channel;
        maskCalibration = calibrateMaskProjection(sampler, MEDIACARD_TUNING.LON_OFFSET_DEG, selectedChannel, forcedMaskThreshold);
        console.log(
          `[mediacard] maskCalibration uFlip=${Number(maskCalibration.uFlip)} vFlip=${Number(maskCalibration.vFlip)} uOffset=${maskCalibration.uOffset.toFixed(1)} invert=${maskCalibration.invert} channel=${maskCalibration.channel} thresh=${maskCalibration.thresh.toFixed(3)} shrink=${maskShrink.toFixed(3)} score=${maskCalibration.score}`
        );
        if (maskCalibration.score < 4) {
          console.warn(
            `[mediacard] low confidence mask calibration (score=${maskCalibration.score}). Projection may be incorrect.`
          );
        }
        logMaskDiagnosticsDev(sampler, MEDIACARD_TUNING.LON_OFFSET_DEG, maskCalibration);

        const landMask = buildBinaryLandMask(sampler, maskCalibration, maskShrink);
        const dotsRaw = createDotsFromMask(landMask, sampler, maskCalibration, MEDIACARD_TUNING.LON_OFFSET_DEG, maskShrink);
        if (dotsRaw.positions.length === 0) {
          failMaskLoad("[mediacard] zero land dots generated from mask; keeping last-good dots.");
          return;
        }
        const dots = capDotBuffers(dotsRaw, TUNE.LAND_DOT_CAP);
        if (dots.positions.length !== dotsRaw.positions.length) {
          console.warn(`[mediacard] dot cap applied ${dotsRaw.positions.length / 3} -> ${dots.positions.length / 3}`);
        }
        applyAllDotBuffers(dots);
        lastGoodDots = cloneDotBuffers(dots);
        pointCount = dots.positions.length / 3;
        lastMaskStatus = "ok";
        maskRetryAttempts = 0;
        if (debugMaskTexture) debugMaskTexture.dispose();
        debugMaskTexture = createMaskPreviewTexture(sampler);
        debugMaskUniforms.uMask.value = debugMaskTexture;
        debugMaskUniforms.uFlipU.value = maskCalibration.uFlip ? 1 : 0;
        debugMaskUniforms.uFlipV.value = maskCalibration.vFlip ? 1 : 0;
        debugMaskUniforms.uOffset.value = maskCalibration.uOffset;
        debugMaskUniforms.uInvert.value = maskCalibration.invert;
        debugMaskUniforms.uThreshold.value = maskCalibration.thresh;
        debugMaskUniforms.uChannel.value = maskChannelToCode(maskCalibration.channel);
        updateDebugAnchorMarkerColors(debugAnchorMarkers, sampler, maskCalibration, MEDIACARD_TUNING.LON_OFFSET_DEG);
        syncDebugGlobal();
        syncDebugMaskVisibility();
        console.log("[mediacard] pointCount", pointCount);
        console.log(`[mediacard] dot generation success count=${pointCount}`);
      } catch (error) {
        failMaskLoad(`[mediacard] mask calibration/generation exception; keeping last-good dots. ${(error as Error).message ?? error}`);
      }
    };
    const startMaskLoad = (isRetry = false) => {
      if (!aliveRef.current) return;
      if (maskImg) {
        maskImg.onload = null;
        maskImg.onerror = null;
      }
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (maskImg !== image) return;
        onMaskLoaded(image);
      };
      image.onerror = () => {
        if (maskImg !== image) return;
        failMaskLoad(`[mediacard] failed to load landmask image: ${EARTH_MASK_URL}. Keeping last-good dots.`);
      };
      maskImg = image;
      lastMaskStatus = isRetry ? `retry-${maskRetryAttempts}-loading` : "loading";
      syncDebugGlobal();
      const retrySuffix = isRetry ? `?retry=${Date.now()}_${maskRetryAttempts}` : "";
      image.src = `${EARTH_MASK_URL}${retrySuffix}`;
    };
    startMaskLoad(false);

    const hitSphere = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, colorWrite: false, depthWrite: false })
    );
    globeGroup.add(hitSphere);

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const pointerDownAt = new THREE.Vector2();
    const lastPointerAt = new THREE.Vector2();
    const previousTrack = new THREE.Vector3();
    const tmpLocal = new THREE.Vector3();
    const rotationDelta = new THREE.Quaternion();
    const inertiaQuat = new THREE.Quaternion();
    const idleQuat = new THREE.Quaternion();
    const idleAxis = new THREE.Vector3(0, 1, 0);
    const inertiaAxis = new THREE.Vector3(0, 1, 0);
    let pointerDown = false;
    let pointerDragged = false;
    let inertiaSpeed = 0;
    let lastMoveTime = performance.now();
    let lastFrameTime = performance.now();
    const revealStart = performance.now();
    const revealDuration = 1200;
    let lastLoggedHoverMarket = Number.NaN;
    let lastLoggedActiveMarket = Number.NaN;
    let raf = 0;

    const focus = { mode: "idle" as FocusMode, startQ: restQuat.clone(), targetQ: restQuat.clone(), startD: cameraDistance, targetD: cameraDistance, t0: 0, dur: MEDIACARD_TUNING.FOCUS_DURATION_MS, pending: null as PanelId | null };
    const controlsLocked = () => focus.mode !== "idle" || interactionLockedRef.current;
    const clearHover = () => {
      cursorHoverMarketIdRef.current = MARKET_NONE_ID;
      onHoverRegionRef.current(null);
    };

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      const currentDpr = renderer.getPixelRatio();
      uniforms.uDpr.value = currentDpr;
      glowUniforms.uDpr.value = currentDpr;
      marketOverlayUniforms.uDpr.value = currentDpr;
      uniforms.uPointPx.value = TUNE.POINT_PX;
      glowUniforms.uPointPx.value = TUNE.POINT_PX * 1.35;
      marketOverlayUniforms.uPointPx.value = TUNE.POINT_PX;
    };

    const toLocalUnit = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObject(hitSphere, false)[0];
      if (!hit) return null;
      tmpLocal.copy(hit.point);
      globeGroup.worldToLocal(tmpLocal);
      return tmpLocal.normalize().clone();
    };
    const resolveHoveredMarket = (unit: THREE.Vector3) => {
      if (!Number.isFinite(unit.x) || !Number.isFinite(unit.y) || !Number.isFinite(unit.z)) return null;
      const worldPoint = unit.clone().applyQuaternion(globeGroup.quaternion).normalize();
      const viewDir = camera.position.clone().sub(worldPoint).normalize();
      const frontFacing = worldPoint.dot(viewDir) > 0.02;
      if (!frontFacing) return null;

      let best: (typeof marketRuntime)[number] | null = null;
      let bestDeg = Number.POSITIVE_INFINITY;
      for (const market of marketRuntime) {
        const dot = clamp(unit.dot(market.center), -1, 1);
        const distanceDeg = THREE.MathUtils.radToDeg(Math.acos(dot));
        if (distanceDeg <= market.hitRadiusDeg && distanceDeg < bestDeg) {
          best = market;
          bestDeg = distanceDeg;
        }
      }
      if (!best) return null;
      return {
        marketId: best.id,
        panelKey: best.panelKey,
        label: best.label,
      };
    };

    const startFocusIn = (target: FocusRequest) => {
      const unit = latLonToUnit(target.lat, target.lon, MEDIACARD_TUNING.LON_OFFSET_DEG);
      focus.mode = "focusingIn";
      focus.startQ.copy(globeGroup.quaternion);
      focus.targetQ.copy(quatToFront(unit));
      focus.startD = cameraDistance;
      focus.targetD = target.distance ?? (typeof target.zoom === "number" ? zoomToDistance(target.zoom) : MEDIACARD_TUNING.CAMERA_CLICK_DISTANCE);
      focus.t0 = performance.now();
      focus.dur = MEDIACARD_TUNING.FOCUS_DURATION_MS;
      focus.pending = target.key;
      cameraDistanceTarget = focus.targetD;
      inertiaSpeed = 0;
      pointerDown = false;
      pointerDragged = false;
      clearHover();
    };

    const startFocusOut = () => {
      if (focus.mode === "idle" || focus.mode === "focusingOut") return;
      focus.mode = "focusingOut";
      focus.startQ.copy(globeGroup.quaternion);
      focus.targetQ.copy(restQuat);
      focus.startD = cameraDistance;
      focus.targetD = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
      focus.t0 = performance.now();
      focus.dur = MEDIACARD_TUNING.RESTORE_DURATION_MS;
      focus.pending = null;
      cameraDistanceTarget = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
      inertiaSpeed = 0;
      pointerDown = false;
      pointerDragged = false;
      clearHover();
    };

    focusToLatLonRef.current = (target) => startFocusIn(target);
    resetFocusRef.current = () => startFocusOut();

    const onPointerDown = (event: PointerEvent) => {
      event.preventDefault();
      if (controlsLocked()) return;
      pointerDown = true;
      pointerDragged = false;
      pointerDownAt.set(event.clientX, event.clientY);
      lastPointerAt.copy(pointerDownAt);
      previousTrack.copy(projectToTrackball(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect()));
      lastMoveTime = performance.now();
      inertiaSpeed = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      event.preventDefault();
      if (!pointerDown) {
        if (!controlsLocked()) {
          const unit = toLocalUnit(event.clientX, event.clientY);
          if (!unit) return clearHover();
          const marketHit = resolveHoveredMarket(unit);
          if (marketHit) {
            cursorHoverMarketIdRef.current = marketHit.marketId;
            onHoverRegionRef.current({
              label: marketHit.label,
              panelLabel: PANEL_LABELS[marketHit.panelKey],
              panelKey: marketHit.panelKey,
              x: event.clientX,
              y: event.clientY,
            });
            return;
          }
          clearHover();
        } else clearHover();
        return;
      }
      if (controlsLocked()) return;
      const track = projectToTrackball(event.clientX, event.clientY, renderer.domElement.getBoundingClientRect());
      rotationDelta.setFromUnitVectors(previousTrack, track);
      const angle = 2 * Math.acos(clamp(rotationDelta.w, -1, 1)) * MEDIACARD_TUNING.TRACKBALL_SENSITIVITY;
      if (angle > 0.000001) {
        inertiaAxis.set(rotationDelta.x, rotationDelta.y, rotationDelta.z);
        if (inertiaAxis.lengthSq() > 0.000001) {
          inertiaAxis.normalize();
          inertiaQuat.setFromAxisAngle(inertiaAxis, angle);
          globeGroup.quaternion.premultiply(inertiaQuat).normalize();
        }
      }
      previousTrack.copy(track);
      const now = performance.now();
      const dt = Math.max(0.001, (now - lastMoveTime) / 1000);
      lastMoveTime = now;
      if (angle > 0.00001 && inertiaAxis.lengthSq() > 0.000001) inertiaSpeed = clamp(angle / dt, 0, MEDIACARD_TUNING.INERTIA_MAX_SPEED);
      lastPointerAt.set(event.clientX, event.clientY);
      const dx = lastPointerAt.x - pointerDownAt.x;
      const dy = lastPointerAt.y - pointerDownAt.y;
      if (dx * dx + dy * dy >= MEDIACARD_TUNING.DRAG_THRESHOLD_PX * MEDIACARD_TUNING.DRAG_THRESHOLD_PX) {
        pointerDragged = true;
        clearHover();
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      pointerDown = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
      if (!pointerDragged && !controlsLocked()) {
        const unit = toLocalUnit(event.clientX, event.clientY);
        if (!unit) return;
        const marketHit = resolveHoveredMarket(unit);
        if (!marketHit) return;
        const t = TARGETS[marketHit.panelKey];
        onSelectRegionRef.current({ regionKey: marketHit.panelKey, lat: t.lat, lon: t.lon, zoom: t.zoom });
      }
    };
    const onPointerLeave = () => !pointerDown && clearHover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key === "p" || event.key === "P") {
        const equivalentOrbitPos = camera.position.clone().applyQuaternion(globeGroup.quaternion.clone().invert());
        const orbitLen = Math.max(equivalentOrbitPos.length(), 0.000001);
        const azimuth = Math.atan2(equivalentOrbitPos.x, equivalentOrbitPos.z);
        const polar = Math.acos(clamp(equivalentOrbitPos.y / orbitLen, -1, 1));
        console.info(
          `[mediacard] pose azimuth=${azimuth.toFixed(6)} polar=${polar.toFixed(6)} camera=(${camera.position.x.toFixed(4)}, ${camera.position.y.toFixed(4)}, ${camera.position.z.toFixed(4)}) orbitPos=(${equivalentOrbitPos.x.toFixed(4)}, ${equivalentOrbitPos.y.toFixed(4)}, ${equivalentOrbitPos.z.toFixed(4)})`
        );
        console.info(`[mediacard] tuning INIT_AZIMUTH=${azimuth.toFixed(6)} INIT_POLAR=${polar.toFixed(6)}`);
        return;
      }
      if (event.key === "d" || event.key === "D") {
        debugMaskEnabled = !debugMaskEnabled;
        syncDebugMaskVisibility();
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    renderer.domElement.addEventListener("wheel", (event) => event.preventDefault(), { passive: false });
    window.addEventListener("keydown", onKeyDown);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const animate = (time: number) => {
      if (!aliveRef.current) return;
      const currentDpr = renderer.getPixelRatio();
      const dt = clamp((time - lastFrameTime) / 1000, 0.001, 0.05);
      lastFrameTime = time;
      uniforms.uDpr.value = currentDpr;
      glowUniforms.uDpr.value = currentDpr;
      marketOverlayUniforms.uDpr.value = currentDpr;
      const timeSec = time * 0.001;
      uniforms.uTime.value = timeSec;
      glowUniforms.uTime.value = timeSec;
      const finalHover = hoverMarketIdRef.current > 0 ? hoverMarketIdRef.current : cursorHoverMarketIdRef.current;
      marketOverlayUniforms.uHoverMarket.value = finalHover;
      marketOverlayUniforms.uActiveMarket.value = activeMarketIdRef.current;
      if (finalHover !== lastLoggedHoverMarket || activeMarketIdRef.current !== lastLoggedActiveMarket) {
        console.log(
          `[mediacard] marketUniforms hover=${finalHover} active=${activeMarketIdRef.current} uHover=${marketOverlayUniforms.uHoverMarket.value} uActive=${marketOverlayUniforms.uActiveMarket.value}`
        );
        console.log("[mediacard] hoverFinal", finalHover, "active", activeMarketIdRef.current);
        lastLoggedHoverMarket = finalHover;
        lastLoggedActiveMarket = activeMarketIdRef.current;
      }
      const strengths = computeMarketStrengths(timeSec);
      const beaconScaleBase = clamp(cameraDistance * 0.065, 0.14, 0.24);
      for (const sprite of beaconSprites) {
        const marketId = Number(sprite.userData.marketId ?? MARKET_NONE_ID);
        const marketStrength = strengthForMarket(marketId, strengths);
        const pulse = 0.96 + (0.04 + 0.12 * marketStrength) * (0.5 + 0.5 * Math.sin(timeSec * 0.72 + marketId * 1.1));
        const scale = beaconScaleBase * (1.0 + 0.26 * marketStrength) * pulse;
        sprite.scale.setScalar(scale);
        const material = sprite.material;
        if (material instanceof THREE.SpriteMaterial) {
          material.opacity = clamp(0.10 + 0.30 * marketStrength + (pulse - 0.96) * 0.3, 0.08, 0.46);
          material.color.setRGB(
            THREE.MathUtils.lerp(0.72, 0.92, marketStrength),
            THREE.MathUtils.lerp(0.76, 0.96, marketStrength),
            THREE.MathUtils.lerp(0.96, 1.0, marketStrength)
          );
        }
      }
      const revealT = clamp((time - revealStart) / revealDuration, 0, 1);
      const reveal = 1 - Math.pow(1 - revealT, 3);
      uniforms.uReveal.value = reveal;
      glowUniforms.uReveal.value = reveal;
      marketOverlayUniforms.uReveal.value = reveal;
      if (focus.mode === "focusingIn" || focus.mode === "focusingOut") {
        const t = clamp((time - focus.t0) / focus.dur, 0, 1);
        const eased = easeInOut(t, MEDIACARD_TUNING.FOCUS_EASE_POWER);
        globeGroup.quaternion.slerpQuaternions(focus.startQ, focus.targetQ, eased);
        cameraDistance = THREE.MathUtils.lerp(focus.startD, focus.targetD, eased);
        cameraDistanceTarget = focus.targetD;
        if (t >= 1) {
          if (focus.mode === "focusingIn") {
            focus.mode = "focused";
            onFocusSettledRef.current(focus.pending ?? "comingSoon");
          } else {
            focus.mode = "idle";
            cameraDistanceTarget = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
            onRestSettledRef.current?.();
          }
        }
      } else if (focus.mode === "idle") {
        if (!pointerDown && !interactionLockedRef.current && inertiaSpeed > 0.0008) {
          inertiaQuat.setFromAxisAngle(inertiaAxis, inertiaSpeed * dt);
          globeGroup.quaternion.premultiply(inertiaQuat).normalize();
          inertiaSpeed *= MEDIACARD_TUNING.INERTIA_DAMPING;
        } else if (!pointerDown && !interactionLockedRef.current) {
          idleQuat.setFromAxisAngle(idleAxis, TUNE.IDLE_ROTATION_RAD_PER_SEC * dt);
          globeGroup.quaternion.premultiply(idleQuat).normalize();
          inertiaSpeed *= MEDIACARD_TUNING.INERTIA_DAMPING;
        } else inertiaSpeed *= MEDIACARD_TUNING.INERTIA_DAMPING;
        cameraDistanceTarget = MEDIACARD_TUNING.CAMERA_DEFAULT_DISTANCE;
        cameraDistance = THREE.MathUtils.lerp(cameraDistance, cameraDistanceTarget, 0.1);
      } else {
        inertiaSpeed = 0;
        cameraDistance = THREE.MathUtils.lerp(cameraDistance, cameraDistanceTarget, 0.16);
      }
      camera.position.set(0, 0, cameraDistance);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    return () => {
      aliveRef.current = false;
      initializedRef.current = false;
      onHoverRegionRef.current(null);
      focusToLatLonRef.current = () => {};
      resetFocusRef.current = () => {};
      if (raf) cancelAnimationFrame(raf);
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
      resizeObserver.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      geo.dispose();
      material.dispose();
      glowMaterial.dispose();
      debugMaskMesh.geometry.dispose();
      debugMaskMaterial.dispose();
      (debugAnchorMarkers.geometry as THREE.BufferGeometry).dispose();
      (debugAnchorMarkers.material as THREE.Material).dispose();
      if (debugMaskTexture) {
        debugMaskTexture.dispose();
        debugMaskTexture = null;
      }
      if (maskImg) {
        maskImg.onload = null;
        maskImg.onerror = null;
        maskImg.src = "";
      }
      starsGeometry.dispose();
      starsMaterial.dispose();
      atmosphereGlass.geometry.dispose();
      atmosphereGlassMaterial.dispose();
      atmosphereRim.geometry.dispose();
      atmosphereRimMaterial.dispose();
      atmosphere.geometry.dispose();
      atmosphereMaterial.dispose();
      disposeMarketBeaconGroup(beaconGroup);
      if (marketBeaconGroupRef.current === beaconGroup) marketBeaconGroupRef.current = null;
      disposeMarketOverlayGroup(marketOverlayGroup);
      if (marketOverlayGroupRef.current === marketOverlayGroup) marketOverlayGroupRef.current = null;
      occluder.geometry.dispose();
      (occluder.material as THREE.Material).dispose();
      disposeCageGroup(cageGroup);
      if (cageGroupRef.current === cageGroup) cageGroupRef.current = null;
      if (dotsGroupRef.current === dotsGroup) dotsGroupRef.current = null;
      (hitSphere.geometry as THREE.BufferGeometry).dispose();
      (hitSphere.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [MEDIACARD_BUILD_TAG]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={hostRef} className={className} aria-hidden="true" />;
});
