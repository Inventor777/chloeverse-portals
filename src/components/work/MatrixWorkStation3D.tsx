// CHLOEVERSE_WORK_PASS_v10 (GLB terminal only + ENTER on-screen + no clutter)
"use client";

import { animate, motion, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

type WorkSection = {
  heading: string;
  body: string[];
};

type MatrixWorkStation3DProps = {
  sections: WorkSection[];
};

type ScreenPhase = "intro" | "locked" | "flash" | "boot" | "dossier";
type ViewMode = "hero" | "zooming" | "screen";

const DEBUG_VISIBILITY_LIFT = true;
const DEBUG_LIFT_AMOUNT = 0.18;
const DEBUG_EXPOSURE_MULTIPLIER = 1.25;
const WORK_SCREEN_FIT_DEFAULT = {
  pos: [0.4308, 0.1253, 0.2093],
  quat: [0.0326, 0.05, 0.8387, 0.5445],
  size: [2.1206, 0.7012],
  push: 0.002,
} as const;
const WORK_SCREEN_FIT_DEFAULT_ROT_DEG = {
  x: -2.7793,
  y: 6.2437,
  z: 114.1668,
} as const;
const TERMINAL_URL = "/models/work_terminal_body.glb";
const USE_GLB_TERMINAL = true;
const USE_IMPORTED_TERMINAL = USE_GLB_TERMINAL;
const INTRO_BOOT_BLACK_END = 0.25;
const INTRO_BOOT_FLASH_END = 0.55;
const INTRO_BOOT_GLOW_END = 1.2;
const INTRO_CAMERA_END = 3.2;
const INTRO_CANVAS_BLACK_END = 0.55;
const INTRO_CANVAS_GLOW_END = 1.1;
const INTRO_CANVAS_TEXT_START = 0.6;
const INTRO_CANVAS_ENTER_START = 0.7;
const INTRO_CANVAS_ENTER_FADE = 0.28;
const FALLBACK_SCREEN_LOCAL_X = 0.006;
const FALLBACK_SCREEN_LOCAL_Y = 0.285;
const FALLBACK_SCREEN_LOCAL_Z = 0.27;
const FALLBACK_SCREEN_LOCAL_WIDTH = 0.904;
const FALLBACK_SCREEN_LOCAL_HEIGHT = 0.712;
const FALLBACK_INSET = 0.96;
const FALLBACK_SCALE_X_DEFAULT = 0.965;
const FALLBACK_SCALE_Y_DEFAULT = 0.915;
const FALLBACK_OFFSET_X_DEFAULT = 0.0;
const FALLBACK_OFFSET_Y_DEFAULT = -0.018;
const FALLBACK_OFFSET_Z_DEFAULT = 0.0;
const FALLBACK_SCREEN_PLANE_Z_OFFSET = 0.003;
const ENTER_UV_X0 = 0.406;
const ENTER_UV_X1 = 0.594;
const ENTER_UV_Y0 = 0.306;
const ENTER_UV_Y1 = 0.382;
const SCREEN_PLANE_RENDER_ORDER = 999999;
const GLASS_RENDER_ORDER = 1000;
const GLASS_OPACITY = 0.12;
const ZOOM_SCREEN_FILL_FACTOR = 0.72;
const FRAME_MARGIN = 1.14;
const WORK_SCREEN_PATH_STORAGE_KEY = "work.screenPath";
const WORK_HIDDEN_PATHS_STORAGE_KEY = "work.hiddenPaths";
const WORK_SCREEN_FIT_V1_STORAGE_KEY = "work.screenFit.v1";
const OCCLUDER_RAY_EPSILON = 0.003;
const OCCLUDER_INSET_FACTOR = 0.7;
const OCCLUDER_STABLE_FRAMES = 12;
const OCCLUDER_MAX_MESH_DIAG_RATIO = 0.25;
const FORCE_FALLBACK_OCCLUDER_MAX_MESH_DIAG_RATIO = 0.2;
const FALLBACK_SCREEN_CENTER_INSET_FACTOR = 0.85;
const FALLBACK_AUTO_HIDE_MAX_PER_LOAD = 1;
const BOOT_LINES = [
  "auth: handshake initiated",
  "auth: badge signature verified",
  "auth: access level granted",
  "session: key issued",
  "profile: mount /work",
];

const DEV_COPY_PATTERN =
  /(replace|write|add|mp4url|example\.com|yourhandle|brand name|project video|one-line|notable win|tiktok|reel|embed|tight, high-impact|dates)/i;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function liftHexColor(hex: THREE.ColorRepresentation, lift = DEBUG_LIFT_AMOUNT) {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  hsl.l = clamp01(hsl.l + lift);
  hsl.s = clamp01(hsl.s * (1 - lift * 0.22));
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function applyMaterialLift(material: THREE.Material, liftAmount = DEBUG_LIFT_AMOUNT) {
  const lifted = material as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
  };

  if (lifted.color instanceof THREE.Color) {
    const liftedColor = liftHexColor(lifted.color, liftAmount);
    lifted.color.copy(liftedColor);
    lifted.color.lerp(new THREE.Color(0xffffff), liftAmount * 0.35);
    const maxChannel = Math.max(lifted.color.r, lifted.color.g, lifted.color.b);
    if (maxChannel < 0.12) {
      const raise = 0.12 / Math.max(0.0001, maxChannel);
      lifted.color.multiplyScalar(raise);
    }
  }

  if (typeof lifted.roughness === "number") {
    lifted.roughness = THREE.MathUtils.clamp(lifted.roughness, 0.24, 0.84);
  }
  if (typeof lifted.metalness === "number") {
    lifted.metalness = THREE.MathUtils.clamp(lifted.metalness, 0.02, 0.9);
  }
  if (lifted.emissive instanceof THREE.Color && typeof lifted.emissiveIntensity === "number") {
    lifted.emissive.copy(liftHexColor(lifted.emissive, liftAmount * 0.36));
    lifted.emissiveIntensity *= 1.08;
  }

  lifted.needsUpdate = true;
}

function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(value: number) {
  const t = clamp01(value);
  if (t < 0.5) return 4 * t * t * t;
  return 1 - Math.pow(-2 * t + 2, 3) * 0.5;
}

function smoothStep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

type DebugScreenFitState = {
  posX: number;
  posY: number;
  posZ: number;
  rotXDeg: number;
  rotYDeg: number;
  rotZDeg: number;
  width: number;
  height: number;
  push: number;
};

const DEFAULT_DEBUG_SCREEN_FIT: DebugScreenFitState = {
  posX: WORK_SCREEN_FIT_DEFAULT.pos[0],
  posY: WORK_SCREEN_FIT_DEFAULT.pos[1],
  posZ: WORK_SCREEN_FIT_DEFAULT.pos[2],
  rotXDeg: WORK_SCREEN_FIT_DEFAULT_ROT_DEG.x,
  rotYDeg: WORK_SCREEN_FIT_DEFAULT_ROT_DEG.y,
  rotZDeg: WORK_SCREEN_FIT_DEFAULT_ROT_DEG.z,
  width: WORK_SCREEN_FIT_DEFAULT.size[0],
  height: WORK_SCREEN_FIT_DEFAULT.size[1],
  push: WORK_SCREEN_FIT_DEFAULT.push,
};

const asFiniteNumber = (value: unknown, fallback: number) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const round6 = (value: number) => Number(value.toFixed(6));

function sanitizeDebugScreenFitState(raw: unknown): DebugScreenFitState {
  const obj = raw && typeof raw === "object" ? (raw as Partial<DebugScreenFitState>) : {};
  return {
    posX: round6(asFiniteNumber(obj.posX, DEFAULT_DEBUG_SCREEN_FIT.posX)),
    posY: round6(asFiniteNumber(obj.posY, DEFAULT_DEBUG_SCREEN_FIT.posY)),
    posZ: round6(asFiniteNumber(obj.posZ, DEFAULT_DEBUG_SCREEN_FIT.posZ)),
    rotXDeg: round6(asFiniteNumber(obj.rotXDeg, DEFAULT_DEBUG_SCREEN_FIT.rotXDeg)),
    rotYDeg: round6(asFiniteNumber(obj.rotYDeg, DEFAULT_DEBUG_SCREEN_FIT.rotYDeg)),
    rotZDeg: round6(asFiniteNumber(obj.rotZDeg, DEFAULT_DEBUG_SCREEN_FIT.rotZDeg)),
    width: THREE.MathUtils.clamp(round6(asFiniteNumber(obj.width, DEFAULT_DEBUG_SCREEN_FIT.width)), 0.05, 8),
    height: THREE.MathUtils.clamp(round6(asFiniteNumber(obj.height, DEFAULT_DEBUG_SCREEN_FIT.height)), 0.05, 8),
    push: THREE.MathUtils.clamp(round6(asFiniteNumber(obj.push, DEFAULT_DEBUG_SCREEN_FIT.push)), -0.25, 0.25),
  };
}

function readDebugScreenFitStateFromStorage(): DebugScreenFitState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(WORK_SCREEN_FIT_V1_STORAGE_KEY);
    if (!raw) return null;
    return sanitizeDebugScreenFitState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.max(0, Math.min(radius, width * 0.5, height * 0.5));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function applyConvexBow(geometry: THREE.PlaneGeometry, depth = 0.026) {
  const position = geometry.attributes.position;
  const vector = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vector.fromBufferAttribute(position, i);
    const nx = vector.x / Math.max(0.001, geometry.parameters.width * 0.5);
    const ny = vector.y / Math.max(0.001, geometry.parameters.height * 0.5);
    const radial = Math.min(1, nx * nx + ny * ny);
    vector.z = (1 - radial) * depth;
    position.setXYZ(i, vector.x, vector.y, vector.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function createRoundedBoxGeometry(width: number, height: number, depth: number, radius = 0.09, segments = 8) {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const r = Math.max(0.001, Math.min(radius, hw - 0.001, hd - 0.001));

  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const bevel = Math.min(r * 0.5, Math.min(width, height, depth) * 0.2);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: Math.max(2, Math.round(segments / 2)),
    curveSegments: Math.max(8, segments),
  });

  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0, -height * 0.5, 0);
  geometry.computeVertexNormals();

  return geometry;
}

function drawRoundedRectPath(path: THREE.Shape | THREE.Path, width: number, height: number, radius: number) {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const r = Math.max(0.001, Math.min(radius, hw - 0.001, hh - 0.001));

  path.moveTo(-hw + r, -hh);
  path.lineTo(hw - r, -hh);
  path.quadraticCurveTo(hw, -hh, hw, -hh + r);
  path.lineTo(hw, hh - r);
  path.quadraticCurveTo(hw, hh, hw - r, hh);
  path.lineTo(-hw + r, hh);
  path.quadraticCurveTo(-hw, hh, -hw, hh - r);
  path.lineTo(-hw, -hh + r);
  path.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
}

function createRoundedRectRingGeometry(
  outerWidth: number,
  outerHeight: number,
  innerWidth: number,
  innerHeight: number,
  outerRadius: number,
  innerRadius: number,
  depth: number,
  segments = 16
) {
  const shape = new THREE.Shape();
  drawRoundedRectPath(shape, outerWidth, outerHeight, outerRadius);

  const hole = new THREE.Path();
  drawRoundedRectPath(hole, innerWidth, innerHeight, innerRadius);
  shape.holes.push(hole);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    bevelEnabled: true,
    bevelSize: Math.min(depth * 0.28, 0.02),
    bevelThickness: Math.min(depth * 0.35, 0.026),
    bevelSegments: 3,
    curveSegments: Math.max(10, segments),
  });

  geometry.translate(0, 0, -depth * 0.5);
  geometry.computeVertexNormals();
  return geometry;
}

function makeLabelTexture(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#050807";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(160, 222, 187, 0.32)";
  context.lineWidth = 3;
  context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  context.font = "700 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(188, 242, 212, 0.88)";
  context.fillText(label, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeButtonTexture(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(198, 255, 217, 0.94)";
  context.font = "700 48px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeNoiseTexture(size: number, strength = 0.24) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.floor((0.35 + Math.random() * strength) * 255);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  context.globalAlpha = 0.14;
  context.strokeStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < size; i += 3) {
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(size, i + 8);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeRadialShadowTexture(size = 256) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.08,
    size * 0.5,
    size * 0.5,
    size * 0.5
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.5)");
  gradient.addColorStop(0.3, "rgba(0,0,0,0.3)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function sanitizeLine(line: string, index: number) {
  const normalized = line.replace(/\uFFFD/g, "").replace(/\u2022|\u00e2\u20ac\u00a2/g, "-").trim();
  if (!normalized) return "";
  if (DEV_COPY_PATTERN.test(normalized)) {
    return index % 2 === 0 ? "REDACTED" : "PENDING CLEARANCE ENTRY";
  }
  return normalized;
}

function sanitizeHeading(heading: string) {
  if (DEV_COPY_PATTERN.test(heading)) return "CLASSIFIED";
  return heading;
}

function buildObjPath(object: THREE.Object3D) {
  const parts: string[] = [];
  let node: THREE.Object3D | null = object;
  while (node) {
    const parent = node.parent;
    const siblings = parent ? parent.children.filter((child) => child.type === node!.type) : [node];
    const indexAmongType = Math.max(0, siblings.indexOf(node));
    const base = node.name?.trim() ? node.name.trim() : node.type;
    parts.push(`${base.replace(/\//g, "_")}#${indexAmongType}`);
    node = node.parent;
  }
  return parts.reverse().join("/");
}

function objPath(object: THREE.Object3D) {
  return buildObjPath(object);
}

function findByPath(root: THREE.Object3D, path: string): THREE.Object3D | null {
  const needle = path.trim();
  if (!needle) return null;
  const needleLC = needle.toLowerCase();
  let hit: THREE.Object3D | null = null;
  root.traverse((object: THREE.Object3D) => {
    if (hit) return;
    const currentPath = buildObjPath(object);
    const currentLC = currentPath.toLowerCase();
    if (
      currentPath === needle ||
      currentLC === needleLC ||
      currentPath.endsWith(`/${needle}`) ||
      currentLC.endsWith(`/${needleLC}`) ||
      needle.endsWith(`/${currentPath}`) ||
      needleLC.endsWith(`/${currentLC}`)
    ) {
      hit = object;
    }
  });
  return hit;
}

function firstMeshFromObject(object: THREE.Object3D | null): THREE.Mesh | null {
  if (!object) return null;
  if ((object as THREE.Mesh).isMesh) return object as THREE.Mesh;
  let hit: THREE.Mesh | null = null;
  object.traverse((child: THREE.Object3D) => {
    if (hit) return;
    if ((child as THREE.Mesh).isMesh) {
      hit = child as THREE.Mesh;
    }
  });
  return hit;
}

function isDescendantOf(object: THREE.Object3D, ancestor: THREE.Object3D | null) {
  if (!ancestor) return false;
  let cursor: THREE.Object3D | null = object;
  while (cursor) {
    if (cursor === ancestor) return true;
    cursor = cursor.parent;
  }
  return false;
}

function bboxInfo(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const w = size.x;
  const h = size.y;
  const d = size.z;
  const maxDim = Math.max(w, h, d, 1e-6);
  const minDim = Math.min(w, h, d);
  const xyMax = Math.max(w, h, 1e-6);
  const xyMin = Math.max(Math.min(w, h), 1e-6);
  const name = object.name?.trim().length ? object.name.trim() : `${object.type}:${object.uuid.slice(0, 8)}`;
  return {
    w,
    h,
    d,
    cx: center.x,
    cy: center.y,
    cz: center.z,
    vol: Math.max(1e-6, w * h * d),
    flatness: minDim / maxDim,
    aspectXY: xyMax / xyMin,
    name,
    path: objPath(object),
    uuid: object.uuid,
  };
}

export default function MatrixWorkStation3D({ sections }: MatrixWorkStation3DProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const blackoutRef = useRef<HTMLDivElement | null>(null);
  const peripheralRef = useRef<HTMLDivElement | null>(null);
  const screenOverlayRef = useRef<HTMLDivElement | null>(null);
  const badgeLaneRef = useRef<HTMLDivElement | null>(null);
  const dossierScrollRef = useRef<HTMLDivElement | null>(null);

  const badgeY = useMotionValue(0);

  const [dragMax, setDragMax] = useState(260);
  const [authed, setAuthed] = useState(false);
  const [phase, setPhase] = useState<ScreenPhase>("intro");
  const [viewMode, setViewMode] = useState<ViewMode>("hero");
  const [typedCount, setTypedCount] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [qs, setQs] = useState<URLSearchParams | null>(null);
  const [debugModelUrl] = useState(() => TERMINAL_URL);
  const [debugSelectedScreenName, setDebugSelectedScreenName] = useState("");
  const [debugSelectedScreenPath, setDebugSelectedScreenPath] = useState("");
  const [debugSelectedKeyboardPath, setDebugSelectedKeyboardPath] = useState("");
  const [debugSelectedBodyPath, setDebugSelectedBodyPath] = useState("");
  const [debugHiddenOccludersCount, setDebugHiddenOccludersCount] = useState(0);
  const [debugLatestHiddenPath, setDebugLatestHiddenPath] = useState("");
  const [debugIsFallbackScreen, setDebugIsFallbackScreen] = useState(false);
  const [debugCandidatesCount, setDebugCandidatesCount] = useState(0);
  const [debugForceFallbackMode, setDebugForceFallbackMode] = useState(false);
  const [debugAutoHiddenThisLoad, setDebugAutoHiddenThisLoad] = useState("");
  const [debugScreenFitStatus, setDebugScreenFitStatus] = useState("PENDING");
  const [debugScreenFitSize, setDebugScreenFitSize] = useState("(pending)");
  const [debugScreenFitPose, setDebugScreenFitPose] = useState("(pending)");
  const [debugScreenAnchorKind, setDebugScreenAnchorKind] = useState<"CRT_Screen" | "__workScreenPlane" | "(pending)">(
    "(pending)"
  );
  const [screenBindingRevision, setScreenBindingRevision] = useState(0);
  const initialDebugScreenFit = useMemo(() => {
    const source = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const isDebug = source?.get("debug") === "1";
    const clearFit = source?.get("clearFit") === "1";
    const stored = isDebug && !clearFit ? readDebugScreenFitStateFromStorage() : null;
    return {
      state: stored ?? DEFAULT_DEBUG_SCREEN_FIT,
      fromStorage: !!stored,
    };
  }, []);
  const [posX, setPosX] = useState(initialDebugScreenFit.state.posX);
  const [posY, setPosY] = useState(initialDebugScreenFit.state.posY);
  const [posZ, setPosZ] = useState(initialDebugScreenFit.state.posZ);
  const [rotXDeg, setRotXDeg] = useState(initialDebugScreenFit.state.rotXDeg);
  const [rotYDeg, setRotYDeg] = useState(initialDebugScreenFit.state.rotYDeg);
  const [rotZDeg, setRotZDeg] = useState(initialDebugScreenFit.state.rotZDeg);
  const [width, setWidth] = useState(initialDebugScreenFit.state.width);
  const [height, setHeight] = useState(initialDebugScreenFit.state.height);
  const [push, setPush] = useState(initialDebugScreenFit.state.push);
  const [debugLastKey, setDebugLastKey] = useState("-");

  const dragMaxRef = useRef(dragMax);
  const swipeProgressRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const phaseRef = useRef<ScreenPhase>("intro");
  const viewModeRef = useRef<ViewMode>("hero");
  const authedRef = useRef(false);
  const scrollTerminalRef = useRef<(factor: number) => void>(() => undefined);
  const introCompleteRef = useRef(false);
  const typedCountRef = useRef(0);
  const sanitizedSectionsRef = useRef<Array<{ heading: string; body: string[] }>>([]);
  const zoomStartMsRef = useRef<number | null>(null);
  const zoomProgressRef = useRef(0);
  const prepareZoomTargetRef = useRef<() => void>(() => undefined);
  const zoomTargetLockedRef = useRef(false);
  const zoomScreenCenterWorldRef = useRef(new THREE.Vector3());
  const zoomScreenNormalWorldRef = useRef(new THREE.Vector3(0, 0, 1));
  const zoomDistanceRef = useRef(1.2);
  const zoomLockedCamPosWorldRef = useRef(new THREE.Vector3());
  const zoomLockedLookAtWorldRef = useRef(new THREE.Vector3());
  const zoomStartCamPosWorldRef = useRef(new THREE.Vector3());
  const zoomStartPoseCapturedRef = useRef(false);
  const canvasReadyRef = useRef(false);
  const canvasPaintedRef = useRef(false);
  const canvasPresentedFramesRef = useRef(0);
  const triggerAuthRef = useRef<() => void>(() => undefined);
  const authFlashStartMsRef = useRef<number | null>(null);
  const authAcceptedMsRef = useRef<number | null>(null);
  const authDetentStartMsRef = useRef<number | null>(null);
  const authZoomDelayRef = useRef<number | null>(null);
  const canvasScrollRef = useRef(0);
  const canvasMaxScrollRef = useRef(0);
  const enterButtonRectRef = useRef({ visible: false });
  const screenFlipXRef = useRef(false);
  const terminalRootRef = useRef<THREE.Group | null>(null);
  const screenMeshRef = useRef<THREE.Mesh | null>(null);
  const chosenAnchorMeshRef = useRef<THREE.Mesh | null>(null);
  const chosenKeyboardMeshRef = useRef<THREE.Mesh | null>(null);
  const chosenScreenMeshRef = useRef<THREE.Mesh | null>(null);
  const bodyMeshRef = useRef<THREE.Mesh | null>(null);
  const screenGizmoDefaultsRef = useRef<DebugScreenFitState>(DEFAULT_DEBUG_SCREEN_FIT);
  const screenGizmoReadyRef = useRef(initialDebugScreenFit.fromStorage);
  const screenGizmoBasePosRef = useRef(
    new THREE.Vector3(initialDebugScreenFit.state.posX, initialDebugScreenFit.state.posY, initialDebugScreenFit.state.posZ)
  );
  const screenGizmoLiveRef = useRef<DebugScreenFitState>(initialDebugScreenFit.state);
  const introStartMsRef = useRef(0);
  const introBlackoutCompleteRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBootPendingRef = useRef(false);
  const audioBootPlayedRef = useRef(false);
  const bootStingerTimerRef = useRef<number | null>(null);
  const debugConfig = useMemo(() => {
    const source = qs ?? (typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null);
    const getNum = (k: string, d: number) => {
      const v = source?.get(k);
      if (v == null) return d;
      const n = Number(v);
      return Number.isFinite(n) ? n : d;
    };
    const DEBUG = source?.get("debug") === "1" || source?.get("debugMeshes") === "1";
    const DEBUG_PICKING = source?.get("debug") === "1";
    const DEBUG_MESHES = DEBUG && source?.get("debugMeshes") === "1";
    const USE_HARDCODED = source?.get("useHardcoded") === "1";
    const CLEAR_FIT = source?.get("clearFit") === "1";
    const FORCE_SCREEN = (source?.get("screen") ?? "").trim();
    const CLEAR_SCREEN = source?.get("clearScreen") === "1";
    const CLEAR_HIDDEN = source?.get("clearHidden") === "1";
    const NO_AUTO_HIDE = true;
    const FORCE_BODY = (source?.get("body") ?? "").trim();
    const FORCE_KEYBOARD = (source?.get("keyboard") ?? "").trim();
    const FORCE_KEEPROOT = (source?.get("keepRoot") ?? "").trim();
    const FORCE_HIDE = (source?.get("hide") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const FORCE_KEEP = (source?.get("keep") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const FALLBACK_SCALE_X = getNum("sx", FALLBACK_SCALE_X_DEFAULT);
    const FALLBACK_SCALE_Y = getNum("sy", FALLBACK_SCALE_Y_DEFAULT);
    const FALLBACK_OFFSET_X = getNum("ox", FALLBACK_OFFSET_X_DEFAULT);
    const FALLBACK_OFFSET_Y = getNum("oy", FALLBACK_OFFSET_Y_DEFAULT);
    const FALLBACK_OFFSET_Z = getNum("oz", FALLBACK_OFFSET_Z_DEFAULT);
    return {
      DEBUG,
      DEBUG_PICKING,
      DEBUG_MESHES,
      USE_HARDCODED,
      CLEAR_FIT,
      FORCE_SCREEN,
      CLEAR_SCREEN,
      CLEAR_HIDDEN,
      NO_AUTO_HIDE,
      FORCE_BODY,
      FORCE_KEYBOARD,
      FORCE_KEEPROOT,
      FORCE_HIDE,
      FORCE_KEEP,
      FALLBACK_SCALE_X,
      FALLBACK_SCALE_Y,
      FALLBACK_OFFSET_X,
      FALLBACK_OFFSET_Y,
      FALLBACK_OFFSET_Z,
      forceScreenLC: FORCE_SCREEN.toLowerCase(),
      forceBodyLC: FORCE_BODY.toLowerCase(),
      forceKeyboardLC: FORCE_KEYBOARD.toLowerCase(),
      forceKeepRootLC: FORCE_KEEPROOT.toLowerCase(),
      forceHideLC: FORCE_HIDE.map((s) => s.toLowerCase()),
      forceKeepLC: FORCE_KEEP.map((s) => s.toLowerCase()),
    };
  }, [qs]);
  const {
    DEBUG,
    DEBUG_PICKING,
    DEBUG_MESHES,
    USE_HARDCODED,
    CLEAR_FIT,
    FORCE_SCREEN,
    CLEAR_SCREEN,
    CLEAR_HIDDEN,
    NO_AUTO_HIDE,
    FORCE_BODY,
    FORCE_KEYBOARD,
    FORCE_KEEPROOT,
    FORCE_HIDE,
    FORCE_KEEP,
    FALLBACK_SCALE_X,
    FALLBACK_SCALE_Y,
    FALLBACK_OFFSET_X,
    FALLBACK_OFFSET_Y,
    FALLBACK_OFFSET_Z,
    forceScreenLC,
    forceBodyLC,
    forceKeyboardLC,
    forceKeepRootLC,
    forceHideLC,
    forceKeepLC,
  } = debugConfig;
  const debugControlsArmed = DEBUG_PICKING;

  const applyScreenGizmoState = useCallback((nextState: DebugScreenFitState) => {
    const next = sanitizeDebugScreenFitState(nextState);
    screenGizmoLiveRef.current = next;
    screenGizmoBasePosRef.current.set(next.posX, next.posY, next.posZ);
    screenGizmoReadyRef.current = true;
    setPosX(next.posX);
    setPosY(next.posY);
    setPosZ(next.posZ);
    setRotXDeg(next.rotXDeg);
    setRotYDeg(next.rotYDeg);
    setRotZDeg(next.rotZDeg);
    setWidth(next.width);
    setHeight(next.height);
    setPush(next.push);
  }, []);

  const mutateScreenGizmoState = useCallback(
    (mutator: (previous: DebugScreenFitState) => DebugScreenFitState, keyLabel: string) => {
      const next = sanitizeDebugScreenFitState(mutator({ ...screenGizmoLiveRef.current }));
      applyScreenGizmoState(next);
      setDebugLastKey(keyLabel);
    },
    [applyScreenGizmoState]
  );

  const nudgeScreenPosition = useCallback(
    (dx: number, dy: number, dz: number, keyLabel: string) => {
      mutateScreenGizmoState(
        (prev) => ({
          ...prev,
          posX: prev.posX + dx,
          posY: prev.posY + dy,
          posZ: prev.posZ + dz,
        }),
        keyLabel
      );
    },
    [mutateScreenGizmoState]
  );

  const nudgeScreenRotation = useCallback(
    (dXDeg: number, dYDeg: number, dZDeg: number, keyLabel: string) => {
      mutateScreenGizmoState(
        (prev) => ({
          ...prev,
          rotXDeg: prev.rotXDeg + dXDeg,
          rotYDeg: prev.rotYDeg + dYDeg,
          rotZDeg: prev.rotZDeg + dZDeg,
        }),
        keyLabel
      );
    },
    [mutateScreenGizmoState]
  );

  const nudgeScreenSize = useCallback(
    (dWidth: number, dHeight: number, keyLabel: string) => {
      mutateScreenGizmoState(
        (prev) => ({
          ...prev,
          width: prev.width + dWidth,
          height: prev.height + dHeight,
        }),
        keyLabel
      );
    },
    [mutateScreenGizmoState]
  );

  const nudgeScreenPush = useCallback(
    (dPush: number, keyLabel: string) => {
      mutateScreenGizmoState(
        (prev) => ({
          ...prev,
          push: prev.push + dPush,
        }),
        keyLabel
      );
    },
    [mutateScreenGizmoState]
  );

  const resetScreenGizmo = useCallback(() => {
    applyScreenGizmoState(screenGizmoDefaultsRef.current);
    setDebugLastKey("R");
  }, [applyScreenGizmoState]);

  const copyScreenGizmo = useCallback(() => {
    const next = sanitizeDebugScreenFitState(screenGizmoLiveRef.current);
    const payload = {
      posX: next.posX,
      posY: next.posY,
      posZ: next.posZ,
      rotXDeg: next.rotXDeg,
      rotYDeg: next.rotYDeg,
      rotZDeg: next.rotZDeg,
      width: next.width,
      height: next.height,
      push: next.push,
    };
    const text = JSON.stringify(payload, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
    console.log("[work] screenFit.v1", payload);
    setDebugLastKey("C");
  }, []);

  useEffect(() => {
    const next = sanitizeDebugScreenFitState({
      posX,
      posY,
      posZ,
      rotXDeg,
      rotYDeg,
      rotZDeg,
      width,
      height,
      push,
    });
    screenGizmoLiveRef.current = next;
    screenGizmoBasePosRef.current.set(next.posX, next.posY, next.posZ);
  }, [posX, posY, posZ, rotXDeg, rotYDeg, rotZDeg, width, height, push]);

  useEffect(() => {
    if (!DEBUG_PICKING || !screenGizmoReadyRef.current) return;
    try {
      window.localStorage.setItem(WORK_SCREEN_FIT_V1_STORAGE_KEY, JSON.stringify(screenGizmoLiveRef.current));
    } catch {
      // Ignore storage write failures in private mode.
    }
  }, [DEBUG_PICKING, posX, posY, posZ, rotXDeg, rotYDeg, rotZDeg, width, height, push]);

  useEffect(() => {
    if (!DEBUG_PICKING) return;
    const onWindowDebugKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement & { isContentEditable?: boolean }).isContentEditable === true);
      if (typing) return;

      const moveStep = event.shiftKey ? 0.001 : 0.01;
      const sizeStep = event.shiftKey ? 0.005 : 0.01;
      const pushStep = event.shiftKey ? 0.0005 : 0.001;
      let handled = false;

      if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        nudgeScreenRotation(0, event.key === "ArrowLeft" ? -0.5 : 0.5, 0, `Alt+${event.key}`);
        handled = true;
      } else {
        switch (event.key) {
          case "ArrowLeft":
            nudgeScreenPosition(-moveStep, 0, 0, "ArrowLeft");
            handled = true;
            break;
          case "ArrowRight":
            nudgeScreenPosition(moveStep, 0, 0, "ArrowRight");
            handled = true;
            break;
          case "ArrowUp":
            nudgeScreenPosition(0, moveStep, 0, "ArrowUp");
            handled = true;
            break;
          case "ArrowDown":
            nudgeScreenPosition(0, -moveStep, 0, "ArrowDown");
            handled = true;
            break;
          case "[":
            nudgeScreenSize(-sizeStep, 0, "[");
            handled = true;
            break;
          case "]":
            nudgeScreenSize(sizeStep, 0, "]");
            handled = true;
            break;
          case ";":
            nudgeScreenSize(0, -sizeStep, ";");
            handled = true;
            break;
          case "'":
            nudgeScreenSize(0, sizeStep, "'");
            handled = true;
            break;
          case "r":
          case "R":
            resetScreenGizmo();
            handled = true;
            break;
          case "c":
          case "C":
            copyScreenGizmo();
            handled = true;
            break;
          case ",":
            nudgeScreenPush(-pushStep, ",");
            handled = true;
            break;
          case ".":
            nudgeScreenPush(pushStep, ".");
            handled = true;
            break;
          default:
            handled = false;
        }
      }

      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("keydown", onWindowDebugKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onWindowDebugKeyDown);
  }, [
    DEBUG_PICKING,
    copyScreenGizmo,
    nudgeScreenPosition,
    nudgeScreenPush,
    nudgeScreenRotation,
    nudgeScreenSize,
    resetScreenGizmo,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const nextQs = new URLSearchParams(window.location.search);
      if (nextQs.get("clearFit") === "1") {
        try {
          window.localStorage.removeItem(WORK_SCREEN_FIT_V1_STORAGE_KEY);
        } catch {
          // Ignore storage errors.
        }
      }
      setQs(nextQs);
      setMounted(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const terminalModelUrl = TERMINAL_URL;

  useEffect(() => {
    dragMaxRef.current = dragMax;
  }, [dragMax]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    authedRef.current = authed;
  }, [authed]);

  useEffect(() => {
    typedCountRef.current = typedCount;
  }, [typedCount]);

  useEffect(() => {
    if (phase === "intro" || phase === "flash" || phase === "boot" || phase === "dossier") {
      canvasReadyRef.current = true;
    }
  }, [phase]);

  useEffect(() => {
    introCompleteRef.current = introComplete;
  }, [introComplete]);

  useEffect(() => {
    if (DEBUG) {
      console.log("[work] PASS v10 active");
    }
    introStartMsRef.current = performance.now();
  }, [DEBUG]);

  const sanitizedSections = useMemo(() => {
    return sections.map((section) => ({
      heading: sanitizeHeading(section.heading),
      body: section.body
        .map((line, index) => sanitizeLine(line, index))
        .filter((line) => line.length > 0),
    }));
  }, [sections]);

  useEffect(() => {
    sanitizedSectionsRef.current = sanitizedSections;
  }, [sanitizedSections]);

  const scrollTerminal = useCallback((factor: number) => {
    const element = dossierScrollRef.current;
    const base = element ? element.clientHeight : (screenOverlayRef.current?.clientHeight ?? 360);
    const delta = Math.max(64, base * factor);
    if (element) {
      element.scrollBy({
        top: delta,
        behavior: reducedMotionRef.current ? "auto" : "smooth",
      });
      canvasScrollRef.current = element.scrollTop;
    } else {
      canvasScrollRef.current = Math.min(canvasMaxScrollRef.current, canvasScrollRef.current + delta);
    }
  }, []);

  useEffect(() => {
    scrollTerminalRef.current = scrollTerminal;
  }, [scrollTerminal]);

  const getAudioContext = useCallback(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }
    return audioContextRef.current;
  }, []);

  const playNoiseTick = useCallback((context: AudioContext, when: number, level: number, duration: number) => {
    const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      const taper = 1 - i / sampleCount;
      data[i] = (Math.random() * 2 - 1) * taper;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(2400, when);
    filter.Q.setValueAtTime(1.1, when);
    const gain = context.createGain();
    gain.gain.setValueAtTime(level, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(when);
    source.stop(when + duration + 0.01);
  }, []);

  const playBootStinger = useCallback(() => {
    if (audioBootPlayedRef.current) return;
    const context = getAudioContext();
    if (!context) return;
    if (context.state !== "running") {
      audioBootPendingRef.current = true;
      return;
    }
    audioBootPendingRef.current = false;
    audioBootPlayedRef.current = true;
    const now = context.currentTime;
    const hissDuration = 0.16;
    const hissSamples = Math.max(1, Math.floor(context.sampleRate * hissDuration));
    const hissBuffer = context.createBuffer(1, hissSamples, context.sampleRate);
    const hissData = hissBuffer.getChannelData(0);
    for (let i = 0; i < hissSamples; i += 1) {
      const t = i / hissSamples;
      hissData[i] = (Math.random() * 2 - 1) * (0.8 - t * 0.45);
    }
    const hissSource = context.createBufferSource();
    hissSource.buffer = hissBuffer;
    const hissFilter = context.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.setValueAtTime(1800, now);
    hissFilter.Q.setValueAtTime(0.9, now);
    const hissGain = context.createGain();
    hissGain.gain.setValueAtTime(0.0001, now);
    hissGain.gain.exponentialRampToValueAtTime(0.036, now + 0.025);
    hissGain.gain.exponentialRampToValueAtTime(0.0001, now + hissDuration);
    hissSource.connect(hissFilter).connect(hissGain).connect(context.destination);
    hissSource.start(now);
    hissSource.stop(now + hissDuration + 0.02);

    const relayOsc = context.createOscillator();
    relayOsc.type = "square";
    relayOsc.frequency.setValueAtTime(220, now + 0.018);
    relayOsc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
    const relayGain = context.createGain();
    relayGain.gain.setValueAtTime(0.0001, now + 0.018);
    relayGain.gain.exponentialRampToValueAtTime(0.032, now + 0.024);
    relayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    relayOsc.connect(relayGain).connect(context.destination);
    relayOsc.start(now + 0.018);
    relayOsc.stop(now + 0.062);
    playNoiseTick(context, now + 0.016, 0.01, 0.02);
  }, [getAudioContext, playNoiseTick]);

  const playAuthBeep = useCallback(() => {
    const context = getAudioContext();
    if (!context || context.state !== "running") return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.016);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    const oscillator = context.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(980, now);
    oscillator.frequency.exponentialRampToValueAtTime(1160, now + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
    playNoiseTick(context, now + 0.008, 0.008, 0.028);
  }, [getAudioContext, playNoiseTick]);

  useEffect(() => {
    const context = getAudioContext();
    const unlockAudio = () => {
      if (!context || context.state === "running") {
        if (audioBootPendingRef.current && !audioBootPlayedRef.current && !introCompleteRef.current) {
          playBootStinger();
        }
        return;
      }
      context.resume().catch(() => undefined);
      if (audioBootPendingRef.current && !audioBootPlayedRef.current && !introCompleteRef.current) {
        window.setTimeout(() => playBootStinger(), 0);
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { passive: true });
    bootStingerTimerRef.current = window.setTimeout(() => {
      if (!introCompleteRef.current) playBootStinger();
    }, Math.round(INTRO_BOOT_BLACK_END * 1000));
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      if (bootStingerTimerRef.current !== null) {
        window.clearTimeout(bootStingerTimerRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }
    };
  }, [getAudioContext, playBootStinger]);

  const skipIntro = useCallback(() => {
    if (introCompleteRef.current) return;
    introBlackoutCompleteRef.current = true;
    introCompleteRef.current = true;
    setIntroComplete(true);
  }, []);

  const startScreenZoom = useCallback(() => {
    if (viewModeRef.current === "screen" || viewModeRef.current === "zooming") return;
    prepareZoomTargetRef.current();
    zoomStartPoseCapturedRef.current = false;
    if (reducedMotionRef.current) {
      zoomProgressRef.current = 1;
      zoomStartMsRef.current = null;
      viewModeRef.current = "screen";
      setViewMode("screen");
      return;
    }
    zoomStartMsRef.current = performance.now();
    zoomProgressRef.current = 0;
    viewModeRef.current = "zooming";
    setViewMode("zooming");
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!reducedMotion || introCompleteRef.current) return;
    const id = window.setTimeout(() => setIntroComplete(true), 0);
    return () => window.clearTimeout(id);
  }, [reducedMotion]);

  useEffect(() => {
    const unsubscribe = badgeY.on("change", (value) => {
      const progress = clamp01(value / Math.max(1, dragMaxRef.current));
      swipeProgressRef.current = progress;
    });

    return () => {
      unsubscribe();
    };
  }, [badgeY]);

  useEffect(() => {
    if (USE_GLB_TERMINAL) return;
    if (!authed) return;

    let intervalId: number | null = null;
    const timeoutIds: number[] = [];

    timeoutIds.push(
      window.setTimeout(() => {
        setPhase("flash");
        setTypedCount(0);
      }, 0)
    );
    timeoutIds.push(
      window.setTimeout(() => {
        setPhase("boot");
      }, 640)
    );

    timeoutIds.push(
      window.setTimeout(() => {
        let index = 0;
        intervalId = window.setInterval(() => {
          index += 1;
          setTypedCount(index);

          if (index >= BOOT_LINES.length) {
            if (intervalId !== null) {
              window.clearInterval(intervalId);
              intervalId = null;
            }
            timeoutIds.push(
              window.setTimeout(() => {
                setPhase("dossier");
              }, 340)
            );
          }
        }, 180);
      }, 860)
    );

    return () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      timeoutIds.forEach((id) => window.clearTimeout(id));
    };
  }, [authed]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new ResizeObserver(() => {
      const next = Math.max(120, Math.min(250, root.clientHeight * 0.34));
      setDragMax(next);
      if (badgeY.get() > next && !authedRef.current) {
        badgeY.set(next);
      }
    });

    observer.observe(root);
    return () => observer.disconnect();
  }, [badgeY]);

  useEffect(() => {
    if (!mounted) return;
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;
    console.info(`[work] fit source: ${DEBUG_PICKING && initialDebugScreenFit.fromStorage ? "localStorage" : "default"}`);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const baseToneMappingExposure = 0.88;
    renderer.toneMappingExposure = DEBUG_VISIBILITY_LIFT
      ? baseToneMappingExposure * DEBUG_EXPOSURE_MULTIPLIER
      : baseToneMappingExposure;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);
    const drawingBufferSize = new THREE.Vector2();
    const resetRendererViewport = () => {
      renderer.getDrawingBufferSize(drawingBufferSize);
      const fullWidth = Math.max(1, Math.floor(drawingBufferSize.x));
      const fullHeight = Math.max(1, Math.floor(drawingBufferSize.y));
      // Defensive reset so any temporary scissor/viewport usage cannot crop the main render.
      renderer.setScissorTest(false);
      renderer.setScissor(0, 0, fullWidth, fullHeight);
      renderer.setViewport(0, 0, fullWidth, fullHeight);
    };
    resetRendererViewport();

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(33, mount.clientWidth / Math.max(1, mount.clientHeight), 0.025, 90);
    camera.updateProjectionMatrix();
    const cameraBase = new THREE.Vector3(0.22, 1.55, 5.35);
    camera.position.copy(cameraBase);
    if (CLEAR_SCREEN) {
      try {
        window.localStorage.removeItem(WORK_SCREEN_PATH_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    }
    if (CLEAR_HIDDEN) {
      try {
        window.localStorage.removeItem(WORK_HIDDEN_PATHS_STORAGE_KEY);
      } catch {
        // ignore storage failures
      }
    }
    const readLocalStorageString = (key: string) => {
      try {
        return window.localStorage.getItem(key) ?? "";
      } catch {
        return "";
      }
    };
    const readStoredHiddenPaths = () => {
      return [] as string[];
    };
    const storedScreenPath = readLocalStorageString(WORK_SCREEN_PATH_STORAGE_KEY).trim();
    const persistedScreenPath = storedScreenPath.includes("__screenAnchor") ? "" : storedScreenPath;
    const hiddenPathSet = new Set<string>(readStoredHiddenPaths());
    const nonPersistentHiddenPathSet = new Set<string>();
    let hiddenSlabMesh: THREE.Mesh | null = null;
    let hiddenSlabPath = "none";
    let pendingSlabHidePass = false;
    let lastSlabFitSignature = "";
    let isFallbackScreen = false;
    let forceFallbackMode = false;
    let screenCandidatesCount = 0;
    let modelRootBBoxDiag = 0;
    let fallbackAutoHideCount = 0;
    let autoHiddenThisLoadPath = "";
    const persistScreenPath = (path: string, selectedMesh?: THREE.Mesh | null) => {
      let finalPath = path.trim();
      if (finalPath.includes("__screenAnchor")) {
        finalPath = selectedMesh ? objPath(selectedMesh).trim() : "";
      }
      if (!finalPath || finalPath.includes("__screenAnchor")) return;
      try {
        if (finalPath.trim().length === 0) {
          window.localStorage.removeItem(WORK_SCREEN_PATH_STORAGE_KEY);
        } else {
          window.localStorage.setItem(WORK_SCREEN_PATH_STORAGE_KEY, finalPath);
        }
      } catch {
        // ignore storage failures
      }
    };
    const persistHiddenPaths = () => {
      // Disabled: we no longer auto-hide/persist occluder mesh state.
    };
    const allGlbMeshes: THREE.Mesh[] = [];
    let latestHiddenPath = hiddenPathSet.size > 0 ? Array.from(hiddenPathSet)[hiddenPathSet.size - 1] : "";
    let autoOccluderFramesRemaining = 0;
    let autoOccluderStableFrames = 0;
    let screenSampleSurface: THREE.Object3D | null = null;
    let screenSampleWidth = FALLBACK_SCREEN_LOCAL_WIDTH * FALLBACK_INSET;
    let screenSampleHeight = FALLBACK_SCREEN_LOCAL_HEIGHT * FALLBACK_INSET;
    let occluderScreenSurfaceRoot: THREE.Object3D | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDebugHiddenOccludersCount(hiddenPathSet.size);
    setDebugLatestHiddenPath(latestHiddenPath);
    setDebugCandidatesCount(0);
    setDebugForceFallbackMode(false);
    setDebugAutoHiddenThisLoad("(none)");

    const stage = new THREE.Group();
    stage.position.y = -0.2;
    scene.add(stage);

    if (!USE_GLB_TERMINAL) {
      const backPlate = new THREE.Mesh(
        new THREE.PlaneGeometry(42, 22),
        new THREE.MeshBasicMaterial({
          color: 0x07110d,
          transparent: true,
          opacity: 0.26,
        })
      );
      backPlate.position.set(0, 4.3, -10.5);
      stage.add(backPlate);
    }

    const ambient = new THREE.AmbientLight(0x9ebaa8, DEBUG_VISIBILITY_LIFT ? 0.34 : 0.26);
    scene.add(ambient);
    const envFill = new THREE.HemisphereLight(0x9fc7b0, 0x020404, 0.26);
    scene.add(envFill);

    const key = new THREE.DirectionalLight(0xf3fff2, DEBUG_VISIBILITY_LIFT ? 2.34 : 2.06);
    key.position.set(2.6, 4.6, 2.9);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x8fb39e, DEBUG_VISIBILITY_LIFT ? 0.64 : 0.54);
    fill.position.set(-3.7, 2.7, 3.4);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x6ce09f, DEBUG_VISIBILITY_LIFT ? 0.92 : 0.8);
    rim.position.set(1.24, 1.96, -4.7);
    scene.add(rim);

    const rearRim = new THREE.DirectionalLight(0x59b786, DEBUG_VISIBILITY_LIFT ? 0.52 : 0.4);
    rearRim.position.set(-2.5, 1.45, -5.4);
    scene.add(rearRim);

    const formKey = new THREE.DirectionalLight(0xe7fff0, DEBUG_VISIBILITY_LIFT ? 0.48 : 0.26);
    formKey.position.set(-2.8, 3.6, 3.9);
    scene.add(formKey);

    const stationRoot = new THREE.Group();
    stationRoot.position.set(0, 0.24, 0.16);
    stationRoot.scale.setScalar(1);
    stage.add(stationRoot);

    const shadowTexture = makeRadialShadowTexture(256);
    const chassisNoiseTexture = makeNoiseTexture(196, 0.16);
    const keyNoiseTexture = makeNoiseTexture(96, 0.14);

    const terminal = new THREE.Group();
    terminal.position.set(0.04, 0.64, -0.14);
    stationRoot.add(terminal);

    const shellMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG_VISIBILITY_LIFT ? 0x23312b : 0x1a201e,
      roughness: DEBUG_VISIBILITY_LIFT ? 0.62 : 0.64,
      roughnessMap: chassisNoiseTexture ?? undefined,
      metalness: DEBUG_VISIBILITY_LIFT ? 0.12 : 0.14,
    });
    const shellDarkMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG_VISIBILITY_LIFT ? 0x1b2521 : 0x0d1210,
      roughness: DEBUG_VISIBILITY_LIFT ? 0.72 : 0.78,
      metalness: DEBUG_VISIBILITY_LIFT ? 0.12 : 0.08,
    });
    const metalTrimMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG_VISIBILITY_LIFT ? 0x909c96 : 0x74807a,
      roughness: DEBUG_VISIBILITY_LIFT ? 0.32 : 0.34,
      metalness: DEBUG_VISIBILITY_LIFT ? 0.8 : 0.78,
    });
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG_VISIBILITY_LIFT ? 0x55635d : 0x3b4541,
      roughness: DEBUG_VISIBILITY_LIFT ? 0.38 : 0.42,
      roughnessMap: chassisNoiseTexture ?? undefined,
      metalness: DEBUG_VISIBILITY_LIFT ? 0.74 : 0.66,
    });

    const screenW = 2.02;
    const screenH = 1.14;
    canvasPaintedRef.current = false;
    canvasPresentedFramesRef.current = 0;

    const keyCapMaterial = new THREE.MeshStandardMaterial({
      color: DEBUG_VISIBILITY_LIFT ? 0x636f68 : 0x47544d,
      roughness: DEBUG_VISIBILITY_LIFT ? 0.42 : 0.46,
      roughnessMap: keyNoiseTexture ?? undefined,
      metalness: DEBUG_VISIBILITY_LIFT ? 0.18 : 0.22,
      emissive: DEBUG_VISIBILITY_LIFT ? 0x1f3a2b : 0x193125,
      emissiveIntensity: DEBUG_VISIBILITY_LIFT ? 0.15 : 0.12,
    });

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1024;
    screenCanvas.height = 768;
    const screenContext = screenCanvas.getContext("2d");
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    screenTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (screenContext) {
      const w = screenCanvas.width;
      const h = screenCanvas.height;
      screenContext.fillStyle = "#020a05";
      screenContext.fillRect(0, 0, w, h);
      screenContext.fillStyle = "rgba(132,255,184,0.96)";
      screenContext.font = "700 50px ui-monospace, SFMono-Regular, Menlo, monospace";
      screenContext.textAlign = "center";
      screenContext.textBaseline = "middle";
      screenContext.fillText("TOP SECRET CLEARANCE REQUIRED", w * 0.5, h * 0.5);
      canvasReadyRef.current = true;
      canvasPaintedRef.current = true;
    }
    screenTexture.needsUpdate = true;

    const screenMaterial = new THREE.MeshBasicMaterial({
      map: screenTexture,
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: false,
      opacity: 1,
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3d5f51,
      roughness: 0.12,
      metalness: 0.02,
      transparent: true,
      opacity: DEBUG_VISIBILITY_LIFT ? 0.2 : 0.22,
      depthWrite: false,
      ior: 1.42,
      transmission: 0.92,
      thickness: 0.02,
      toneMapped: false,
    });

    const screenTopLeft = new THREE.Object3D();
    screenTopLeft.position.set(-screenW * 0.5, 0.62 + screenH * 0.5, 1.2);
    terminal.add(screenTopLeft);

    const screenTopRight = new THREE.Object3D();
    screenTopRight.position.set(screenW * 0.5, 0.62 + screenH * 0.5, 1.2);
    terminal.add(screenTopRight);

    const screenBottomLeft = new THREE.Object3D();
    screenBottomLeft.position.set(-screenW * 0.5, 0.62 - screenH * 0.5, 1.2);
    terminal.add(screenBottomLeft);

    const screenBottomRight = new THREE.Object3D();
    screenBottomRight.position.set(screenW * 0.5, 0.62 - screenH * 0.5, 1.2);
    terminal.add(screenBottomRight);

    const screenCenterAnchor = new THREE.Object3D();
    screenCenterAnchor.position.set(0, 0.62, 1.12);
    terminal.add(screenCenterAnchor);
    let screenSurface: THREE.Object3D = screenCenterAnchor;

    const terminalModelRoot = new THREE.Group();
    terminalModelRoot.visible = false;
    terminal.add(terminalModelRoot);
    const fitProxy = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2.6, 2.8),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, depthTest: false })
    );
    fitProxy.position.set(0, 0, 0.24);
    terminalModelRoot.add(fitProxy);

    const refreshScreenAnchors = (surface: THREE.Object3D, width: number, height: number, zOffset: number) => {
      surface.add(screenTopLeft, screenTopRight, screenBottomLeft, screenBottomRight, screenCenterAnchor);
      screenTopLeft.position.set(-width * 0.5, height * 0.5, zOffset);
      screenTopRight.position.set(width * 0.5, height * 0.5, zOffset);
      screenBottomLeft.position.set(-width * 0.5, -height * 0.5, zOffset);
      screenBottomRight.position.set(width * 0.5, -height * 0.5, zOffset);
      screenCenterAnchor.position.set(0, 0, zOffset);
    };
    const hideOccluderMesh = (mesh: THREE.Mesh, makePersistent = true) => {
      const path = objPath(mesh);
      const isNew = !hiddenPathSet.has(path);
      hiddenPathSet.add(path);
      if (!makePersistent) {
        nonPersistentHiddenPathSet.add(path);
      } else {
        nonPersistentHiddenPathSet.delete(path);
      }
      mesh.visible = false;
      latestHiddenPath = path;
      setDebugLatestHiddenPath(path);
      setDebugHiddenOccludersCount(hiddenPathSet.size);
      persistHiddenPaths();
      return isNew;
    };
    const unhideOccluderMesh = (mesh: THREE.Mesh) => {
      const path = objPath(mesh);
      hiddenPathSet.delete(path);
      nonPersistentHiddenPathSet.delete(path);
      mesh.visible = true;
      latestHiddenPath = path;
      setDebugLatestHiddenPath(path);
      setDebugHiddenOccludersCount(hiddenPathSet.size);
      persistHiddenPaths();
    };
    const occluderRaycaster = new THREE.Raycaster();
    const runAutoOccluderPass = () => {
      if (NO_AUTO_HIDE) return false;
      if (!screenSampleSurface || allGlbMeshes.length === 0) return false;
      if (modelRootBBoxDiag <= 0) return false;
      if (forceFallbackMode && fallbackAutoHideCount >= FALLBACK_AUTO_HIDE_MAX_PER_LOAD) return false;
      const insetX = screenSampleWidth * 0.5 * OCCLUDER_INSET_FACTOR;
      const insetY = screenSampleHeight * 0.5 * OCCLUDER_INSET_FACTOR;
      const samplePointsLocal: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-insetX, insetY, 0),
        new THREE.Vector3(insetX, insetY, 0),
        new THREE.Vector3(-insetX, -insetY, 0),
        new THREE.Vector3(insetX, -insetY, 0),
      ];
      let hidAny = false;
      for (const sampleLocal of samplePointsLocal) {
        const sampleWorld = screenSampleSurface.localToWorld(sampleLocal.clone());
        const toPoint = sampleWorld.clone().sub(camera.position);
        const distanceToScreenPoint = toPoint.length();
        if (distanceToScreenPoint <= 1e-4) continue;
        const direction = toPoint.normalize();
        occluderRaycaster.near = 0;
        occluderRaycaster.far = Math.max(0.001, distanceToScreenPoint - OCCLUDER_RAY_EPSILON);
        occluderRaycaster.set(camera.position, direction);
        const hits = occluderRaycaster.intersectObjects(allGlbMeshes, false);
        if (hits.length === 0) continue;
        const firstHit = hits[0];
        if (
          occluderScreenSurfaceRoot &&
          isDescendantOf(firstHit.object, occluderScreenSurfaceRoot)
        ) {
          continue;
        }
        if (firstHit.distance < distanceToScreenPoint - OCCLUDER_RAY_EPSILON) {
          const mesh = firstHit.object as THREE.Mesh;
          if (!mesh.visible) continue;
          if (mesh.children.length > 0) continue;
          const meshBox = new THREE.Box3().setFromObject(mesh);
          const meshSize = meshBox.getSize(new THREE.Vector3());
          const meshDiag = meshSize.length();
          const maxAllowedDiag =
            modelRootBBoxDiag * (forceFallbackMode ? FORCE_FALLBACK_OCCLUDER_MAX_MESH_DIAG_RATIO : OCCLUDER_MAX_MESH_DIAG_RATIO);
          if (maxAllowedDiag > 0 && meshDiag > maxAllowedDiag) continue;
          if (forceFallbackMode) {
            const hitLocal = screenSampleSurface.worldToLocal(firstHit.point.clone());
            const halfW = screenSampleWidth * 0.5 * FALLBACK_SCREEN_CENTER_INSET_FACTOR;
            const halfH = screenSampleHeight * 0.5 * FALLBACK_SCREEN_CENTER_INSET_FACTOR;
            if (Math.abs(hitLocal.x) > halfW || Math.abs(hitLocal.y) > halfH) continue;
          }
          const makePersistent = !forceFallbackMode;
          if (hideOccluderMesh(mesh, makePersistent)) {
            hidAny = true;
            if (!autoHiddenThisLoadPath) {
              autoHiddenThisLoadPath = objPath(mesh);
              setDebugAutoHiddenThisLoad(autoHiddenThisLoadPath);
            }
            if (forceFallbackMode) {
              fallbackAutoHideCount += 1;
              if (fallbackAutoHideCount >= FALLBACK_AUTO_HIDE_MAX_PER_LOAD) {
                break;
              }
            }
          }
        }
      }
      return hidAny;
    };

    const slabScreenCenter = new THREE.Vector3();
    const slabScreenNormal = new THREE.Vector3();
    const slabScreenQuat = new THREE.Quaternion();
    const slabBox = new THREE.Box3();
    const slabSize = new THREE.Vector3();
    const slabCenter = new THREE.Vector3();
    const triA = new THREE.Vector3();
    const triB = new THREE.Vector3();
    const triC = new THREE.Vector3();
    const triAB = new THREE.Vector3();
    const triAC = new THREE.Vector3();

    const triWorldNormal = (mesh: THREE.Mesh) => {
      const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
      if (!geometry) return null;
      const pos = geometry?.getAttribute("position");
      if (!(pos instanceof THREE.BufferAttribute) || pos.count < 3) return null;
      let ia = 0;
      let ib = 1;
      let ic = 2;
      const idx = geometry.getIndex();
      if (idx && idx.count >= 3) {
        ia = idx.getX(0);
        ib = idx.getX(1);
        ic = idx.getX(2);
      }
      triA.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld);
      triB.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld);
      triC.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      triAB.subVectors(triB, triA);
      triAC.subVectors(triC, triA);
      const n = triAB.cross(triAC);
      if (n.lengthSq() < 1e-12) return null;
      return n.normalize().clone();
    };

    const hideBlockingSlab = () => {
      const screenMesh = screenMeshRef.current;
      const terminalRoot = terminalRootRef.current;
      if (!screenMesh || !terminalRoot) {
        hiddenSlabPath = "none";
        return hiddenSlabPath;
      }

      screenMesh.updateMatrixWorld(true);
      screenMesh.getWorldPosition(slabScreenCenter);
      screenMesh.getWorldQuaternion(slabScreenQuat);
      slabScreenNormal.set(0, 0, 1).applyQuaternion(slabScreenQuat).normalize();

      let bestMesh: THREE.Mesh | null = null;
      let bestPath = "none";
      let bestScore = -Infinity;
      terminalRoot.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh || mesh === screenMesh || !mesh.visible) return;
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();

        slabBox.setFromObject(mesh);
        if (slabBox.isEmpty()) return;
        slabBox.getSize(slabSize);
        slabBox.getCenter(slabCenter);
        const dims = [slabSize.x, slabSize.y, slabSize.z].sort((a, b) => a - b);
        const a = dims[0];
        const b = dims[1];
        const c = dims[2];
        if (c <= 1e-6) return;
        const slabCandidate = a / c < 0.12;
        if (!slabCandidate) return;
        const closeToScreen = slabCenter.distanceTo(slabScreenCenter) < c * 1.2;
        if (!closeToScreen) return;

        const nTri = triWorldNormal(mesh);
        const facing = nTri ? Math.abs(nTri.dot(slabScreenNormal)) > 0.6 : false;
        const area = b * c;
        let score = area + (facing ? area : 0);
        if (!nTri) score *= 0.7;
        if (score > bestScore) {
          bestScore = score;
          bestMesh = mesh;
          bestPath = objPath(mesh);
        }
      });
      const selectedSlabMesh = bestMesh as THREE.Mesh | null;
      if (hiddenSlabMesh && hiddenSlabMesh !== selectedSlabMesh) {
        hiddenSlabMesh.visible = true;
      }

      if (selectedSlabMesh) {
        selectedSlabMesh.visible = false;
        hiddenSlabMesh = selectedSlabMesh;
        hiddenSlabPath = bestPath;
      } else {
        hiddenSlabMesh = null;
        hiddenSlabPath = "none";
      }

      setDebugLatestHiddenPath(hiddenSlabPath);
      return hiddenSlabPath;
    };

    if (USE_IMPORTED_TERMINAL) {
      const loader = new GLTFLoader();
      const desiredScreenCenter = new THREE.Vector3(0, 0.62, 1.1);
      const loadedScreenCenter = new THREE.Vector3();
      const alignmentDelta = new THREE.Vector3();
      const screenLikePattern = /(screen|display|crt|monitor)/i;
      const glassPattern = /glass/i;
      const forceHideNamePattern = /(wire|cable|cord|plate|\bboard\b|paper|sheet|doc|notebook|clutter|prop)/i;
      const workBox = new THREE.Box3();
      const workCenter = new THREE.Vector3();
      const workSize = new THREE.Vector3();

      loader.load(
        terminalModelUrl,
        (gltf: { scene: THREE.Object3D }) => {
          fallbackAutoHideCount = 0;
          isFallbackScreen = false;
          forceFallbackMode = false;
          screenCandidatesCount = 0;
          autoHiddenThisLoadPath = "";
          for (const child of [...terminalModelRoot.children]) {
            terminalModelRoot.remove(child);
          }
          terminalModelRoot.add(fitProxy);
          setDebugScreenAnchorKind("(pending)");
          setDebugSelectedScreenName("");
          setDebugSelectedScreenPath("");
          setDebugHiddenOccludersCount(0);
          setDebugIsFallbackScreen(false);
          setDebugCandidatesCount(0);
          setDebugForceFallbackMode(false);
          setDebugAutoHiddenThisLoad("(none)");
          setDebugScreenFitStatus("PENDING");
          setDebugScreenFitSize("(pending)");
          setDebugScreenFitPose("(pending)");
          bodyMeshRef.current = null;
          screenMeshRef.current = null;
          chosenScreenMeshRef.current = null;
          setDebugSelectedBodyPath("(none)");

          const modelRoot = gltf.scene;
          const modelBounds = new THREE.Box3();
          const modelSize = new THREE.Vector3();
          const candidateBounds = new THREE.Box3();
          const candidateSize = new THREE.Vector3();
          type CandidateEntry = {
            mesh: THREE.Mesh;
            name: string;
            size: THREE.Vector3;
            world: THREE.Vector3;
            area: number;
            thinLarge: boolean;
            screenish: boolean;
            glassish: boolean;
          };
          const glbCandidates: CandidateEntry[] = [];

          modelRoot.traverse((object: THREE.Object3D) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.frustumCulled = false;
            const name = mesh.name.toLowerCase();
            const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
            const positionAttr = geometry?.getAttribute("position");
            const normalAttr = geometry?.getAttribute("normal");
            if (
              geometry &&
              positionAttr instanceof THREE.BufferAttribute &&
              (!(normalAttr instanceof THREE.BufferAttribute) || normalAttr.count !== positionAttr.count)
            ) {
              geometry.computeVertexNormals();
            }

            const toPbrMaterial = (material: THREE.Material) => {
              if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
                return material;
              }
              const replacement = new THREE.MeshStandardMaterial({
                color: 0x2c312f,
                roughness: 0.72,
                metalness: 0.22,
              });
              return replacement;
            };

            const tuneMaterial = (material: THREE.Material) => {
              const pbr = toPbrMaterial(material);
              const isTrim = /(trim|bolt|screw|frame|bezel|metal|bracket)/i.test(name);
              const isKey = /(key|keyboard|kbd|button)/i.test(name);
              const isAccentKey = /(esc|enter)/i.test(name);
              if (isTrim) {
                pbr.color = new THREE.Color(0x939c98);
                pbr.roughness = 0.32;
                pbr.metalness = 0.62;
              } else if (isKey) {
                pbr.color = new THREE.Color(isAccentKey ? 0x76837c : 0x4d5752);
                pbr.roughness = 0.78;
                pbr.metalness = 0.09;
                pbr.emissive = new THREE.Color(0x0c1f14);
                pbr.emissiveIntensity = isAccentKey ? 0.2 : 0.12;
              } else {
                pbr.color = new THREE.Color(0x2a302d);
                pbr.roughness = 0.68;
                pbr.metalness = 0.24;
              }
              pbr.needsUpdate = true;
              return pbr;
            };

            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((material) => tuneMaterial(material));
            } else if (mesh.material) {
              mesh.material = tuneMaterial(mesh.material);
            }
          });
          terminalModelRoot.add(modelRoot);

          modelBounds.setFromObject(modelRoot);
          modelBounds.getSize(modelSize);
          if (modelSize.x > 0.0001) {
            const modelScale = 4.2 / modelSize.x;
            modelRoot.scale.setScalar(modelScale);
          }
          modelRoot.updateMatrixWorld(true);
          terminalRootRef.current = modelRoot;
          allGlbMeshes.length = 0;
          modelRoot.traverse((object: THREE.Object3D) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.renderOrder = 0;
            allGlbMeshes.push(mesh);
          });
          modelBounds.setFromObject(modelRoot);
          modelBounds.getSize(modelSize);
          const modelWorkBox = modelBounds.clone();
          const modelWorkCenter = modelWorkBox.getCenter(new THREE.Vector3());
          const modelWorkSize = modelWorkBox.getSize(new THREE.Vector3());
          type MeshEntry = {
            mesh: THREE.Mesh;
            name: string;
            center: THREE.Vector3;
            size: THREE.Vector3;
            volume: number;
          };
          const meshEntries: MeshEntry[] = [];
          modelRoot.traverse((object: THREE.Object3D) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh || !mesh.visible) return;
            workBox.setFromObject(mesh);
            workBox.getCenter(workCenter);
            workBox.getSize(workSize);
            meshEntries.push({
              mesh,
              name: mesh.name.toLowerCase(),
              center: workCenter.clone(),
              size: workSize.clone(),
              volume: Math.max(0.000001, workSize.x * workSize.y * workSize.z),
            });
          });
          type MeshMetaEntry = ReturnType<typeof bboxInfo> & {
            mesh: THREE.Mesh;
            type: string;
            nameLC: string;
            pathLC: string;
            vtxCount: number;
            vol: number;
            areaXY: number;
          };
          const meshMetadataEntries: MeshMetaEntry[] = meshEntries.map((entry) => {
            const info = bboxInfo(entry.mesh);
            const geometry = entry.mesh.geometry as THREE.BufferGeometry | undefined;
            const position = geometry?.getAttribute("position");
            const vtxCount =
              position && position instanceof THREE.BufferAttribute && Number.isFinite(position.count)
                ? position.count
                : 0;
            return {
              ...info,
              mesh: entry.mesh,
              type: entry.mesh.type,
              nameLC: info.name.toLowerCase(),
              pathLC: info.path.toLowerCase(),
              vtxCount,
              vol: info.vol,
              areaXY: info.w * info.h,
            };
          });
          const forcedScreenByString =
            forceScreenLC.length > 0
              ? meshMetadataEntries
                  .filter((entry) => entry.nameLC.includes(forceScreenLC) || entry.pathLC.includes(forceScreenLC))
                  .sort((a, b) => b.areaXY - a.areaXY)[0]?.mesh ?? null
              : null;
          const resolveScreenMeshByPath = (path: string) => {
            if (!path.trim()) return null;
            const object = findByPath(modelRoot, path);
            return firstMeshFromObject(object);
          };
          const forcedScreenByUrlPath = FORCE_SCREEN ? resolveScreenMeshByPath(FORCE_SCREEN) : null;
          const forcedScreenByStoredPath = persistedScreenPath ? resolveScreenMeshByPath(persistedScreenPath) : null;
          type ScreenPickCandidate = {
            mesh: THREE.Mesh;
            nameLC: string;
            pathLC: string;
            area: number;
            aspect: number;
            depthRatio: number;
            frontness: number;
            centerDist: number;
            score: number;
            kind: "priorityA" | "priorityB" | "heuristic";
          };
          const screenPickCandidates: ScreenPickCandidate[] = meshMetadataEntries
            .filter((entry) => entry.mesh.visible)
            .map((entry) => {
              const dims = [entry.w, entry.h, entry.d].sort((a, b) => b - a);
              const width = dims[0];
              const height = Math.max(1e-6, dims[1]);
              const depth = dims[2];
              const aspect = width / height;
              const depthRatio = depth / height;
              const area = width * height;
              const centerDist = Math.hypot(
                (entry.cx - modelWorkCenter.x) / Math.max(1e-6, modelWorkSize.x),
                (entry.cy - modelWorkCenter.y) / Math.max(1e-6, modelWorkSize.y)
              );
              const frontness = (entry.cz - modelWorkBox.min.z) / Math.max(1e-6, modelWorkSize.z);
              const aspectFit = 1 / (1 + Math.abs(aspect - 1.35) * 2.6);
              const planarFit = 1 / (1 + depthRatio * 14);
              const frontFit = THREE.MathUtils.clamp(frontness, 0, 1);
              const centerFit = 1 / (1 + centerDist * 1.8);
              const score = area * aspectFit * planarFit * (0.65 + frontFit * 0.35) * centerFit;
              return {
                mesh: entry.mesh,
                nameLC: entry.nameLC,
                pathLC: entry.pathLC,
                area,
                aspect,
                depthRatio,
                frontness,
                centerDist,
                score,
                kind: "heuristic",
              };
            });
          const priorityA = screenPickCandidates
            .filter((candidate) => candidate.nameLC === "crt_screen" || candidate.nameLC.includes("crt_screen"))
            .sort((lhs, rhs) => rhs.area - lhs.area);
          const priorityB = screenPickCandidates
            .filter((candidate) => candidate.nameLC.includes("screen") && candidate.depthRatio < 0.22)
            .sort((lhs, rhs) => rhs.score - lhs.score);
          const preferredCrtScreenMesh: THREE.Mesh | null = null;
          if (!preferredCrtScreenMesh) {
            const summary = meshMetadataEntries
              .slice()
              .sort((lhs, rhs) => rhs.areaXY - lhs.areaXY)
              .slice(0, 15)
              .map((entry) => ({
                name: entry.name,
                path: entry.path,
                w: Number(entry.w.toFixed(3)),
                h: Number(entry.h.toFixed(3)),
                d: Number(entry.d.toFixed(3)),
                c: [Number(entry.cx.toFixed(3)), Number(entry.cy.toFixed(3)), Number(entry.cz.toFixed(3))],
              }));
            console.warn("[work] screen selection failed; using fallback screenPlane", {
              model: terminalModelUrl,
              meshCount: meshMetadataEntries.length,
              inventoryTop: summary,
            });
          } else if (DEBUG) {
            const winnerMeta = meshMetadataEntries.find((entry) => entry.mesh === preferredCrtScreenMesh);
            console.log("[work] selected screen mesh", {
              model: terminalModelUrl,
              name: winnerMeta?.name ?? preferredCrtScreenMesh.name,
              path: winnerMeta?.path ?? objPath(preferredCrtScreenMesh),
              priority:
                forcedScreenByUrlPath && preferredCrtScreenMesh === forcedScreenByUrlPath
                  ? "url"
                  : forcedScreenByStoredPath && preferredCrtScreenMesh === forcedScreenByStoredPath
                    ? "localStorage"
                  : priorityA.some((candidate) => candidate.mesh === preferredCrtScreenMesh)
                    ? "priorityA"
                    : priorityB.some((candidate) => candidate.mesh === preferredCrtScreenMesh)
                      ? "priorityB"
                      : forcedScreenByString && preferredCrtScreenMesh === forcedScreenByString
                        ? "forced-string"
                        : "heuristic",
            });
          }

          const meshMetaByUuid = new Map<string, MeshMetaEntry>();
          meshMetadataEntries.forEach((entry) => {
            meshMetaByUuid.set(entry.mesh.uuid, {
              ...entry,
            });
          });

          const rows: ReturnType<typeof bboxInfo>[] = [];
          gltf.scene.traverse((object: THREE.Object3D) => {
            const mesh = object as THREE.Mesh;
            if (!mesh.isMesh) return;
            rows.push(bboxInfo(mesh));
          });
          if (DEBUG_MESHES) {
            const toCopy = rows.map((row) => ({
              name: row.name,
              path: row.path,
              uuid: row.uuid,
              w: Number(row.w.toFixed(6)),
              h: Number(row.h.toFixed(6)),
              d: Number(row.d.toFixed(6)),
              cx: Number(row.cx.toFixed(6)),
              cy: Number(row.cy.toFixed(6)),
              cz: Number(row.cz.toFixed(6)),
              vol: Number(row.vol.toFixed(12)),
              flatness: Number(row.flatness.toFixed(6)),
            }));
            const screenCandidatesRows = rows
              .map((row) => {
                const nameLC = row.name.toLowerCase();
                const xyMax = Math.max(row.w, row.h, 1e-6);
                const xyMin = Math.max(Math.min(row.w, row.h), 1e-6);
                const aspectXY = xyMax / xyMin;
                const centerPenalty = (Math.abs(row.cx - modelWorkCenter.x) + Math.abs(row.cz - modelWorkCenter.z)) * 1000;
                const nameBonus = /screen|crt|display|monitor/.test(nameLC) ? 2000 : 0;
                const area = row.w * row.h;
                const score = nameBonus + area - centerPenalty;
                return { ...row, area, aspectXY, score };
              })
              .filter(
                (row) =>
                  row.cy > modelWorkBox.min.y + modelWorkSize.y * 0.45 &&
                  row.flatness < 0.24 &&
                  row.aspectXY >= 1.05 &&
                  row.aspectXY <= 2.8
              )
              .sort((a, b) => b.score - a.score);
            const keyboardCandidatesRows = rows
              .map((row) => ({
                ...row,
                areaXZ: row.w * row.d,
              }))
              .filter(
                (row) =>
                  row.cy < modelWorkBox.min.y + modelWorkSize.y * 0.55 &&
                  Math.max(row.w, row.d) > modelWorkSize.x * 0.28 &&
                  row.h < modelWorkSize.y * 0.24
              )
              .sort((a, b) => b.areaXZ - a.areaXZ);

            const globalTarget = window as Window & {
              __WORK_GLB_ROWS?: unknown;
              __WORK_GLB_SCREEN_CANDIDATES?: unknown;
              __WORK_GLB_KEYBOARD_CANDIDATES?: unknown;
            };
            globalTarget.__WORK_GLB_ROWS = toCopy;
            globalTarget.__WORK_GLB_SCREEN_CANDIDATES = screenCandidatesRows.map((row) => ({
              name: row.name,
              path: row.path,
              uuid: row.uuid,
              area: Number(row.area.toFixed(6)),
              score: Number(row.score.toFixed(6)),
              w: Number(row.w.toFixed(6)),
              h: Number(row.h.toFixed(6)),
              d: Number(row.d.toFixed(6)),
              cx: Number(row.cx.toFixed(6)),
              cy: Number(row.cy.toFixed(6)),
              cz: Number(row.cz.toFixed(6)),
              flatness: Number(row.flatness.toFixed(6)),
              aspectXY: Number(row.aspectXY.toFixed(6)),
            }));
            globalTarget.__WORK_GLB_KEYBOARD_CANDIDATES = keyboardCandidatesRows.map((row) => ({
              name: row.name,
              path: row.path,
              uuid: row.uuid,
              areaXZ: Number(row.areaXZ.toFixed(6)),
              w: Number(row.w.toFixed(6)),
              h: Number(row.h.toFixed(6)),
              d: Number(row.d.toFixed(6)),
              cx: Number(row.cx.toFixed(6)),
              cy: Number(row.cy.toFixed(6)),
              cz: Number(row.cz.toFixed(6)),
              flatness: Number(row.flatness.toFixed(6)),
            }));

            console.log("=== WORK GLB MESH INVENTORY (copyable) ===");
            console.log("Tip: run in console: copy(JSON.stringify(window.__WORK_GLB_ROWS, null, 2))");
            console.log("Count:", toCopy.length);
            toCopy
              .slice()
              .sort((a, b) => b.vol - a.vol)
              .slice(0, 200)
              .forEach((row, index) => {
                console.log(
                  `[${index}] name="${row.name}" path="${row.path}" vol=${row.vol.toExponential(2)} w=${row.w.toFixed(3)} h=${row.h.toFixed(3)} d=${row.d.toFixed(3)} c=(${row.cx.toFixed(3)},${row.cy.toFixed(3)},${row.cz.toFixed(3)}) flat=${row.flatness.toFixed(3)}`
                );
              });
            console.log("=== SCREEN CANDIDATES (top 30) ===");
            screenCandidatesRows.slice(0, 30).forEach((row, index) => {
              console.log(
                `[${index}] name="${row.name}" path="${row.path}" score=${row.score.toFixed(2)} area=${row.area.toFixed(3)} w=${row.w.toFixed(3)} h=${row.h.toFixed(3)} d=${row.d.toFixed(3)} c=(${row.cx.toFixed(3)},${row.cy.toFixed(3)},${row.cz.toFixed(3)}) flat=${row.flatness.toFixed(3)}`
              );
            });
            console.log("=== KEYBOARD CANDIDATES (top 30) ===");
            keyboardCandidatesRows.slice(0, 30).forEach((row, index) => {
              console.log(
                `[${index}] name="${row.name}" path="${row.path}" areaXZ=${row.areaXZ.toFixed(3)} w=${row.w.toFixed(3)} h=${row.h.toFixed(3)} d=${row.d.toFixed(3)} c=(${row.cx.toFixed(3)},${row.cy.toFixed(3)},${row.cz.toFixed(3)}) flat=${row.flatness.toFixed(3)}`
              );
            });
            console.log("=== END WORK GLB MESH INVENTORY ===");
          }

          const matchEntry = (entry: MeshEntry, needleLC: string) => {
            if (!needleLC) return false;
            const meta = meshMetaByUuid.get(entry.mesh.uuid);
            const nameLC = meta?.nameLC ?? entry.name.toLowerCase();
            const pathLC = meta?.pathLC ?? objPath(entry.mesh).toLowerCase();
            return nameLC.includes(needleLC) || pathLC.includes(needleLC);
          };
          const matchesAnyEntry = (entry: MeshEntry, needlesLC: string[]) => {
            if (needlesLC.length === 0) return false;
            return needlesLC.some((needleLC) => matchEntry(entry, needleLC));
          };
          const areaXZ = (entry: MeshEntry) => entry.size.x * entry.size.z;

          if (forceKeepRootLC) {
            let keepNode: THREE.Object3D | null = null;
            terminalModelRoot.traverse((object: THREE.Object3D) => {
              if (keepNode) return;
              const nameLC = object.name.toLowerCase();
              const pathLC = objPath(object).toLowerCase();
              if (nameLC.includes(forceKeepRootLC) || pathLC.includes(forceKeepRootLC)) {
                keepNode = object;
              }
            });
            if (keepNode) {
              terminalModelRoot.traverse((object: THREE.Object3D) => {
                object.visible = false;
              });
              let cursor: THREE.Object3D | null = keepNode;
              while (cursor) {
                cursor.visible = true;
                if (cursor === terminalModelRoot) break;
                cursor = cursor.parent;
              }
              keepNode.traverse((object: THREE.Object3D) => {
                object.visible = true;
              });
            }
          }

          if (forceKeepLC.length > 0) {
            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible) return;
              entry.mesh.visible = forceKeepLC.some((needleLC) => matchEntry(entry, needleLC));
            });
          }
          if (forceHideLC.length > 0) {
            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible) return;
              if (matchesAnyEntry(entry, forceHideLC)) {
                entry.mesh.visible = false;
              }
            });
          }

          meshEntries.sort((a, b) => b.volume - a.volume);

          const dimsAsc = (entry: MeshEntry) => [entry.size.x, entry.size.y, entry.size.z].sort((a, b) => a - b);
          const isHugePlane = (entry: MeshEntry) => {
            const dims = dimsAsc(entry);
            return dims[0] < modelWorkSize.y * 0.03 && dims[1] > modelWorkSize.x * 0.45 && dims[2] > modelWorkSize.z * 0.35;
          };
          const isStringyWire = (entry: MeshEntry) => {
            const dims = dimsAsc(entry);
            return dims[0] < modelWorkSize.y * 0.03 && dims[1] < modelWorkSize.y * 0.09 && dims[2] > modelWorkSize.x * 0.18;
          };
          const volumeOfBox = (box: THREE.Box3) => {
            const s = box.getSize(new THREE.Vector3());
            return Math.max(1e-6, s.x * s.y * s.z);
          };

          let keyboardCandidate: MeshEntry | null = null;
          if (forceKeyboardLC) {
            keyboardCandidate =
              meshEntries
                .filter((entry) => entry.mesh.visible && matchEntry(entry, forceKeyboardLC))
                .sort((a, b) => areaXZ(b) - areaXZ(a))[0] ?? null;
          }
          if (!keyboardCandidate) {
            keyboardCandidate =
              meshEntries
                .filter(
                  (entry) =>
                    entry.mesh.visible &&
                    entry.center.y < modelWorkBox.min.y + modelWorkSize.y * 0.55 &&
                    entry.size.x > modelWorkSize.x * 0.28 &&
                    entry.size.y < modelWorkSize.y * 0.24
                )
                .sort((a, b) => areaXZ(b) - areaXZ(a))[0] ?? null;
          }

          if (!DEBUG_MESHES) {
            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible) return;
              if (preferredCrtScreenMesh && entry.mesh === preferredCrtScreenMesh) return;
              if (forceHideNamePattern.test(entry.name) || isStringyWire(entry) || isHugePlane(entry)) {
                entry.mesh.visible = false;
              }
            });

            const keyboardBounds = keyboardCandidate ? workBox.setFromObject(keyboardCandidate.mesh).clone() : null;
            let maxVolume = 0;
            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible || isHugePlane(entry) || isStringyWire(entry)) return;
              maxVolume = Math.max(maxVolume, entry.volume);
            });

            const chassisCandidates = meshEntries.filter((entry) => {
              if (!entry.mesh.visible) return false;
              if (isHugePlane(entry) || isStringyWire(entry)) return false;
              if (maxVolume > 0 && entry.volume < maxVolume * 0.07) return false;
              return entry.center.y > modelWorkBox.min.y + modelWorkSize.y * 0.22;
            });

            let keepRegion: THREE.Box3 | null = null;
            chassisCandidates.forEach((entry) => {
              const bounds = workBox.setFromObject(entry.mesh).clone();
              keepRegion = keepRegion ? keepRegion.union(bounds) : bounds.clone();
            });
            if (keyboardBounds) {
              keepRegion = keepRegion ? keepRegion.union(keyboardBounds) : keyboardBounds.clone();
            }
            if (keepRegion) {
              keepRegion.expandByVector(
                new THREE.Vector3(modelWorkSize.x * 0.03, modelWorkSize.y * 0.03, modelWorkSize.z * 0.03)
              );
            }

            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible) return;
              if (preferredCrtScreenMesh && entry.mesh === preferredCrtScreenMesh) return;
              const meshBox = workBox.setFromObject(entry.mesh).clone();
              const overlapRatio = keepRegion
                ? volumeOfBox(meshBox.clone().intersect(keepRegion)) / Math.max(volumeOfBox(meshBox), 1e-6)
                : 1;
              const belowKeyboard =
                keyboardBounds !== null && meshBox.max.y < keyboardBounds.min.y + modelWorkSize.y * 0.01;
              if (
                forceHideNamePattern.test(entry.name) ||
                isHugePlane(entry) ||
                isStringyWire(entry) ||
                overlapRatio < 0.68 ||
                belowKeyboard
              ) {
                entry.mesh.visible = false;
              }
            });
          }

          if (forceHideLC.length > 0) {
            meshEntries.forEach((entry) => {
              if (!entry.mesh.visible) return;
              if (matchesAnyEntry(entry, forceHideLC)) {
                entry.mesh.visible = false;
              }
            });
          }
          if (!keyboardCandidate || !keyboardCandidate.mesh.visible) {
            keyboardCandidate =
              meshEntries
                .filter(
                  (entry) =>
                    entry.mesh.visible &&
                    entry.center.y < modelWorkBox.min.y + modelWorkSize.y * 0.55 &&
                    entry.size.x > modelWorkSize.x * 0.28 &&
                    entry.size.y < modelWorkSize.y * 0.24
                )
                .sort((a, b) => areaXZ(b) - areaXZ(a))[0] ?? null;
          }
          chosenKeyboardMeshRef.current = keyboardCandidate?.mesh ?? null;
          setDebugSelectedKeyboardPath(keyboardCandidate ? objPath(keyboardCandidate.mesh) : "(none)");

          const anchorCandidates: Array<CandidateEntry & { score: number }> = [];
          const hardAnchorCandidates: Array<CandidateEntry & { score: number }> = [];
          const glassEntries: CandidateEntry[] = [];
          const screenLikeEntries: CandidateEntry[] = [];
          meshEntries.forEach((entry) => {
            const mesh = entry.mesh;
            if (!mesh.visible) return;
            const name = entry.name;
            candidateBounds.setFromObject(mesh);
            candidateBounds.getSize(candidateSize);
            const center = candidateBounds.getCenter(new THREE.Vector3());
            const w = candidateSize.x;
            const h = candidateSize.y;
            const d = candidateSize.z;
            const cx = center.x;
            const cy = center.y;
            const cz = center.z;
            const area = w * h;
            const dims = [w, h, d].sort((a, b) => b - a);
            const thinFlat = dims[2] < Math.max(0.003, Math.min(dims[0], dims[1]) * 0.18);
            const upperHalf = cy > modelWorkBox.min.y + modelWorkSize.y * 0.45;
            const aspect = w / Math.max(0.001, h);
            const screenish = screenLikePattern.test(name) || (thinFlat && upperHalf && aspect > 1.1 && aspect < 2.2);
            const glassish = glassPattern.test(name) && thinFlat && upperHalf;
            const passesHardFilters =
              cy > modelWorkBox.min.y + modelWorkSize.y * 0.58 &&
              Math.abs(cx - modelWorkCenter.x) < modelWorkSize.x * 0.18 &&
              Math.abs(cz - modelWorkCenter.z) < modelWorkSize.z * 0.22 &&
              d < modelWorkSize.z * 0.08 &&
              w >= modelWorkSize.x * 0.18 &&
              w <= modelWorkSize.x * 0.58 &&
              h >= modelWorkSize.y * 0.12 &&
              h <= modelWorkSize.y * 0.42 &&
              aspect >= 1.15 &&
              aspect <= 2.35;
            if (passesHardFilters) {
              const hardEntry: CandidateEntry = {
                mesh,
                name,
                size: candidateSize.clone(),
                world: center.clone(),
                area,
                thinLarge: thinFlat,
                screenish,
                glassish,
              };
              const hardScore =
                (/screen|crt|display|monitor/.test(name) ? 2000 : 0) -
                (Math.abs(cx - modelWorkCenter.x) + Math.abs(cz - modelWorkCenter.z)) * 1000 +
                area;
              hardAnchorCandidates.push({ ...hardEntry, score: hardScore });
            }
            if (!screenish && !glassish) return;
            const baseEntry: CandidateEntry = {
              mesh,
              name,
              size: candidateSize.clone(),
              world: center.clone(),
              area,
              thinLarge: thinFlat,
              screenish,
              glassish,
            };
            glbCandidates.push(baseEntry);
            if (screenish) {
              screenLikeEntries.push(baseEntry);
              const nameBonus = /screen|display|crt|monitor/.test(name) ? 1.4 : 0;
              const frontBonus = center.z > modelWorkBox.min.z + modelWorkSize.z * 0.45 ? 0.45 : 0;
              const fallbackScore = area + nameBonus + frontBonus;
              if (thinFlat && upperHalf && aspect > 1.1 && aspect < 2.2) {
                anchorCandidates.push({ ...baseEntry, score: fallbackScore });
              }
            }
            if (glassish) glassEntries.push(baseEntry);
          });

          if (DEBUG) {
            console.log(
              "[work] GLB candidates",
              glbCandidates.map((candidate) => ({
                name: candidate.name,
                size: {
                  x: Number(candidate.size.x.toFixed(3)),
                  y: Number(candidate.size.y.toFixed(3)),
                  z: Number(candidate.size.z.toFixed(3)),
                },
                world: {
                  x: Number(candidate.world.x.toFixed(3)),
                  y: Number(candidate.world.y.toFixed(3)),
                  z: Number(candidate.world.z.toFixed(3)),
                },
                area: Number(candidate.area.toFixed(3)),
                thinLarge: candidate.thinLarge,
                glass: candidate.glassish,
              }))
            );
          }

          const chosenAnchorMesh = preferredCrtScreenMesh ?? null;
          chosenAnchorMeshRef.current = chosenAnchorMesh;
          let selectedScreenNameValue = chosenAnchorMesh ? (chosenAnchorMesh.name || "(unnamed)") : "(fallback)";
          let selectedScreenAnchorKindValue: "CRT_Screen" | "__workScreenPlane" = chosenAnchorMesh
            ? "CRT_Screen"
            : "__workScreenPlane";
          let selectedScreenPathValue = chosenAnchorMesh ? objPath(chosenAnchorMesh) : "(none)";
          screenCandidatesCount = glbCandidates.length;
          setDebugCandidatesCount(screenCandidatesCount);
          forceFallbackMode = screenCandidatesCount === 0 || selectedScreenNameValue === "(fallback)";
          setDebugForceFallbackMode(forceFallbackMode);
          setDebugSelectedScreenName(selectedScreenNameValue);
          setDebugScreenAnchorKind(selectedScreenAnchorKindValue);
          const chosenGlass: THREE.Mesh | null = null;
          const glassMeshSet = new Set<THREE.Mesh>();

          const forcedBodyMesh =
            forceBodyLC.length > 0
              ? meshMetadataEntries
                  .filter(
                    (entry) =>
                      (entry.nameLC.includes(forceBodyLC) || entry.pathLC.includes(forceBodyLC))
                  )
                  .sort((a, b) => b.vtxCount - a.vtxCount || b.vol - a.vol)[0]?.mesh ?? null
              : null;
          const chosenBodyMesh =
            forcedBodyMesh ??
            meshMetadataEntries
              .filter((entry) => {
                if (chosenAnchorMesh && entry.mesh === chosenAnchorMesh) return false;
                if (glassMeshSet.has(entry.mesh)) return false;
                return true;
              })
              .sort((a, b) => b.vtxCount - a.vtxCount || b.vol - a.vol)[0]?.mesh ??
            null;
          bodyMeshRef.current = chosenBodyMesh;
          setDebugSelectedBodyPath(chosenBodyMesh ? objPath(chosenBodyMesh) : "(none)");
          const chosenBodyMeta = chosenBodyMesh
            ? meshMetadataEntries.find((entry) => entry.mesh === chosenBodyMesh)
            : null;
          if (DEBUG) {
            console.log(
              `[work] screenMesh="${chosenAnchorMesh?.name ?? "(none)"}" path="${chosenAnchorMesh ? objPath(chosenAnchorMesh) : "(none)"}"`
            );
            console.log(
              `[work] bodyMesh="${chosenBodyMesh?.name ?? "(none)"}" path="${chosenBodyMesh ? objPath(chosenBodyMesh) : "(none)"}" vtx=${chosenBodyMeta?.vtxCount ?? 0} vol=${(chosenBodyMeta?.vol ?? 0).toFixed(6)}`
            );
          }

          if (!DEBUG_MESHES) {
            screenLikeEntries.forEach((candidate) => {
              candidate.mesh.visible = false;
            });
            glassMeshSet.forEach((mesh) => {
              mesh.visible = false;
            });
          }


          {
            const fitLocalPos = new THREE.Vector3(
              WORK_SCREEN_FIT_DEFAULT.pos[0],
              WORK_SCREEN_FIT_DEFAULT.pos[1],
              WORK_SCREEN_FIT_DEFAULT.pos[2]
            );
            const fitLocalQuat = new THREE.Quaternion(
              WORK_SCREEN_FIT_DEFAULT.quat[0],
              WORK_SCREEN_FIT_DEFAULT.quat[1],
              WORK_SCREEN_FIT_DEFAULT.quat[2],
              WORK_SCREEN_FIT_DEFAULT.quat[3]
            );
            const fitWidth = WORK_SCREEN_FIT_DEFAULT.size[0];
            const fitHeight = WORK_SCREEN_FIT_DEFAULT.size[1];
            const fitPush = WORK_SCREEN_FIT_DEFAULT.push;
            const debugStorageActive = DEBUG_PICKING && screenGizmoReadyRef.current;
            const debugScreenFit = screenGizmoLiveRef.current;
            const activeLocalPos = debugStorageActive
              ? new THREE.Vector3(debugScreenFit.posX, debugScreenFit.posY, debugScreenFit.posZ)
              : fitLocalPos.clone();
            const activeLocalQuat = debugStorageActive
              ? new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(
                    THREE.MathUtils.degToRad(debugScreenFit.rotXDeg),
                    THREE.MathUtils.degToRad(debugScreenFit.rotYDeg),
                    THREE.MathUtils.degToRad(debugScreenFit.rotZDeg)
                  )
                )
              : fitLocalQuat.clone();
            const activeSizeX = debugStorageActive ? debugScreenFit.width : fitWidth;
            const activeSizeY = debugStorageActive ? debugScreenFit.height : fitHeight;
            const activePush = debugStorageActive ? debugScreenFit.push : fitPush;
            setDebugScreenFitStatus(debugStorageActive ? "DEBUG STORAGE" : "HARDCODED");

            const screenGeometry = new THREE.PlaneGeometry(1, 1, 24, 18);
            const crtPlane = new THREE.Mesh(screenGeometry, screenMaterial);
            crtPlane.name = "__workScreenPlane";
            crtPlane.position.copy(activeLocalPos);
            crtPlane.quaternion.copy(activeLocalQuat);
            crtPlane.scale.set(activeSizeX, activeSizeY, 1);
            crtPlane.translateZ(activePush);
            crtPlane.renderOrder = SCREEN_PLANE_RENDER_ORDER;
            modelRoot.add(crtPlane);
            modelRoot.updateMatrixWorld(true);
            pendingSlabHidePass = true;
            lastSlabFitSignature = "";

            screenSurface = crtPlane;
            chosenAnchorMeshRef.current = null;
            screenMeshRef.current = crtPlane;
            chosenScreenMeshRef.current = crtPlane;
            selectedScreenNameValue = "AutoFitScreenSurface";
            selectedScreenAnchorKindValue = "__workScreenPlane";
            selectedScreenPathValue = objPath(crtPlane);
            screenFlipXRef.current = false;
            refreshScreenAnchors(crtPlane, 1, 1, 0);
            screenSampleSurface = crtPlane;
            screenSampleWidth = activeSizeX;
            screenSampleHeight = activeSizeY;
            occluderScreenSurfaceRoot = crtPlane;
            if (DEBUG_PICKING && !screenGizmoReadyRef.current) {
              const seededGizmo = sanitizeDebugScreenFitState({
                ...DEFAULT_DEBUG_SCREEN_FIT,
                width: fitWidth,
                height: fitHeight,
                push: fitPush,
              });
              screenGizmoDefaultsRef.current = seededGizmo;
              applyScreenGizmoState(seededGizmo);
            }
            if (chosenAnchorMesh) {
              chosenAnchorMesh.visible = false;
            }
            forceFallbackMode = false;
            setDebugForceFallbackMode(false);

            setDebugScreenFitSize(`${activeSizeX.toFixed(4)} x ${activeSizeY.toFixed(4)}`);
            setDebugScreenFitPose(
              `pos=(${activeLocalPos.x.toFixed(4)}, ${activeLocalPos.y.toFixed(4)}, ${activeLocalPos.z.toFixed(4)}) quat=(${activeLocalQuat.x.toFixed(4)}, ${activeLocalQuat.y.toFixed(4)}, ${activeLocalQuat.z.toFixed(4)}, ${activeLocalQuat.w.toFixed(4)})`
            );
            console.log("[work] terminalRoot parent OK", {
              ok: terminalRootRef.current === modelRoot && crtPlane.parent === terminalRootRef.current,
              terminalRootName: terminalRootRef.current?.name || "(unnamed)",
            });
            console.log("[work] screen local fit applied", {
              pos: [activeLocalPos.x, activeLocalPos.y, activeLocalPos.z].map((value) => Number(value.toFixed(4))),
              quat: [activeLocalQuat.x, activeLocalQuat.y, activeLocalQuat.z, activeLocalQuat.w].map((value) =>
                Number(value.toFixed(4))
              ),
              size: [activeSizeX, activeSizeY].map((value) => Number(value.toFixed(4))),
              push: Number(activePush.toFixed(4)),
            });
            console.log("[work] SCREEN_ACTIVE fit=", {
              pos: [activeLocalPos.x, activeLocalPos.y, activeLocalPos.z].map((value) => Number(value.toFixed(4))),
              quat: [activeLocalQuat.x, activeLocalQuat.y, activeLocalQuat.z, activeLocalQuat.w].map((value) =>
                Number(value.toFixed(4))
              ),
              size: [activeSizeX, activeSizeY].map((value) => Number(value.toFixed(4))),
              push: Number(activePush.toFixed(4)),
            });
            console.log("[work] SCREEN_ACTIVE material", {
              depthTest: screenMaterial.depthTest ? "ON" : "OFF",
              depthWrite: screenMaterial.depthWrite ? "ON" : "OFF",
              renderOrder: crtPlane.renderOrder,
            });
            console.info("[work] screen renderOrder=999999 depthTest=false");
          }
          setDebugSelectedScreenName(selectedScreenNameValue);
          setDebugScreenAnchorKind(selectedScreenAnchorKindValue);
          setDebugSelectedScreenPath(selectedScreenPathValue);
          isFallbackScreen =
            forceFallbackMode ||
            selectedScreenNameValue === "(fallback)" ||
            selectedScreenAnchorKindValue === "__workScreenPlane" ||
            selectedScreenPathValue.includes("__screenAnchor");
          setDebugIsFallbackScreen(isFallbackScreen);

          if (chosenGlass) {
            chosenGlass.visible = true;
            chosenGlass.renderOrder = GLASS_RENDER_ORDER;
            const glassMaterials = Array.isArray(chosenGlass.material)
              ? chosenGlass.material
              : [chosenGlass.material];
            glassMaterials.forEach((material) => {
              if (!material) return;
              material.depthTest = false;
              material.depthWrite = false;
              material.transparent = true;
              material.opacity = GLASS_OPACITY;
              material.toneMapped = false;
              material.needsUpdate = true;
            });
          }

          screenCenterAnchor.updateMatrixWorld(true);
          screenCenterAnchor.getWorldPosition(loadedScreenCenter);
          terminal.worldToLocal(loadedScreenCenter);
          alignmentDelta.copy(desiredScreenCenter).sub(loadedScreenCenter);
          modelRoot.position.add(alignmentDelta);
          modelRoot.updateMatrixWorld(true);
          const modelRootBBox = new THREE.Box3().setFromObject(modelRoot);
          const modelRootSize = modelRootBBox.getSize(new THREE.Vector3());
          modelRootBBoxDiag = modelRootSize.length();
          terminal.children.forEach((child) => {
            child.visible = child === terminalModelRoot;
          });
          autoOccluderStableFrames = 1;
          autoOccluderFramesRemaining = 0;

          if (DEBUG) {
            console.log("[work] loaded terminal GLB", {
              hasScreen: !!chosenScreenMeshRef.current,
              singleScreen: true,
              candidates: screenCandidatesCount,
              forceFallbackMode,
              isFallbackScreen,
              noAutoHide: NO_AUTO_HIDE,
              autoHiddenThisLoad: autoHiddenThisLoadPath || "(none)",
              hiddenOccluders: hiddenPathSet.size,
            });
          }
          const hiddenPath = hideBlockingSlab();
          console.info(`[work] hidden slab: ${hiddenPath || "none"}`);
          if (DEBUG_PICKING) {
            console.log(`[work][debug] hiddenSlab: ${hiddenPath || "none"}`);
          }
        },
        undefined,
        (err: unknown) => {
          console.warn("[work] failed to load terminal GLB", err);
        }
      );
    } else {
      const fallbackGeometry = new THREE.PlaneGeometry(screenW, screenH, 44, 28);
      applyConvexBow(fallbackGeometry, 0.024);
      const fallbackScreen = new THREE.Mesh(fallbackGeometry, screenMaterial);
      fallbackScreen.position.set(0, 0.62, 1.1);
      terminalModelRoot.add(fallbackScreen);
      screenSurface = fallbackScreen;

      const fallbackFrame = new THREE.Mesh(
        createRoundedRectRingGeometry(screenW * 1.2, screenH * 1.24, screenW * 1.04, screenH * 1.06, 0.12, 0.06, 0.08, 12),
        new THREE.MeshStandardMaterial({
          color: DEBUG_VISIBILITY_LIFT ? 0x596860 : 0x3a4741,
          roughness: DEBUG_VISIBILITY_LIFT ? 0.3 : 0.28,
          metalness: DEBUG_VISIBILITY_LIFT ? 0.76 : 0.72,
        })
      );
      fallbackFrame.position.set(0, 0.62, 1.16);
      terminalModelRoot.add(fallbackFrame);

      const fallbackGlassGeometry = new THREE.PlaneGeometry(screenW * 1.03, screenH * 1.03, 30, 20);
      applyConvexBow(fallbackGlassGeometry, 0.03);
      const fallbackGlass = new THREE.Mesh(fallbackGlassGeometry, glassMaterial);
      fallbackGlass.position.set(0, 0.62, 1.21);
      terminalModelRoot.add(fallbackGlass);

      refreshScreenAnchors(fallbackScreen, screenW, screenH, 0.02);
    }

    const screenGlow = new THREE.PointLight(0x67ff9e, DEBUG_VISIBILITY_LIFT ? 0.52 : 0.42, 4.8, 2.2);
    screenGlow.position.set(0, 0.5, 1.02);
    terminal.add(screenGlow);
    const keyboardSpill = new THREE.SpotLight(
      0x73ffad,
      DEBUG_VISIBILITY_LIFT ? 0.3 : 0.2,
      6,
      Math.PI / 5,
      0.65,
      1.7
    );
    keyboardSpill.position.set(0, 0.48, 1.06);
    const keyboardSpillTarget = new THREE.Object3D();
    keyboardSpillTarget.position.set(0, -0.54, 0.98);
    terminal.add(keyboardSpillTarget);
    keyboardSpill.target = keyboardSpillTarget;
    terminal.add(keyboardSpill);

    const terminalBadgeTexture = makeLabelTexture("CHLOEVERSE // CLEARANCE TERMINAL");
    const terminalBadge = new THREE.Mesh(
      new THREE.PlaneGeometry(1.32, 0.22),
      new THREE.MeshBasicMaterial({ map: terminalBadgeTexture ?? undefined, transparent: true, opacity: 0.78 })
    );
    terminalBadge.position.set(-0.58, -0.44, 1.18);
    terminal.add(terminalBadge);

    const powerLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.036, 14, 14),
      new THREE.MeshStandardMaterial({
        color: 0x90ffaf,
        emissive: 0x5aff8f,
        emissiveIntensity: 1.5,
        roughness: 0.12,
        metalness: 0.04,
      })
    );
    powerLed.position.set(1.18, -0.08, 1.18);
    terminal.add(powerLed);
    const powerLedMaterial = powerLed.material as THREE.MeshStandardMaterial;

    const leverAssembly = new THREE.Group();
    leverAssembly.position.set(1.94, -0.56, 1.02);
    terminal.add(leverAssembly);
    if (USE_GLB_TERMINAL) {
      leverAssembly.visible = false;
    }

    const leverHousing = new THREE.Mesh(
      createRoundedBoxGeometry(0.68, 1.46, 0.38, 0.1, 10),
      new THREE.MeshStandardMaterial({
        color: 0x222a27,
        roughness: 0.74,
        roughnessMap: chassisNoiseTexture ?? undefined,
        metalness: 0.24,
      })
    );
    leverAssembly.add(leverHousing);
    const leverMountPlate = new THREE.Mesh(
      createRoundedBoxGeometry(0.16, 1.22, 0.44, 0.03, 6),
      new THREE.MeshStandardMaterial({
        color: 0x171c19,
        roughness: 0.78,
        metalness: 0.34,
      })
    );
    leverMountPlate.position.set(-0.36, -0.02, 0.09);
    leverAssembly.add(leverMountPlate);

    const leverChannel = new THREE.Mesh(
      createRoundedBoxGeometry(0.22, 1.24, 0.12, 0.04, 8),
      new THREE.MeshStandardMaterial({
        color: 0x131816,
        roughness: 0.56,
        metalness: 0.44,
      })
    );
    leverChannel.position.set(0.16, -0.03, 0.1);
    leverAssembly.add(leverChannel);

    const leverLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.24, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x1d2521, roughness: 0.42, metalness: 0.5 })
    );
    leverLip.position.set(0.16, -0.03, 0.15);
    leverAssembly.add(leverLip);

    const leverLabelTexture = makeLabelTexture("AUTH LEVER // CLEARANCE");
    const leverPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.12),
      new THREE.MeshBasicMaterial({ map: leverLabelTexture ?? undefined, transparent: true, opacity: 0.7 })
    );
    leverPlate.position.set(-0.02, 0.54, 0.2);
    leverAssembly.add(leverPlate);

    const leverStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x6e7672, roughness: 0.36, metalness: 0.76 })
    );
    leverStem.position.set(0.16, 0.22, 0.13);
    leverAssembly.add(leverStem);

    const leverHandle = new THREE.Mesh(
      createRoundedBoxGeometry(0.2, 0.16, 0.18, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a938f, roughness: 0.46, metalness: 0.54 })
    );
    leverHandle.position.set(0.16, 0.52, 0.15);
    leverHandle.userData = { action: "auth", baseY: leverHandle.position.y };
    leverAssembly.add(leverHandle);

    const leverGripInset = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x353d39, roughness: 0.72, metalness: 0.14 })
    );
    leverGripInset.position.set(0, 0.03, 0.03);
    leverHandle.add(leverGripInset);

    const screwMaterial = new THREE.MeshStandardMaterial({ color: 0x68706b, roughness: 0.4, metalness: 0.74 });
    const screwGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.014, 14);
    const screwPoints: [number, number, number][] = [
      [-0.26, 0.64, 0.15],
      [0.28, 0.64, 0.15],
      [-0.26, -0.68, 0.15],
      [0.28, -0.68, 0.15],
    ];
    screwPoints.forEach(([x, y, z]) => {
      const screw = new THREE.Mesh(screwGeometry, screwMaterial);
      screw.rotation.x = Math.PI * 0.5;
      screw.position.set(x, y, z);
      leverAssembly.add(screw);
    });

    const ledMaterial = new THREE.MeshStandardMaterial({
      color: 0x13231b,
      emissive: 0x153f2e,
      emissiveIntensity: 0.8,
      roughness: 0.36,
      metalness: 0.15,
    });

    const ledBar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 1.14, 0.032), ledMaterial);
    ledBar.position.set(-0.12, -0.03, 0.154);
    leverAssembly.add(ledBar);

    const ledScanner = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.14, 0.036),
      new THREE.MeshStandardMaterial({
        color: 0x57ffaa,
        emissive: 0x43ff9a,
        emissiveIntensity: 1.9,
        roughness: 0.1,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
      })
    );
    ledScanner.position.set(-0.12, 0.54, 0.158);
    leverAssembly.add(ledScanner);

    const slotStartAnchor = new THREE.Object3D();
    slotStartAnchor.position.set(0.16, 0.54, 0.16);
    leverAssembly.add(slotStartAnchor);

    const slotEndAnchor = new THREE.Object3D();
    slotEndAnchor.position.set(0.16, -0.52, 0.16);
    leverAssembly.add(slotEndAnchor);

    if (!USE_GLB_TERMINAL) {
      const terminalShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(5.2, 3.8),
        new THREE.MeshBasicMaterial({
          map: shadowTexture ?? undefined,
          transparent: true,
          opacity: 0.66,
          depthWrite: false,
        })
      );
      terminalShadow.rotation.x = -Math.PI * 0.5;
      terminalShadow.position.set(0.1, -1.28, 0.12);
      stationRoot.add(terminalShadow);
      const terminalShadowTight = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 2.2),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.34, depthWrite: false })
      );
      terminalShadowTight.rotation.x = -Math.PI * 0.5;
      terminalShadowTight.position.set(0.04, -1.26, 0.54);
      stationRoot.add(terminalShadowTight);
    }

    const remote = new THREE.Group();
    remote.position.set(1.02, -0.84, 1.12);
    remote.rotation.x = -0.18;
    terminal.add(remote);

    const remoteBody = new THREE.Mesh(
      createRoundedBoxGeometry(1.18, 0.2, 0.58, 0.08, 8),
      new THREE.MeshStandardMaterial({
        color: DEBUG_VISIBILITY_LIFT ? 0x33403a : 0x151a18,
        roughness: DEBUG_VISIBILITY_LIFT ? 0.56 : 0.62,
        metalness: DEBUG_VISIBILITY_LIFT ? 0.3 : 0.25,
      })
    );
    remote.add(remoteBody);

    const remoteSeam = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.014, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x222925, roughness: 0.28, metalness: 0.5 })
    );
    remoteSeam.position.y = 0.01;
    remote.add(remoteSeam);

    const buttonBaseMaterial = new THREE.MeshStandardMaterial({
      color: 0x213129,
      roughness: 0.34,
      metalness: 0.24,
      emissive: 0x0f241a,
      emissiveIntensity: 0.55,
    });
    const buttonHoldMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b2d2b,
      roughness: 0.38,
      metalness: 0.22,
      emissive: 0x1f221f,
      emissiveIntensity: 0.4,
    });

    const slashButton = new THREE.Mesh(createRoundedBoxGeometry(0.24, 0.07, 0.16, 0.02, 6), buttonBaseMaterial);
    slashButton.position.set(-0.34, 0.13, 0.03);
    slashButton.userData = { action: "scroll-down", baseY: slashButton.position.y };
    remote.add(slashButton);

    const caretButton = new THREE.Mesh(createRoundedBoxGeometry(0.24, 0.07, 0.16, 0.02, 6), buttonBaseMaterial.clone());
    caretButton.position.set(-0.02, 0.13, 0.03);
    caretButton.userData = { action: "scroll-down", baseY: caretButton.position.y };
    remote.add(caretButton);

    const holdButton = new THREE.Mesh(createRoundedBoxGeometry(0.34, 0.07, 0.16, 0.02, 6), buttonHoldMaterial);
    holdButton.position.set(0.34, 0.13, 0.03);
    holdButton.userData = { action: "hold", baseY: holdButton.position.y };
    remote.add(holdButton);

    const slashTexture = makeButtonTexture("/");
    const slashLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.08),
      new THREE.MeshBasicMaterial({ map: slashTexture ?? undefined, transparent: true })
    );
    slashLabel.rotation.x = -Math.PI * 0.5;
    slashLabel.position.set(-0.34, 0.203, 0.03);
    remote.add(slashLabel);

    const caretTexture = makeButtonTexture("v");
    const caretLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.08),
      new THREE.MeshBasicMaterial({ map: caretTexture ?? undefined, transparent: true })
    );
    caretLabel.rotation.x = -Math.PI * 0.5;
    caretLabel.position.set(-0.02, 0.203, 0.03);
    remote.add(caretLabel);

    const holdTexture = makeButtonTexture("HOLD");
    const holdLabel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.08),
      new THREE.MeshBasicMaterial({ map: holdTexture ?? undefined, transparent: true })
    );
    holdLabel.rotation.x = -Math.PI * 0.5;
    holdLabel.position.set(0.34, 0.203, 0.03);
    remote.add(holdLabel);
    remote.visible = false;

    if (DEBUG_VISIBILITY_LIFT) {
      const liftedMaterials: THREE.Material[] = [
        shellMaterial,
        shellDarkMaterial,
        metalTrimMaterial,
        plateMaterial,
        keyCapMaterial,
        powerLedMaterial,
        screwMaterial,
        ledMaterial,
        buttonBaseMaterial,
        buttonHoldMaterial,
      ];
      liftedMaterials.forEach((material) => applyMaterialLift(material, DEBUG_LIFT_AMOUNT));

      const preserve = new Set<THREE.Material>([screenMaterial, glassMaterial]);
      stationRoot.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material) return;
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((material: THREE.Material) => {
            if (!preserve.has(material)) applyMaterialLift(material, DEBUG_LIFT_AMOUNT * 0.45);
          });
        } else if (!preserve.has(mesh.material)) {
          applyMaterialLift(mesh.material, DEBUG_LIFT_AMOUNT * 0.45);
        }
      });
    }


    const fitBox = new THREE.Box3();
    const fitSize = new THREE.Vector3();
    const fitCenter = new THREE.Vector3();
    const heroStartCamera = new THREE.Vector3();
    const heroEndCamera = new THREE.Vector3();
    const heroLookTarget = new THREE.Vector3();
    let heroFrameLocked = false;
    let heroFrameWarmup = 0;

    const syncHeroFrame = (aspect: number) => {
      fitBox.setFromObject(stationRoot);
      fitBox.getCenter(fitCenter);
      fitBox.getSize(fitSize);
      const fitVFov = THREE.MathUtils.degToRad(33);
      const hFov = 2 * Math.atan(Math.tan(fitVFov * 0.5) * aspect);
      const safeHeight = 0.78;
      const safeWidth = 0.82;
      const distV = (fitSize.y * 0.5) / Math.max(0.001, Math.tan(fitVFov * 0.5) * safeHeight);
      const distH = (fitSize.x * 0.5) / Math.max(0.001, Math.tan(hFov * 0.5) * safeWidth);
      const fitDistance = Math.max(distV, distH) + fitSize.z * 0.54;
      const ultraWide = Math.max(0, aspect - 2.0);
      const backoff = ultraWide * 0.42;
      heroLookTarget.set(fitCenter.x + 0.04, fitCenter.y + 0.14, fitCenter.z + 0.22);
      heroEndCamera.set(fitCenter.x + 0.56, fitCenter.y + 0.78, fitCenter.z + fitDistance + 0.46 + backoff);
      heroStartCamera.set(fitCenter.x + 1.82, fitCenter.y + 1.26, fitCenter.z + fitDistance + 2.26 + backoff * 1.2);
      heroFrameLocked = true;
    };

    const interactiveMeshes: THREE.Mesh[] = USE_GLB_TERMINAL ? [] : [leverHandle];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const stableZoomCenter = new THREE.Vector3();
    const stableZoomNormal = new THREE.Vector3();
    const stableCameraOffset = new THREE.Vector3();
    const zoomTopWorld = new THREE.Vector3();
    const zoomBottomWorld = new THREE.Vector3();
    const zoomLeftWorld = new THREE.Vector3();
    const zoomRightWorld = new THREE.Vector3();
    zoomTargetLockedRef.current = false;
    const lockZoomTarget = () => {
      if (zoomTargetLockedRef.current) return;
      screenCenterAnchor.getWorldPosition(stableZoomCenter);
      const screenQuaternion = new THREE.Quaternion();
      screenSurface.getWorldQuaternion(screenQuaternion);
      stableZoomNormal.set(0, 0, 1).applyQuaternion(screenQuaternion).normalize();
      stableCameraOffset.copy(camera.position).sub(stableZoomCenter);
      if (stableZoomNormal.dot(stableCameraOffset) < 0) {
        stableZoomNormal.multiplyScalar(-1);
      }
      screenTopLeft.getWorldPosition(zoomTopWorld);
      screenBottomLeft.getWorldPosition(zoomBottomWorld);
      screenTopLeft.getWorldPosition(zoomLeftWorld);
      screenTopRight.getWorldPosition(zoomRightWorld);
      const screenHeightWorld = zoomTopWorld.distanceTo(zoomBottomWorld);
      const screenWidthWorld = zoomLeftWorld.distanceTo(zoomRightWorld);
      const finalFov = 25.2;
      const finalVFov = THREE.MathUtils.degToRad(finalFov);
      const framedHeight = screenHeightWorld * FRAME_MARGIN;
      const framedWidth = screenWidthWorld * FRAME_MARGIN;
      const effectiveHeight = Math.max(framedHeight, framedWidth * 0.6, 0.32);
      const screenDistanceRaw = (effectiveHeight * ZOOM_SCREEN_FILL_FACTOR) / Math.tan(finalVFov * 0.5);
      const minZoomDistance = Math.max(0.62, framedHeight * 0.58, framedWidth * 0.42);
      const maxZoomDistance = Math.max(minZoomDistance + 0.4, 10.0);
      const safeZoomDistance = THREE.MathUtils.clamp(screenDistanceRaw, minZoomDistance, maxZoomDistance);
      zoomScreenCenterWorldRef.current.copy(stableZoomCenter);
      zoomScreenNormalWorldRef.current.copy(stableZoomNormal);
      zoomDistanceRef.current = safeZoomDistance;
      zoomLockedCamPosWorldRef.current.copy(stableZoomCenter).addScaledVector(stableZoomNormal, safeZoomDistance);
      zoomLockedLookAtWorldRef.current.copy(stableZoomCenter);
      zoomTargetLockedRef.current = true;
    };
    prepareZoomTargetRef.current = lockZoomTarget;

    const baseEmissive = new Map<THREE.Mesh, number>();
    interactiveMeshes.forEach((mesh) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      baseEmissive.set(mesh, material.emissiveIntensity ?? 0.4);
    });

    const pulseButton = (mesh: THREE.Mesh, active = false) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const base = baseEmissive.get(mesh) ?? 0.4;
      material.emissiveIntensity = active ? base + 0.7 : base;
    };

    const clickButton = (mesh: THREE.Mesh) => {
      if (USE_GLB_TERMINAL) return;
      const currentY = Number(mesh.userData.baseY ?? mesh.position.y);
      mesh.position.y = currentY - 0.02;
      pulseButton(mesh, true);
      window.setTimeout(() => {
        mesh.position.y = currentY;
        pulseButton(mesh, false);
      }, 95);

      const action = String(mesh.userData.action ?? "");
      if (action === "scroll-down") {
        scrollTerminalRef.current(0.7);
      } else if (action === "hold") {
        const element = dossierScrollRef.current;
        canvasScrollRef.current = 0;
        if (!element) return;
        element.scrollTo({ top: 0, behavior: reducedMotionRef.current ? "auto" : "smooth" });
      } else if (action === "auth") {
        triggerAuthRef.current();
      }
    };

    let hoveredButton: THREE.Mesh | null = null;
    const updateButtonHover = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (USE_GLB_TERMINAL) {
        const chosenScreen = chosenScreenMeshRef.current;
        const introPhaseActive = phaseRef.current === "intro" || phaseRef.current === "locked";
        if (!introPhaseActive || !chosenScreen || !enterButtonRectRef.current.visible) {
          renderer.domElement.style.cursor = "default";
          return;
        }
        const hits = raycaster.intersectObject(chosenScreen, true);
        if (hits.length > 0) {
          renderer.domElement.style.cursor = "pointer";
          return;
        }
        renderer.domElement.style.cursor = "default";
        return;
      }

      const hits = raycaster.intersectObjects(interactiveMeshes, false);
      const next = hits.length > 0 && hits[0].object instanceof THREE.Mesh ? (hits[0].object as THREE.Mesh) : null;

      if (next !== hoveredButton) {
        if (hoveredButton) pulseButton(hoveredButton, false);
        hoveredButton = next;
        if (hoveredButton) pulseButton(hoveredButton, true);
      }
      renderer.domElement.style.cursor = hoveredButton ? "pointer" : "default";
    };

    const activateEnterAction = (resetCursor = false) => {
      authedRef.current = true;
      setAuthed(true);
      startScreenZoom();
      if (resetCursor) {
        renderer.domElement.style.cursor = "default";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      if (DEBUG_PICKING && USE_GLB_TERMINAL && (event.altKey || event.shiftKey)) {
        const hits = raycaster.intersectObjects(allGlbMeshes, false);
        const pickedObject = hits.length > 0 ? hits[0].object : null;
        const pickedMesh = pickedObject instanceof THREE.Mesh ? pickedObject : null;
        if (!pickedMesh) {
          return;
        }
        if (event.altKey) {
          const path = objPath(pickedMesh);
          persistScreenPath(path, pickedMesh);
          setDebugSelectedScreenName(pickedMesh.name || "(unnamed)");
          setDebugSelectedScreenPath(path);
          setScreenBindingRevision((value) => value + 1);
          return;
        }
        if (event.shiftKey) {
          const path = objPath(pickedMesh);
          if (hiddenPathSet.has(path)) {
            unhideOccluderMesh(pickedMesh);
          } else {
            hideOccluderMesh(pickedMesh, true);
          }
          return;
        }
      }

      skipIntro();

      if (USE_GLB_TERMINAL) {
        const chosenScreen = chosenScreenMeshRef.current;
        const introPhaseActive = phaseRef.current === "intro" || phaseRef.current === "locked";
        if (chosenScreen && introPhaseActive && enterButtonRectRef.current.visible) {
          const hits = raycaster.intersectObject(chosenScreen, true);
          if (hits.length > 0) {
            activateEnterAction(true);
            return;
          }
        }
        updateButtonHover(event);
        return;
      }

      updateButtonHover(event);

      const hits = raycaster.intersectObjects(interactiveMeshes, false);
      if (hits.length > 0) {
        const hit = hits[0].object;
        if (hit instanceof THREE.Mesh) {
          clickButton(hit);
        }
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", updateButtonHover);
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const introPhaseActive = phaseRef.current === "intro" || phaseRef.current === "locked";
      if (!introPhaseActive || !enterButtonRectRef.current.visible || authedRef.current) return;
      event.preventDefault();
      activateEnterAction();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    const onRendererPointerLeave = () => {
      if (hoveredButton) pulseButton(hoveredButton, false);
      hoveredButton = null;
      renderer.domElement.style.cursor = "default";
    };
    renderer.domElement.addEventListener("pointerleave", onRendererPointerLeave);
    const onWheel = (event: WheelEvent) => {
      if (!USE_GLB_TERMINAL) return;
      if (viewModeRef.current !== "screen" || phaseRef.current !== "dossier") return;
      const next = THREE.MathUtils.clamp(canvasScrollRef.current + event.deltaY * 0.72, 0, canvasMaxScrollRef.current);
      if (Math.abs(next - canvasScrollRef.current) > 0.001) {
        canvasScrollRef.current = next;
        event.preventDefault();
      }
    };
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      resetRendererViewport();
      if (heroFrameLocked) {
        syncHeroFrame(camera.aspect);
      }
    });

    resizeObserver.observe(mount);

    const worldPosition = new THREE.Vector3();
    const projectToDom = (object: THREE.Object3D) => {
      object.getWorldPosition(worldPosition);
      worldPosition.project(camera);
      return {
        x: (worldPosition.x * 0.5 + 0.5) * mount.clientWidth,
        y: (-worldPosition.y * 0.5 + 0.5) * mount.clientHeight,
        visible: worldPosition.z < 1,
      };
    };

    const drawScreenFailSafe = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#00ff66";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#003311";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 54px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText("SCREEN OK", w * 0.5, h * 0.5);
      ctx.restore();
    };

    const renderScreenCanvas = (time: number, power: number, introElapsed: number) => {
      const w = screenCanvas.width;
      const h = screenCanvas.height;
      const ctx = screenContext ?? screenCanvas.getContext("2d");
      if (!ctx) {
        screenTexture.needsUpdate = true;
        return;
      }
      try {
        enterButtonRectRef.current.visible = false;
        ctx.clearRect(0, 0, w, h);
        ctx.save();
      if (USE_GLB_TERMINAL && screenFlipXRef.current) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }
      if (!reducedMotionRef.current) {
        const jitterY = (Math.random() - 0.5) * 0.5;
        ctx.translate(0, jitterY);
      }
      if (DEBUG_PICKING) {
        ctx.fillStyle = "#00ff66";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#003311";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "700 56px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillText("SCREEN ACTIVE", w * 0.5, h * 0.5);
        ctx.restore();
        canvasPaintedRef.current = true;
        screenTexture.needsUpdate = true;
        return;
      }

      const phaseNow = phaseRef.current;
      const isIntroPhase = phaseNow === "intro" || phaseNow === "locked";
      const calibrationActive = false;
      const introVisualElapsed = introCompleteRef.current
        ? Math.max(introElapsed, INTRO_CANVAS_ENTER_START + INTRO_CANVAS_ENTER_FADE + 0.02)
        : introElapsed;
      const zoomBlend = authedRef.current ? smoothStep(0.18, 0.88, zoomProgressRef.current) : 0;
      const dossierBlend = phaseNow === "dossier" ? 1 : zoomBlend;
      const lockBlend = isIntroPhase ? 1 - dossierBlend : 0;
      const crtFallbackMode = forceFallbackMode && USE_GLB_TERMINAL;
      const GLASS_PAD = crtFallbackMode ? THREE.MathUtils.clamp(Math.min(w, h) * 0.02, 10, 16) : 0;
      const crtPanelX = crtFallbackMode ? GLASS_PAD : 0;
      const crtPanelY = crtFallbackMode ? GLASS_PAD : 0;
      const crtPanelW = crtFallbackMode ? w - crtPanelX * 2 : w;
      const crtPanelH = crtFallbackMode ? h - crtPanelY * 2 : h;
      const crtPanelRadius = crtFallbackMode ? 22 : 0;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);
      canvasReadyRef.current = true;

      ctx.filter = crtFallbackMode ? "saturate(1.05) contrast(1.05)" : "none";
      ctx.globalAlpha = 1;
      ctx.font = "700 46px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (crtFallbackMode) {
        // Mimic subtle CRT convex curvature without altering mesh geometry.
        ctx.translate(w * 0.5, h * 0.5);
        ctx.scale(1, 0.995);
        ctx.translate(-w * 0.5, -h * 0.5);
        ctx.save();
        ctx.shadowColor = "rgba(0,255,120,0.12)";
        ctx.shadowBlur = 20;
        ctx.fillStyle = "rgba(3,10,7,0.95)";
        roundedRectPath(ctx, crtPanelX, crtPanelY, crtPanelW, crtPanelH, crtPanelRadius);
        ctx.fill();
        ctx.restore();
        roundedRectPath(ctx, crtPanelX, crtPanelY, crtPanelW, crtPanelH, crtPanelRadius);
        ctx.clip();
        ctx.fillStyle = "#020905";
        ctx.fillRect(crtPanelX, crtPanelY, crtPanelW, crtPanelH);
      }

      if (isIntroPhase) {
        if (introVisualElapsed >= INTRO_CANVAS_BLACK_END) {
          const wakeT = clamp01(
            (introVisualElapsed - INTRO_CANVAS_BLACK_END) / (INTRO_CANVAS_GLOW_END - INTRO_CANVAS_BLACK_END)
          );
          const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.42, w * 0.72);
          glow.addColorStop(0, `rgba(112,255,170,${0.05 + wakeT * 0.22 + power * 0.08})`);
          glow.addColorStop(0.55, `rgba(68,170,108,${0.03 + wakeT * 0.12})`);
          glow.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, w, h);

          ctx.fillStyle = `rgba(190,255,222,${0.018 + wakeT * 0.03})`;
          for (let y = 0; y < h; y += 6) {
            const jitter = (Math.sin((time + y * 11) * 0.016) * 0.5 + 0.5) * w * 0.02;
            ctx.fillRect(-jitter, y, w + jitter * 2, 1);
          }
        }

        if (introVisualElapsed >= INTRO_CANVAS_TEXT_START && lockBlend > 0.001) {
          const lockAlpha = (0.74 + clamp01((introVisualElapsed - INTRO_CANVAS_TEXT_START) / 0.5) * 0.22) * lockBlend;
          ctx.fillStyle = `rgba(184,255,215,${lockAlpha})`;
          if (crtFallbackMode) {
            ctx.shadowColor = "rgba(127,255,181,0.35)";
            ctx.shadowBlur = 10;
          }
          ctx.fillText("TOP SECRET CLEARANCE REQUIRED", w * 0.5, h * 0.46);
          if (crtFallbackMode) {
            ctx.shadowBlur = 0;
          }
        }

        if (introVisualElapsed >= INTRO_CANVAS_ENTER_START && !authedRef.current && lockBlend > 0.001) {
          const enterAlpha =
            clamp01((introVisualElapsed - INTRO_CANVAS_ENTER_START) / INTRO_CANVAS_ENTER_FADE) * lockBlend;
          const buttonX = w * ENTER_UV_X0;
          const buttonW = w * (ENTER_UV_X1 - ENTER_UV_X0);
          const buttonY = h * (1 - ENTER_UV_Y1);
          const buttonH = h * (ENTER_UV_Y1 - ENTER_UV_Y0);
          enterButtonRectRef.current = { visible: enterAlpha > 0.33 };
          ctx.fillStyle = `rgba(8,26,16,${0.42 + enterAlpha * 0.5})`;
          ctx.fillRect(buttonX, buttonY, buttonW, buttonH);
          ctx.strokeStyle = `rgba(170,255,206,${0.3 + enterAlpha * 0.56})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(buttonX + 1, buttonY + 1, buttonW - 2, buttonH - 2);
          ctx.fillStyle = `rgba(184,255,216,${0.34 + enterAlpha * 0.6})`;
          ctx.font = "700 42px ui-monospace, SFMono-Regular, Menlo, monospace";
          if (crtFallbackMode) {
            ctx.shadowColor = "rgba(124,255,178,0.3)";
            ctx.shadowBlur = 8;
          }
          ctx.fillText("[ ENTER ]", w * 0.5, buttonY + buttonH * 0.55);
          if (crtFallbackMode) {
            ctx.shadowBlur = 0;
          }
        }
      }

      const showDossier = !calibrationActive && (phaseNow === "dossier" || dossierBlend > 0.001);
      if (showDossier) {
        const drawWrappedLine = (text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
          const words = text.split(/\s+/).filter(Boolean);
          let cursor = y;
          let line = "";
          for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(next).width > maxWidth) {
              ctx.fillText(line, x, cursor);
              line = word;
              cursor += lineHeight;
              continue;
            }
            line = next;
          }
          if (line) {
            ctx.fillText(line, x, cursor);
            cursor += lineHeight;
          }
          return cursor;
        };

        const panelPadding = crtFallbackMode ? THREE.MathUtils.clamp(Math.min(w, h) * 0.022, 10, 16) : 0;
        const panelX = crtFallbackMode ? crtPanelX : w * 0.048;
        const panelY = crtFallbackMode ? crtPanelY : h * 0.096;
        const panelW = crtFallbackMode ? crtPanelW : w * 0.904;
        const panelH = crtFallbackMode ? crtPanelH : h * 0.812;
        const panelRadius = crtFallbackMode ? 22 : Math.max(18, Math.min(panelW, panelH) * 0.04);
        const contentX = panelX + panelPadding;
        const contentY = panelY + panelPadding;
        const contentW = Math.max(120, panelW - panelPadding * 2);
        const contentH = Math.max(120, panelH - panelPadding * 2);
        const leftColW = contentW * 0.31;
        const rightX = contentX + leftColW + 26;
        const rightW = Math.max(120, contentW - leftColW - 42);
        const scroll = canvasScrollRef.current;

        ctx.save();
        ctx.globalAlpha *= phaseNow === "dossier" ? 1 : dossierBlend;
        if (crtFallbackMode) {
          ctx.save();
          ctx.shadowColor = "rgba(0,255,120,0.12)";
          ctx.shadowBlur = 28;
          ctx.fillStyle = "rgba(0,10,6,0.85)";
          roundedRectPath(ctx, panelX, panelY, panelW, panelH, panelRadius);
          ctx.fill();
          ctx.restore();
        }
        roundedRectPath(ctx, panelX, panelY, panelW, panelH, panelRadius);
        ctx.clip();

        ctx.fillStyle = crtFallbackMode ? "rgba(0,10,6,0.85)" : "rgba(6,18,11,0.88)";
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.fillStyle = "rgba(14,34,23,0.72)";
        ctx.fillRect(contentX, contentY, leftColW, contentH);
        ctx.strokeStyle = "rgba(145,224,183,0.18)";
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);
        ctx.beginPath();
        ctx.moveTo(contentX + leftColW + 0.5, contentY + 1);
        ctx.lineTo(contentX + leftColW + 0.5, contentY + contentH - 1);
        ctx.stroke();
        if (crtFallbackMode) {
          ctx.shadowColor = "rgba(123,255,179,0.32)";
          ctx.shadowBlur = 8;
        }

        let leftCursor = contentY + 46 - scroll * 0.32;
        let rightCursor = contentY + 52 - scroll;
        const sections = sanitizedSectionsRef.current;
        sections.forEach((section, sectionIndex) => {
          if (leftCursor > contentY - 100 && leftCursor < contentY + contentH + 80) {
            ctx.font = "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "rgba(159,233,194,0.72)";
            ctx.fillText(section.heading.toUpperCase(), contentX + 18, leftCursor);
            const barY = leftCursor + 10;
            for (let i = 0; i < 3; i += 1) {
              const widthFactor = 0.5 + ((sectionIndex + i) % 5) * 0.1;
              ctx.fillStyle = i === 0 ? "rgba(92,132,107,0.5)" : "rgba(77,113,92,0.42)";
              ctx.fillRect(contentX + 18, barY + i * 10, Math.max(18, leftColW * widthFactor - 22), 5);
            }
          }

          if (rightCursor > contentY - 140 && rightCursor < contentY + contentH + 120) {
            ctx.font = "700 16px ui-monospace, SFMono-Regular, Menlo, monospace";
            ctx.fillStyle = "rgba(170,242,201,0.88)";
            ctx.fillText(section.heading.toUpperCase(), rightX, rightCursor);
          }
          rightCursor += 30;
          ctx.font = "500 22px ui-monospace, SFMono-Regular, Menlo, monospace";
          section.body.forEach((line) => {
            if (rightCursor > contentY - 160 && rightCursor < contentY + contentH + 160) {
              ctx.fillStyle = "rgba(188,255,220,0.9)";
              rightCursor = drawWrappedLine(line, rightX, rightCursor, rightW, 32);
            } else {
              rightCursor += 32;
            }
          });
          rightCursor += 22;
          leftCursor += 84 + section.body.length * 9;
        });

        canvasMaxScrollRef.current = Math.max(0, rightCursor - (contentY + contentH) + 54);
        if (crtFallbackMode) {
          ctx.shadowBlur = 0;
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#050f0a";
        ctx.fillRect(0, 0, w, h);
      }

      const allowPostFx = !isIntroPhase || introVisualElapsed >= INTRO_CANVAS_BLACK_END;
      if (allowPostFx) {
        const scanlineOpacity = crtFallbackMode ? 0.08 : 0.03;
        const scanlineStep = crtFallbackMode ? 2 : 3;
        ctx.fillStyle = `rgba(192,255,220,${scanlineOpacity})`;
        for (let y = 0; y < h; y += scanlineStep) {
          ctx.fillRect(0, y, w, 1);
        }

        const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.28, w * 0.5, h * 0.5, w * 0.75);
        edge.addColorStop(0.72, "rgba(0,0,0,0)");
        edge.addColorStop(1, crtFallbackMode ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.4)");
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, w, h);
        if (crtFallbackMode) {
          const previousComposite = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = "overlay";
          if (ctx.globalCompositeOperation !== "overlay") {
            ctx.globalCompositeOperation = "source-over";
          }
          ctx.globalAlpha = 0.045;
          for (let i = 0; i < 260; i += 1) {
            const tone = Math.floor(96 + Math.random() * 96);
            ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
            ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = previousComposite;
        }
      }
        ctx.restore();
        if (!canvasPaintedRef.current) {
          const sample = ctx.getImageData((w * 0.5) | 0, (h * 0.5) | 0, 1, 1).data;
          canvasPaintedRef.current = sample[3] > 0 && sample[0] + sample[1] + sample[2] > 0;
        }
      } catch {
        drawScreenFailSafe(ctx, w, h);
        canvasPaintedRef.current = true;
      }
      screenTexture.needsUpdate = true;
    };

    let animationFrame = 0;
    let previousTime = 0;
    let startedAt = 0;
    const zoomScreenCam = new THREE.Vector3();
    const zoomSignedOffset = new THREE.Vector3();

    const renderFrame = (time: number) => {
      if (previousTime === 0) {
        previousTime = time;
        startedAt = time;
      }
      const dt = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;

      const elapsed = (time - startedAt) / 1000;
      const introElapsed = reducedMotionRef.current ? INTRO_CAMERA_END : elapsed;
      const introNorm = clamp01(introElapsed / INTRO_CAMERA_END);
      terminalModelRoot.visible = introElapsed >= INTRO_CANVAS_BLACK_END || introCompleteRef.current;
      if (!heroFrameLocked) {
        heroFrameWarmup += 1;
        if (heroFrameWarmup >= 2) {
          syncHeroFrame(camera.aspect);
        }
      }

      let blackoutOpacity = 0;
      if (!introBlackoutCompleteRef.current && !introCompleteRef.current) {
        if (introElapsed < INTRO_BOOT_BLACK_END) {
          blackoutOpacity = 1;
        } else if (introElapsed < INTRO_BOOT_FLASH_END) {
          const flashT = clamp01((introElapsed - INTRO_BOOT_BLACK_END) / (INTRO_BOOT_FLASH_END - INTRO_BOOT_BLACK_END));
          blackoutOpacity = THREE.MathUtils.lerp(1, 0.84, flashT);
        } else if (introElapsed < INTRO_BOOT_GLOW_END) {
          const glowT = clamp01((introElapsed - INTRO_BOOT_FLASH_END) / (INTRO_BOOT_GLOW_END - INTRO_BOOT_FLASH_END));
          blackoutOpacity = THREE.MathUtils.lerp(0.84, 0.56, glowT);
        } else if (introElapsed < INTRO_CAMERA_END) {
          const revealT = clamp01((introElapsed - INTRO_BOOT_GLOW_END) / (INTRO_CAMERA_END - INTRO_BOOT_GLOW_END));
          blackoutOpacity = THREE.MathUtils.lerp(0.56, 0, easeInOutCubic(revealT));
        } else {
          blackoutOpacity = 0;
        }
      }
      if (blackoutRef.current) {
        blackoutRef.current.style.opacity = `${blackoutOpacity}`;
        blackoutRef.current.style.zIndex = "60";
      }
      if (!introCompleteRef.current && introElapsed >= INTRO_CAMERA_END) {
        introBlackoutCompleteRef.current = true;
        introCompleteRef.current = true;
        window.setTimeout(() => setIntroComplete(true), 0);
      }

      stationRoot.scale.setScalar(1);
      {
        const screenMesh = screenMeshRef.current;
        if (screenMesh) {
          const useDebugFit = DEBUG_PICKING && screenGizmoReadyRef.current;
            let fitPosX: number = WORK_SCREEN_FIT_DEFAULT.pos[0];
            let fitPosY: number = WORK_SCREEN_FIT_DEFAULT.pos[1];
            let fitPosZ: number = WORK_SCREEN_FIT_DEFAULT.pos[2];
          let fitQuat = new THREE.Quaternion(
            WORK_SCREEN_FIT_DEFAULT.quat[0],
            WORK_SCREEN_FIT_DEFAULT.quat[1],
            WORK_SCREEN_FIT_DEFAULT.quat[2],
            WORK_SCREEN_FIT_DEFAULT.quat[3]
          );
            let fitWidth: number = WORK_SCREEN_FIT_DEFAULT.size[0];
            let fitHeight: number = WORK_SCREEN_FIT_DEFAULT.size[1];
            let fitPush: number = WORK_SCREEN_FIT_DEFAULT.push;
          if (useDebugFit) {
            const gizmo = screenGizmoLiveRef.current;
            fitPosX = gizmo.posX;
            fitPosY = gizmo.posY;
            fitPosZ = gizmo.posZ;
            fitQuat = new THREE.Quaternion().setFromEuler(
              new THREE.Euler(
                THREE.MathUtils.degToRad(gizmo.rotXDeg),
                THREE.MathUtils.degToRad(gizmo.rotYDeg),
                THREE.MathUtils.degToRad(gizmo.rotZDeg)
              )
            );
            fitWidth = gizmo.width;
            fitHeight = gizmo.height;
            fitPush = gizmo.push;
          }
          screenMesh.position.set(fitPosX, fitPosY, fitPosZ);
          screenMesh.quaternion.set(fitQuat.x, fitQuat.y, fitQuat.z, fitQuat.w);
          screenMesh.scale.set(fitWidth, fitHeight, 1);
          screenMesh.translateZ(fitPush);
          screenMesh.updateMatrixWorld(true);

          const fitSignature = `${fitPosX.toFixed(5)}|${fitPosY.toFixed(5)}|${fitPosZ.toFixed(5)}|${fitQuat.x.toFixed(5)}|${fitQuat.y.toFixed(5)}|${fitQuat.z.toFixed(5)}|${fitQuat.w.toFixed(5)}|${fitWidth.toFixed(5)}|${fitHeight.toFixed(5)}|${fitPush.toFixed(5)}`;
          const shouldRefreshSlab = pendingSlabHidePass || (DEBUG_PICKING && fitSignature !== lastSlabFitSignature);
          if (shouldRefreshSlab) {
            const hiddenPath = hideBlockingSlab();
            lastSlabFitSignature = fitSignature;
            pendingSlabHidePass = false;
            console.info(`[work] hidden slab: ${hiddenPath || "none"}`);
            if (DEBUG_PICKING) {
              console.log(`[work][debug] hiddenSlab: ${hiddenPath || "none"}`);
            }
          }
        }
      }

      const mode = viewModeRef.current;
      const isHeroMode = mode === "hero";
      let zoomProgress = mode === "screen" ? 1 : zoomProgressRef.current;
      if (mode === "zooming") {
        const start = zoomStartMsRef.current ?? time;
        zoomProgress = clamp01((time - start) / 1050);
      } else if (isHeroMode) {
        zoomProgress = 0;
      }
      zoomProgressRef.current = zoomProgress;

      const progress = swipeProgressRef.current;
      const authedState = authedRef.current || progress >= 0.86;

      const keyLightBoost = authedState ? 1.14 : 1;
      const keyBaseIntensity = DEBUG_VISIBILITY_LIFT ? 2.18 : 1.94;
      const fillBaseIntensity = DEBUG_VISIBILITY_LIFT ? (authedState ? 0.74 : 0.62) : authedState ? 0.64 : 0.56;
      const rimBaseIntensity = DEBUG_VISIBILITY_LIFT ? (authedState ? 1.02 : 0.9) : authedState ? 0.86 : 0.72;
      key.intensity = THREE.MathUtils.lerp(key.intensity, keyBaseIntensity * keyLightBoost, 1 - Math.exp(-8 * dt));
      fill.intensity = THREE.MathUtils.lerp(fill.intensity, fillBaseIntensity, 1 - Math.exp(-6 * dt));
      rim.intensity = THREE.MathUtils.lerp(rim.intensity, rimBaseIntensity, 1 - Math.exp(-6 * dt));
      ambient.intensity = THREE.MathUtils.lerp(
        ambient.intensity,
        DEBUG_VISIBILITY_LIFT ? (authedState ? 0.38 : 0.32) : authedState ? 0.3 : 0.26,
        1 - Math.exp(-6 * dt)
      );
      envFill.intensity = THREE.MathUtils.lerp(
        envFill.intensity,
        DEBUG_VISIBILITY_LIFT ? (authedState ? 0.28 : 0.22) : authedState ? 0.2 : 0.16,
        1 - Math.exp(-6 * dt)
      );
      rearRim.intensity = THREE.MathUtils.lerp(
        rearRim.intensity,
        DEBUG_VISIBILITY_LIFT ? (authedState ? 0.56 : 0.5) : authedState ? 0.42 : 0.36,
        1 - Math.exp(-6 * dt)
      );
      formKey.intensity = THREE.MathUtils.lerp(
        formKey.intensity,
        DEBUG_VISIBILITY_LIFT ? (authedState ? 0.56 : 0.48) : 0.26,
        1 - Math.exp(-6 * dt)
      );

      const screenBloomBoost = phaseRef.current === "flash" ? 0.24 : phaseRef.current === "boot" ? 0.14 : 0.04;
      const exposureTarget =
        (baseToneMappingExposure + introNorm * 0.3 + screenBloomBoost) *
        (authedState ? 1.1 : 1) *
        (DEBUG_VISIBILITY_LIFT ? 1.22 : 1);
      renderer.toneMappingExposure = THREE.MathUtils.lerp(
        renderer.toneMappingExposure,
        exposureTarget,
        1 - Math.exp(-6 * dt)
      );

      const isScreenFocused = mode === "zooming" || mode === "screen";
      const introCamT = reducedMotionRef.current
        ? 1
        : clamp01((introElapsed - INTRO_BOOT_GLOW_END) / (INTRO_CAMERA_END - INTRO_BOOT_GLOW_END));
      const introCamEase = easeInOutCubic(introCamT);
      const introYaw = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-17, -1.5, introCamEase));
      const introPitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(3.4, 0.2, introCamEase));
      if (isHeroMode) {
        stationRoot.rotation.y = THREE.MathUtils.lerp(
          stationRoot.rotation.y,
          introYaw,
          1 - Math.exp(-7 * dt)
        );
        stationRoot.rotation.x = THREE.MathUtils.lerp(
          stationRoot.rotation.x,
          introPitch,
          1 - Math.exp(-7 * dt)
        );
      }

      const finalFov = 24.8;
      if (isHeroMode) {
        if (heroFrameLocked) {
          const introHeroPos = new THREE.Vector3().copy(heroStartCamera).lerp(heroEndCamera, introCamEase);
          camera.position.copy(introHeroPos);
          const heroLook = new THREE.Vector3().copy(heroLookTarget);
          heroLook.x -= (1 - introCamEase) * 0.18;
          heroLook.y += (1 - introCamEase) * 0.06;
          camera.lookAt(heroLook);
        } else {
          camera.position.copy(cameraBase);
          camera.lookAt(0, 0.68, 0.26);
        }
        camera.fov = 33;
        zoomStartPoseCapturedRef.current = false;
      } else if (mode === "zooming") {
        if (!zoomTargetLockedRef.current) {
          lockZoomTarget();
        }
        if (!zoomStartPoseCapturedRef.current) {
          zoomStartCamPosWorldRef.current.copy(camera.position);
          zoomStartPoseCapturedRef.current = true;
        }
        const push = easeOutCubic(zoomProgress);
        zoomScreenCam.copy(zoomStartCamPosWorldRef.current).lerp(zoomLockedCamPosWorldRef.current, push);
        camera.position.lerp(zoomScreenCam, 1 - Math.exp(-10 * dt));
        zoomSignedOffset.copy(camera.position).sub(zoomScreenCenterWorldRef.current);
        if (zoomSignedOffset.dot(zoomScreenNormalWorldRef.current) < 0.45) {
          camera.position.copy(zoomScreenCenterWorldRef.current).addScaledVector(zoomScreenNormalWorldRef.current, 0.45);
        }
        camera.lookAt(zoomLockedLookAtWorldRef.current);
        camera.fov = THREE.MathUtils.lerp(camera.fov, THREE.MathUtils.lerp(33, finalFov, push), 1 - Math.exp(-10 * dt));
        if (zoomProgress >= 1) {
          zoomProgress = 1;
          zoomProgressRef.current = 1;
          zoomStartMsRef.current = null;
          viewModeRef.current = "screen";
          window.setTimeout(() => setViewMode("screen"), 0);
          if (USE_GLB_TERMINAL && phaseRef.current !== "dossier") {
            window.setTimeout(() => setPhase("dossier"), 0);
          }
        }
      } else {
        if (!zoomTargetLockedRef.current) {
          lockZoomTarget();
        }
        zoomProgress = 1;
        zoomProgressRef.current = 1;
        camera.position.lerp(zoomLockedCamPosWorldRef.current, 1 - Math.exp(-12 * dt));
        zoomSignedOffset.copy(camera.position).sub(zoomScreenCenterWorldRef.current);
        if (zoomSignedOffset.dot(zoomScreenNormalWorldRef.current) < 0.45) {
          camera.position.copy(zoomScreenCenterWorldRef.current).addScaledVector(zoomScreenNormalWorldRef.current, 0.45);
        }
        camera.lookAt(zoomLockedLookAtWorldRef.current);
        camera.fov = THREE.MathUtils.lerp(camera.fov, finalFov, 1 - Math.exp(-12 * dt));
      }
      camera.updateProjectionMatrix();
      const push = easeOutCubic(zoomProgress);
      if (peripheralRef.current) {
        peripheralRef.current.style.opacity = `${1 - push * (DEBUG_VISIBILITY_LIFT ? 0.54 : 0.72)}`;
      }
      const takeover = isHeroMode ? 0 : smoothStep(0.55, 1, zoomProgress);

      const leverTop = 0.54;
      const leverBottom = -0.52;
      const leverProgress = easeOutCubic(progress);
      const leverWobble = (1 - leverProgress) * 0.012 * (reducedMotionRef.current ? 0 : Math.sin(time * 0.012));
      const detentElapsed =
        authDetentStartMsRef.current === null ? 1 : clamp01((time - authDetentStartMsRef.current) / 240);
      const detentBounce = detentElapsed < 1 ? Math.sin(detentElapsed * Math.PI) * (1 - detentElapsed) * 0.065 : 0;
      const leverY = THREE.MathUtils.lerp(leverTop, leverBottom, leverProgress) + leverWobble - detentBounce;
      leverHandle.position.set(0.16, leverY, 0.15);
      leverHandle.rotation.set(0, 0, THREE.MathUtils.lerp(0.08, -0.18, leverProgress));
      const stemLength = Math.max(0.08, leverTop - leverY + 0.14);
      leverStem.scale.set(1, stemLength / 0.6, 1);
      leverStem.position.y = leverY + stemLength * 0.5 - 0.02;

      const thresholdDrive = smoothStep(0.62, 0.96, progress);
      const authAgeMs = authAcceptedMsRef.current === null ? 9999 : Math.max(0, time - authAcceptedMsRef.current);
      const authPulse = authAgeMs < 260 ? 1 - authAgeMs / 260 : 0;
      const scanSpeed = authedState ? 0.0066 : 0.0019 + thresholdDrive * 0.0052;
      const scanTravel = authedState
        ? ((time - startedAt) * scanSpeed) % 1
        : clamp01(progress * 0.78 + ((time - startedAt) * scanSpeed) % 0.26);
      ledScanner.position.y = 0.54 - scanTravel * 1.06;
      ledMaterial.emissiveIntensity = authedState
        ? 2.4 + authPulse * 0.7
        : 0.62 + progress * 1.4 + thresholdDrive * 1.2;
      (ledScanner.material as THREE.MeshStandardMaterial).emissiveIntensity = authedState
        ? 3.1 + authPulse * 1.1
        : 1.2 + thresholdDrive * 1.7;

      const wakeNorm =
        introElapsed < INTRO_BOOT_FLASH_END
          ? 0
          : clamp01((introElapsed - INTRO_BOOT_FLASH_END) / (INTRO_BOOT_GLOW_END - INTRO_BOOT_FLASH_END));
      const lockedPower =
        introElapsed < INTRO_BOOT_BLACK_END
          ? 0
          : introElapsed < INTRO_BOOT_FLASH_END
            ? THREE.MathUtils.lerp(0.1, 0.34, clamp01((introElapsed - INTRO_BOOT_BLACK_END) / 0.3))
            : 0.34 + wakeNorm * 0.46;
      const introPowerPhase = phaseRef.current === "intro" || phaseRef.current === "locked";
      const power = introPowerPhase ? lockedPower : phaseRef.current === "flash" ? 0.92 : phaseRef.current === "boot" ? 0.82 : 0.98;
      const flicker = reducedMotionRef.current ? 1 : 0.985 + Math.sin(time * 0.028) * 0.015;
      screenMaterial.opacity = 1;
      screenMaterial.color.setHex(0xffffff);
      const screenFocusBoost = isScreenFocused ? 1.34 : 1;
      const glowFocusBoost = isScreenFocused ? 1.4 : 1;
      const debugScreenBoost = DEBUG_VISIBILITY_LIFT ? 1.25 : 1;
      void flicker;
      void screenFocusBoost;
      void debugScreenBoost;
      keyCapMaterial.emissiveIntensity = 0.1 + power * 0.26;
      screenGlow.intensity = (0.26 + power * 0.92) * glowFocusBoost;
      keyboardSpill.intensity = THREE.MathUtils.lerp(
        keyboardSpill.intensity,
        (isScreenFocused ? 0.48 : 0.33) * (DEBUG_VISIBILITY_LIFT ? 1.22 : 1),
        1 - Math.exp(-6 * dt)
      );
      glassMaterial.opacity = DEBUG_VISIBILITY_LIFT ? (isScreenFocused ? 0.11 : 0.14) : isScreenFocused ? 0.14 : 0.17;
      glassMaterial.clearcoat = DEBUG_VISIBILITY_LIFT
        ? isScreenFocused
          ? 0.62
          : 0.5
        : isScreenFocused
          ? 0.56
          : 0.42;
      glassMaterial.clearcoatRoughness = isScreenFocused ? 0.15 : 0.2;
      powerLedMaterial.emissiveIntensity = 0.22 + power * (authedState ? 1.42 : 1.08);
      renderScreenCanvas(time, power, introElapsed);

      if (!USE_IMPORTED_TERMINAL && screenOverlayRef.current) {
        const style = screenOverlayRef.current.style;
        const p1 = projectToDom(screenTopLeft);
        const p2 = projectToDom(screenTopRight);
        const p3 = projectToDom(screenBottomLeft);
        const p4 = projectToDom(screenBottomRight);
        const left = Math.min(p1.x, p2.x, p3.x, p4.x);
        const top = Math.min(p1.y, p2.y, p3.y, p4.y);
        const right = Math.max(p1.x, p2.x, p3.x, p4.x);
        const bottom = Math.max(p1.y, p2.y, p3.y, p4.y);
        const visible = p1.visible || p2.visible || p3.visible || p4.visible;
        const pad = mode === "screen" ? 6 : 2;
        style.left = `${left - pad}px`;
        style.top = `${top - pad}px`;
        style.width = `${Math.max(44, right - left + pad * 2)}px`;
        style.height = `${Math.max(44, bottom - top + pad * 2)}px`;
        style.transform = "none";
        style.pointerEvents = mode === "screen" ? "auto" : "none";
        const projectedBase = mode === "zooming" ? Math.max(0.92, 1 - takeover * 0.06) : (visible ? 1 : 0.9);
        style.opacity = `${projectedBase}`;
        style.filter = `saturate(${1.06 + takeover * 0.2}) contrast(${1.06 + takeover * 0.14}) brightness(${1 + takeover * 0.08})`;
      }

      if (badgeLaneRef.current) {
        const start = projectToDom(slotStartAnchor);
        const end = projectToDom(slotEndAnchor);

        const laneHeight = Math.max(164, Math.abs(end.y - start.y) + 42);
        const laneTop = Math.min(start.y, end.y) - 18;
        const laneWidth = 102;
        const laneLeft = ((start.x + end.x) * 0.5) - laneWidth * 0.5;

        const laneStyle = badgeLaneRef.current.style;
        laneStyle.left = `${laneLeft}px`;
        laneStyle.top = `${laneTop}px`;
        laneStyle.width = `${laneWidth}px`;
        laneStyle.height = `${laneHeight}px`;

        const candidateDrag = Math.max(104, Math.min(240, Math.min(laneHeight - 60, root.clientHeight * 0.33)));
        if (Math.abs(candidateDrag - dragMaxRef.current) > 2 && !authedRef.current) {
          setDragMax(candidateDrag);
        }
      }
      if (autoOccluderFramesRemaining > 0) {
        const hidAny = runAutoOccluderPass();
        if (hidAny) {
          autoOccluderStableFrames = 0;
        } else {
          autoOccluderStableFrames += 1;
        }
        autoOccluderFramesRemaining = Math.max(0, autoOccluderFramesRemaining - 1);
        if (!forceFallbackMode && autoOccluderStableFrames >= OCCLUDER_STABLE_FRAMES) {
          autoOccluderFramesRemaining = 0;
        }
      }

      resetRendererViewport();
      renderer.render(scene, camera);
      if (canvasPaintedRef.current) {
        canvasPresentedFramesRef.current += 1;
      }
      animationFrame = window.requestAnimationFrame(renderFrame);
    };

    animationFrame = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();

      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", updateButtonHover);
      renderer.domElement.removeEventListener("pointerleave", onRendererPointerLeave);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onWindowKeyDown);
      screenMeshRef.current = null;
      chosenScreenMeshRef.current = null;

      if (leverLabelTexture) leverLabelTexture.dispose();
      if (slashTexture) slashTexture.dispose();
      if (caretTexture) caretTexture.dispose();
      if (holdTexture) holdTexture.dispose();
      if (chassisNoiseTexture) chassisNoiseTexture.dispose();
      if (keyNoiseTexture) keyNoiseTexture.dispose();
      if (shadowTexture) shadowTexture.dispose();
      if (terminalBadgeTexture) terminalBadgeTexture.dispose();
      prepareZoomTargetRef.current = () => undefined;
      zoomTargetLockedRef.current = false;
      zoomStartMsRef.current = null;
      zoomStartPoseCapturedRef.current = false;

      const disposeTextureValue = (value: unknown) => {
        if (value && typeof value === "object" && "isTexture" in value) {
          (value as THREE.Texture).dispose();
        }
      };

      scene.traverse((object: THREE.Object3D) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) {
          mesh.geometry.dispose();
        }

        const material = mesh.material;
        if (Array.isArray(material)) {
          material.forEach((item) => {
            if (!item) return;
            Object.values(item as unknown as Record<string, unknown>).forEach((value) => {
              disposeTextureValue(value);
            });
            item.dispose();
          });
        } else if (material) {
          Object.values(material as unknown as Record<string, unknown>).forEach((value) => {
            disposeTextureValue(value);
          });
          material.dispose();
        }
      });

      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, [
    applyScreenGizmoState,
    CLEAR_HIDDEN,
    CLEAR_SCREEN,
    DEBUG,
    DEBUG_PICKING,
    DEBUG_MESHES,
    USE_HARDCODED,
    CLEAR_FIT,
    FORCE_SCREEN,
    FALLBACK_OFFSET_X,
    FALLBACK_OFFSET_Y,
    FALLBACK_OFFSET_Z,
    FALLBACK_SCALE_X,
    FALLBACK_SCALE_Y,
    NO_AUTO_HIDE,
    forceBodyLC,
    forceHideLC,
    forceKeepLC,
    forceKeepRootLC,
    forceKeyboardLC,
    forceScreenLC,
    mounted,
    playAuthBeep,
    screenBindingRevision,
    skipIntro,
    startScreenZoom,
    terminalModelUrl,
  ]);

  const triggerAuth = useCallback(() => {
    if (authedRef.current) return;
    const acceptedNow = performance.now();
    authedRef.current = true;
    authFlashStartMsRef.current = acceptedNow;
    authAcceptedMsRef.current = acceptedNow;
    authDetentStartMsRef.current = acceptedNow;
    setAuthed(true);
    playAuthBeep();
    if (authZoomDelayRef.current !== null) {
      window.clearTimeout(authZoomDelayRef.current);
    }
    const zoomDelay = reducedMotionRef.current ? 0 : 220;
    authZoomDelayRef.current = window.setTimeout(() => {
      startScreenZoom();
      authZoomDelayRef.current = null;
    }, zoomDelay);
    animate(badgeY, dragMaxRef.current * 0.98, {
      type: "spring",
      stiffness: 260,
      damping: 21,
      mass: 0.74,
    });
  }, [badgeY, playAuthBeep, startScreenZoom]);

  useEffect(() => {
    triggerAuthRef.current = triggerAuth;
  }, [triggerAuth]);

  useEffect(() => {
    return () => {
      if (authZoomDelayRef.current !== null) {
        window.clearTimeout(authZoomDelayRef.current);
        authZoomDelayRef.current = null;
      }
    };
  }, []);

  const handleDragEnd = useCallback(() => {
    const progress = swipeProgressRef.current;
    if (progress >= 0.85) {
      triggerAuth();
      return;
    }

    animate(badgeY, 0, {
      type: "spring",
      stiffness: 220,
      damping: 24,
      mass: 0.8,
    });
  }, [badgeY, triggerAuth]);

  const handleDrag = useCallback(() => {
    if (authedRef.current) return;
    const current = badgeY.get();
    if (current >= dragMaxRef.current * 0.86) {
      triggerAuth();
      return;
    }
    const startMagnet = dragMaxRef.current * 0.16;
    const endMagnet = dragMaxRef.current * 0.82;
    const lipResistanceStart = dragMaxRef.current * 0.22;
    const lipResistanceEnd = dragMaxRef.current * 0.3;

    if (current > lipResistanceStart && current < lipResistanceEnd) {
      const resisted = lipResistanceStart + (current - lipResistanceStart) * 0.55;
      badgeY.set(resisted);
      return;
    }

    if (current > startMagnet && current < endMagnet) {
      const magnetized = startMagnet + (current - startMagnet) * 0.88;
      if (Math.abs(magnetized - current) > 0.45) {
        badgeY.set(magnetized);
      }
    }
  }, [badgeY, triggerAuth]);

  return (
    <div
      ref={rootRef}
      className="relative h-[100svh] w-full"
      onPointerDown={skipIntro}
    >
      <div ref={mountRef} className="absolute inset-0" />
      <div
        ref={peripheralRef}
        className="pointer-events-none absolute inset-0 z-[3] opacity-100"
        style={{
          display: USE_IMPORTED_TERMINAL ? "none" : "block",
          background: DEBUG_VISIBILITY_LIFT
            ? "radial-gradient(130% 94% at 50% 46%, rgba(10,24,18,0) 60%, rgba(0,0,0,0.24) 100%)"
            : "radial-gradient(130% 94% at 50% 46%, rgba(10,24,18,0) 58%, rgba(0,0,0,0.38) 100%)",
          mixBlendMode: "normal",
        }}
      />
      <div
        ref={blackoutRef}
        className="pointer-events-none absolute inset-0 z-[60] bg-black opacity-100"
        style={{ display: USE_IMPORTED_TERMINAL ? "none" : "block" }}
      />
      {mounted && DEBUG_PICKING ? (
        <div className="absolute right-3 top-3 z-[71] w-[280px] rounded border border-emerald-300/35 bg-black/80 p-3 font-mono text-[11px] text-emerald-100 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
          <div className="mb-2 text-emerald-200">Controls armed: {debugControlsArmed ? "yes" : "no"}</div>
          <div className="mb-3 text-emerald-300/90">Last key: {debugLastKey}</div>
          <div className="mb-3 text-emerald-300/90">screenFit: {debugScreenFitStatus}</div>
          <div className="text-emerald-300/80">model: {debugModelUrl || "(pending)"} | anchor: {debugScreenAnchorKind}</div>
          <div className="text-emerald-300/80">name: {debugSelectedScreenName || "(pending)"}</div>
          <div className="text-emerald-300/80">size: {debugScreenFitSize}</div>
          <div className="mb-2 text-emerald-300/80">pose: {debugScreenFitPose}</div>
          <div className="text-emerald-300/80">path: {debugSelectedScreenPath || "(pending)"}</div>
          <div className="text-emerald-300/80">kb: {debugSelectedKeyboardPath || "(pending)"} | body: {debugSelectedBodyPath || "(pending)"}</div>
          <div className="text-emerald-300/80">
            candidates: {debugCandidatesCount} fallback:{debugForceFallbackMode ? "1" : "0"} isFallback:{debugIsFallbackScreen ? "1" : "0"}
          </div>
          <div className="mb-2 text-emerald-300/80">
            hidden: {debugHiddenOccludersCount} latest:{debugLatestHiddenPath || "(none)"} auto:{debugAutoHiddenThisLoad || "(none)"}
          </div>
          <div className="text-emerald-300/80">useHardcoded: {USE_HARDCODED ? "true" : "false"} clearFit: {CLEAR_FIT ? "true" : "false"}</div>
          <div className="mb-2 text-emerald-300/80">
            fallbackBase: ({FALLBACK_SCREEN_LOCAL_X}, {FALLBACK_SCREEN_LOCAL_Y}, {FALLBACK_SCREEN_LOCAL_Z}) size=
            {FALLBACK_SCREEN_LOCAL_WIDTH * FALLBACK_INSET * FALLBACK_SCALE_X}x
            {FALLBACK_SCREEN_LOCAL_HEIGHT * FALLBACK_INSET * FALLBACK_SCALE_Y} z+{FALLBACK_SCREEN_PLANE_Z_OFFSET}
          </div>
          <div className="mb-3 text-emerald-300/80">
            overrides: screen={FORCE_SCREEN || "-"} keyboard={FORCE_KEYBOARD || "-"} keepRoot={FORCE_KEEPROOT || "-"} body=
            {FORCE_BODY || "-"}
          </div>
          <div className="mb-3 text-emerald-300/80">
            hide={FORCE_HIDE.length ? FORCE_HIDE.join(",") : "-"} keep={FORCE_KEEP.length ? FORCE_KEEP.join(",") : "-"} noAutoHide=
            {NO_AUTO_HIDE ? "true" : "false"}
          </div>
          <div className="mb-1 text-emerald-200/90">Nudge position</div>
          <div className="mb-3 grid grid-cols-3 gap-1">
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(-0.01, 0, 0, "BTN Left")}>
              Left
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(0, 0.01, 0, "BTN Up")}>
              Up
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(0.01, 0, 0, "BTN Right")}>
              Right
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(0, -0.01, 0, "BTN Down")}>
              Down
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(0, 0, -0.01, "BTN Z-")}>
              Z-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPosition(0, 0, 0.01, "BTN Z+")}>
              Z+
            </button>
          </div>
          <div className="mb-1 text-emerald-200/90">Rotate</div>
          <div className="mb-3 grid grid-cols-3 gap-1">
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(-0.5, 0, 0, "BTN RotX-")}>
              Rx-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(0, -0.5, 0, "BTN RotY-")}>
              Ry-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(0, 0, -0.5, "BTN RotZ-")}>
              Rz-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(0.5, 0, 0, "BTN RotX+")}>
              Rx+
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(0, 0.5, 0, "BTN RotY+")}>
              Ry+
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenRotation(0, 0, 0.5, "BTN RotZ+")}>
              Rz+
            </button>
          </div>
          <div className="mb-1 text-emerald-200/90">Size</div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenSize(-0.01, 0, "BTN W-")}>
              W-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenSize(0.01, 0, "BTN W+")}>
              W+
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenSize(0, -0.01, "BTN H-")}>
              H-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenSize(0, 0.01, "BTN H+")}>
              H+
            </button>
          </div>
          <div className="mb-1 text-emerald-200/90">Push</div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPush(-0.001, "BTN Push-")}>
              Push-
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={() => nudgeScreenPush(0.001, "BTN Push+")}>
              Push+
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={copyScreenGizmo}>
              Copy (C)
            </button>
            <button className="rounded border border-emerald-400/45 px-2 py-1 hover:bg-emerald-400/10" onClick={resetScreenGizmo}>
              Reset (R)
            </button>
          </div>
        </div>
      ) : null}
      <div ref={badgeLaneRef} className="pointer-events-none absolute z-30" style={{ display: USE_GLB_TERMINAL ? "none" : "block" }}>
        <motion.div
          className="pointer-events-auto absolute left-1/2 top-1 h-[90px] w-[58px] -translate-x-1/2 cursor-grab rounded-2xl border border-emerald-200/28 bg-[linear-gradient(180deg,rgba(207,234,222,0.95),rgba(157,183,170,0.9))] shadow-[0_10px_24px_rgba(0,0,0,0.42),inset_0_1px_2px_rgba(255,255,255,0.42)] active:cursor-grabbing"
          drag={!authed ? "y" : false}
          dragConstraints={{ top: 0, bottom: dragMax }}
          dragElastic={0.08}
          style={{ y: badgeY }}
          onDragStart={skipIntro}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          whileTap={{ scale: 0.985 }}
        >
          <div className="pointer-events-none absolute inset-x-2 top-2 h-5 rounded-full bg-emerald-950/28" />
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[8px] font-mono tracking-[0.24em] text-emerald-950/72">
            AUTH
          </div>
        </motion.div>
      </div>

    </div>
  );
}


