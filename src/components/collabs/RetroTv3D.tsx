"use client";

import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import styles from "./CollabsExperience.module.css";
import type { BootStage } from "./types";

type RetroTv3DProps = {
  tvOn: boolean;
  bootStage: BootStage;
  reducedMotion: boolean;
  children: ReactNode;
};

type TvDebugMode = "raw" | "fit" | null;

type TvScreenCalibLegacy = {
  pos: [number, number, number];
  rot: [number, number, number];
  size: [number, number];
  inset: number;
};

type TvScreenCalib = {
  ver: 4;
  posN: [number, number, number];
  rot: [number, number, number];
  sizeN: [number, number];
  inset: number;
};

type TvLocalBounds = {
  center: [number, number, number];
  size: [number, number, number];
};

type TvCalibCaps = {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
};

type ScreenRigLocal = {
  pos: [number, number, number];
  rot: [number, number, number];
  size: [number, number];
  sizeNSoft: [number, number];
  inset: number;
};

type PreparedTvModel = {
  scene: THREE.Group;
  fitScale: number;
  offset: [number, number, number];
};

const TV_YAW_STORAGE_KEY = "collabs.tvYawDeg";
const TV_HIDDEN_STORAGE_KEY = "collabs.tvHidden";
const TV_SCREEN_NAME_STORAGE_KEY = "collabs.tvScreenName";
const TV_SCREEN_RESET_DONE_KEY = "collabs.tvScreenResetDone";
const TV_CALIB_V4_KEY = "collabs.tvScreenCalib.v4";
const TV_CALIB_V3_KEY = "collabs.tvScreenCalib.v3";
const TV_CALIB_V2_KEY = "collabs.tvScreenCalib.v2";
const TV_CALIB_LEGACY_KEY = "collabs.tvScreenCalib";

const TV_HERO_WORLD_HEIGHT = 3.2;
const HERO_FILL_FACTOR = 0.88;
const CAMERA_Y_OFFSET_FACTOR = 0.05;
const TV_CANVAS_HEIGHT = "clamp(560px, 72vh, 880px)";
const RAW_SCALE = 1.6;
let didLogRawRender = false;
const MIN_SIZE_N = 0.1;
const MAX_SIZE_N_W = 1.35;
const MAX_SIZE_N_H = 1.2;
const SOFT_MAX_LOCAL_W_FACTOR = 1.15;
const SOFT_MAX_LOCAL_H_FACTOR = 0.95;

const DEFAULT_CALIB_LEGACY: TvScreenCalibLegacy = {
  pos: [-0.25, 0.05, 0.22],
  rot: [0, 0, 0],
  size: [1.55, 1.05],
  inset: 0.025,
};

const DEFAULT_CALIB_V4: TvScreenCalib = {
  ver: 4,
  posN: [0, 0, 0],
  rot: [0, 0, 0],
  sizeN: [0.45, 0.4],
  inset: 0.025,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseDebugMode(params: URLSearchParams): TvDebugMode {
  const value = params.get("tvDebug");
  if (value === "raw" || value === "fit") return value;
  if (params.has("tvDebug-raw")) return "raw";
  if (params.has("tvDebug-fit")) return "fit";
  return null;
}

function sanitizeLegacyCalib(input: Partial<TvScreenCalibLegacy> | null | undefined): TvScreenCalibLegacy {
  if (!input) return { ...DEFAULT_CALIB_LEGACY };
  const pos = Array.isArray(input.pos) && input.pos.length === 3 ? input.pos : DEFAULT_CALIB_LEGACY.pos;
  const rot = Array.isArray(input.rot) && input.rot.length === 3 ? input.rot : DEFAULT_CALIB_LEGACY.rot;
  const size = Array.isArray(input.size) && input.size.length === 2 ? input.size : DEFAULT_CALIB_LEGACY.size;
  const inset = typeof input.inset === "number" ? input.inset : DEFAULT_CALIB_LEGACY.inset;
  return {
    pos: [Number(pos[0]) || 0, Number(pos[1]) || 0, Number(pos[2]) || 0],
    rot: [Number(rot[0]) || 0, Number(rot[1]) || 0, Number(rot[2]) || 0],
    size: [clamp(Number(size[0]) || DEFAULT_CALIB_LEGACY.size[0], 0.01, 100), clamp(Number(size[1]) || DEFAULT_CALIB_LEGACY.size[1], 0.01, 100)],
    inset: clamp(Number(inset) || 0, 0, 0.08),
  };
}

function sanitizeCalibV4(input: Partial<TvScreenCalib> | null | undefined): TvScreenCalib {
  if (!input) return { ...DEFAULT_CALIB_V4 };
  const posN = Array.isArray(input.posN) && input.posN.length === 3 ? input.posN : DEFAULT_CALIB_V4.posN;
  const rot = Array.isArray(input.rot) && input.rot.length === 3 ? input.rot : DEFAULT_CALIB_V4.rot;
  const sizeN = Array.isArray(input.sizeN) && input.sizeN.length === 2 ? input.sizeN : DEFAULT_CALIB_V4.sizeN;
  const inset = typeof input.inset === "number" ? input.inset : DEFAULT_CALIB_V4.inset;
  return {
    ver: 4,
    posN: [Number(posN[0]) || 0, Number(posN[1]) || 0, Number(posN[2]) || 0],
    rot: [Number(rot[0]) || 0, Number(rot[1]) || 0, Number(rot[2]) || 0],
    sizeN: [
      clamp(Number(sizeN[0]) || DEFAULT_CALIB_V4.sizeN[0], MIN_SIZE_N, MAX_SIZE_N_W),
      clamp(Number(sizeN[1]) || DEFAULT_CALIB_V4.sizeN[1], MIN_SIZE_N, MAX_SIZE_N_H),
    ],
    inset: clamp(Number(inset) || 0, 0, 0.08),
  };
}

function localToNormalizedCalib(local: TvScreenCalibLegacy, bounds: TvLocalBounds): TvScreenCalib {
  const sx = Math.max(1e-6, bounds.size[0]);
  const sy = Math.max(1e-6, bounds.size[1]);
  const sz = Math.max(1e-6, bounds.size[2]);
  return sanitizeCalibV4({
    ver: 4,
    posN: [
      (local.pos[0] - bounds.center[0]) / sx,
      (local.pos[1] - bounds.center[1]) / sy,
      (local.pos[2] - bounds.center[2]) / sz,
    ],
    rot: [...local.rot],
    sizeN: [local.size[0] / sx, local.size[1] / sy],
    inset: local.inset,
  });
}

function normalizedToLocalCalib(calib: TvScreenCalib, bounds: TvLocalBounds): ScreenRigLocal {
  const sx = Math.max(1e-6, bounds.size[0]);
  const sy = Math.max(1e-6, bounds.size[1]);
  const sz = Math.max(1e-6, bounds.size[2]);
  const maxWidthLocal = sx * SOFT_MAX_LOCAL_W_FACTOR;
  const maxHeightLocal = sy * SOFT_MAX_LOCAL_H_FACTOR;
  const widthLocal = Math.min(calib.sizeN[0] * sx, maxWidthLocal);
  const heightLocal = Math.min(calib.sizeN[1] * sy, maxHeightLocal);
  const widthN = clamp(widthLocal / sx, MIN_SIZE_N, MAX_SIZE_N_W);
  const heightN = clamp(heightLocal / sy, MIN_SIZE_N, MAX_SIZE_N_H);
  return {
    pos: [
      bounds.center[0] + calib.posN[0] * sx,
      bounds.center[1] + calib.posN[1] * sy,
      bounds.center[2] + calib.posN[2] * sz,
    ],
    rot: [...calib.rot],
    size: [widthLocal, heightLocal],
    sizeNSoft: [widthN, heightN],
    inset: clamp(calib.inset, 0, 0.08),
  };
}

function readStoredCalibV4(): TvScreenCalib | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TV_CALIB_V4_KEY);
    if (!raw) return null;
    return sanitizeCalibV4(JSON.parse(raw) as Partial<TvScreenCalib>);
  } catch {
    return null;
  }
}

function readStoredLegacyCalib(): TvScreenCalibLegacy | null {
  if (typeof window === "undefined") return null;
  const legacyKeys = [TV_CALIB_V3_KEY, TV_CALIB_V2_KEY, TV_CALIB_LEGACY_KEY];
  for (const key of legacyKeys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<TvScreenCalibLegacy>;
      if (!parsed || !Array.isArray(parsed.pos) || !Array.isArray(parsed.size)) continue;
      return sanitizeLegacyCalib(parsed);
    } catch {
      continue;
    }
  }
  return null;
}

function getWorldBox(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

function getVisibleMeshBounds(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  let hasBounds = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const meshBox = new THREE.Box3().setFromObject(object);
    if (meshBox.isEmpty()) return;
    if (!hasBounds) {
      box.copy(meshBox);
      hasBounds = true;
    } else {
      box.union(meshBox);
    }
  });
  return hasBounds ? box : null;
}

function getRootLocalBoxFromObject(root: THREE.Object3D, source: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  source.updateWorldMatrix(true, true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const result = new THREE.Box3();
  const point = new THREE.Vector3();
  const worldPoint = new THREE.Vector3();
  let hasPoints = false;
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible || !object.geometry) return;
    let parent: THREE.Object3D | null = object;
    while (parent) {
      if (parent.userData?.screenRig === true) return;
      parent = parent.parent;
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const bbox = object.geometry.boundingBox;
    if (!bbox) return;
    for (let xi = 0; xi < 2; xi += 1) {
      for (let yi = 0; yi < 2; yi += 1) {
        for (let zi = 0; zi < 2; zi += 1) {
          point.set(
            xi ? bbox.max.x : bbox.min.x,
            yi ? bbox.max.y : bbox.min.y,
            zi ? bbox.max.z : bbox.min.z
          );
          worldPoint.copy(point).applyMatrix4(object.matrixWorld).applyMatrix4(rootInverse);
          result.expandByPoint(worldPoint);
          hasPoints = true;
        }
      }
    }
  });
  return hasPoints ? result : null;
}

function prepareTvModel(sourceScene: THREE.Group): PreparedTvModel {
  const cloned = sourceScene.clone(true);
  cloned.updateWorldMatrix(true, true);
  cloned.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  const bounds = getVisibleMeshBounds(cloned) ?? getWorldBox(cloned);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const fitScale = TV_HERO_WORLD_HEIGHT / Math.max(0.001, size.y);
  return {
    scene: cloned,
    fitScale,
    offset: [-center.x, -center.y, -center.z],
  };
}

function CameraAutoFrame({ model, tvModelRootRef }: { model: PreparedTvModel; tvModelRootRef: React.MutableRefObject<THREE.Group | null> }) {
  const { camera, size } = useThree();
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const root = tvModelRootRef.current;
    if (!root) return;
    const box = getVisibleMeshBounds(root) ?? getWorldBox(root);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const fittedSize = box.getSize(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const tanHalfFov = Math.max(1e-6, Math.tan(vFov * 0.5));
    const fitHeight = (fittedSize.y * 0.5) / tanHalfFov;
    const fitWidth = (fittedSize.x * 0.5) / Math.max(1e-6, tanHalfFov * camera.aspect);
    const dist = Math.max(fitHeight, fitWidth) / HERO_FILL_FACTOR;
    const cameraYOffset = fittedSize.y * CAMERA_Y_OFFSET_FACTOR;
    camera.position.set(center.x, center.y + cameraYOffset, center.z + dist);
    // eslint-disable-next-line react-hooks/immutability
    camera.near = Math.max(0.01, dist / 200);
    camera.far = dist * 200;
    camera.lookAt(center);
    camera.updateProjectionMatrix();
  }, [camera, model, size.height, size.width, tvModelRootRef]);
  return null;
}

type SceneProps = {
  model: PreparedTvModel;
  screen: ReactNode;
  tvOn: boolean;
  bootStage: BootStage;
  calibMode: boolean;
  debugMode: TvDebugMode;
  rawRender: boolean;
  reducedMotion: boolean;
  screenRigLocal: ScreenRigLocal | null;
  tvModelRootRef: React.MutableRefObject<THREE.Group | null>;
  tvGlbRef: React.MutableRefObject<THREE.Group | null>;
  rootRef: React.RefObject<HTMLDivElement | null>;
  tiltTargetRef: React.MutableRefObject<{ x: number; y: number }>;
  tiltCurrentRef: React.MutableRefObject<{ x: number; y: number }>;
};

function RetroTvScene({
  model,
  screen,
  tvOn,
  bootStage,
  calibMode,
  debugMode,
  rawRender,
  reducedMotion,
  screenRigLocal,
  tvModelRootRef,
  tvGlbRef,
  rootRef,
  tiltTargetRef,
  tiltCurrentRef,
}: SceneProps) {
  const parallaxRef = useRef<THREE.Group>(null);
  const showDebugOutline = (calibMode || debugMode === "fit") && !rawRender;
  const tvData = tvOn ? "on" : "off";
  const bootData = !tvOn ? "off" : bootStage === "on" ? "on" : "booting";
  const widthWorld = screenRigLocal?.size[0] ?? 0;
  const heightWorld = screenRigLocal?.size[1] ?? 0;
  const widthPx = 1280;
  const heightPx = Math.max(640, Math.round(widthPx * (heightWorld / Math.max(1e-6, widthWorld))));
  const htmlScale = (widthWorld * (1 - clamp(screenRigLocal?.inset ?? 0.025, 0, 0.08))) / widthPx;

  const glassGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1, 24, 16);
    const pos = geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const radial = Math.min(1, (x * 2) ** 2 + (y * 2) ** 2);
      pos.setZ(i, pos.getZ(i) + (1 - radial) * 0.035);
    }
    pos.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  const outlineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        -0.5, -0.5, 0, 0.5, -0.5, 0,
        0.5, -0.5, 0, 0.5, 0.5, 0,
        0.5, 0.5, 0, -0.5, 0.5, 0,
        -0.5, 0.5, 0, -0.5, -0.5, 0,
        -0.5, -0.5, 0, 0.5, 0.5, 0,
        0.5, -0.5, 0, -0.5, 0.5, 0,
      ], 3)
    );
    return geometry;
  }, []);

  useEffect(
    () => () => {
      glassGeometry.dispose();
      outlineGeometry.dispose();
    },
    [glassGeometry, outlineGeometry]
  );

  useFrame((state, delta) => {
    if (rawRender) return;
    const elapsed = state.clock.elapsedTime;
    const idleX = reducedMotion ? 0 : Math.sin(elapsed * 0.44) * 0.009;
    const idleY = reducedMotion ? 0 : Math.cos(elapsed * 0.37) * 0.013;
    const targetX = reducedMotion ? 0 : -tiltTargetRef.current.y * 0.08 + idleX;
    const targetY = reducedMotion ? 0 : tiltTargetRef.current.x * 0.115 + idleY;
    tiltCurrentRef.current.x = THREE.MathUtils.damp(tiltCurrentRef.current.x, targetX, 5.5, delta);
    tiltCurrentRef.current.y = THREE.MathUtils.damp(tiltCurrentRef.current.y, targetY, 5.5, delta);
    if (parallaxRef.current) {
      parallaxRef.current.rotation.x = tiltCurrentRef.current.x;
      parallaxRef.current.rotation.y = tiltCurrentRef.current.y;
      parallaxRef.current.position.y = THREE.MathUtils.damp(parallaxRef.current.position.y, idleX * 0.24, 3.8, delta);
    }
    if (rootRef.current) {
      rootRef.current.style.setProperty("--tv-parallax-x", `${(THREE.MathUtils.radToDeg(tiltCurrentRef.current.x) * 0.76).toFixed(3)}deg`);
      rootRef.current.style.setProperty("--tv-parallax-y", `${(THREE.MathUtils.radToDeg(tiltCurrentRef.current.y) * 0.76).toFixed(3)}deg`);
    }
  });

  if (rawRender) {
    return (
      <>
        <CameraAutoFrame model={model} tvModelRootRef={tvModelRootRef} />
        <ambientLight intensity={0.75} color="#ffffff" />
        <group position={model.offset} scale={model.fitScale * RAW_SCALE}>
          <group ref={tvModelRootRef}>
            <primitive object={model.scene} dispose={null} />
          </group>
        </group>
      </>
    );
  }

  return (
    <>
      <CameraAutoFrame model={model} tvModelRootRef={tvModelRootRef} />
      <group ref={parallaxRef}>
        <ambientLight intensity={0.5} color="#d7dff1" />
        <hemisphereLight args={["#dfe8ff", "#38281f", 0.45]} />
        <directionalLight castShadow position={[-3.2, 3.5, 4.4]} intensity={1.38} color="#ffe6cc" />
        <directionalLight position={[3.2, -1.0, 3.0]} intensity={0.6} color="#a9c6ef" />
        <pointLight position={[0.5, -1.1, 2.6]} intensity={0.46} color="#ffdcb8" distance={9} decay={1.95} />

        <group position={model.offset} scale={model.fitScale}>
          <group ref={tvModelRootRef}>
            <group ref={tvGlbRef}>
              <primitive object={model.scene} dispose={null} />
              {screenRigLocal ? (
                <group position={screenRigLocal.pos} rotation={screenRigLocal.rot} userData={{ screenRig: true }}>
                  <group scale={[widthWorld, heightWorld, 1]}>
                    <mesh position={[0, 0, -0.001]} renderOrder={6}>
                      <planeGeometry args={[1, 1]} />
                      <meshStandardMaterial color="#05070d" emissive={tvOn ? "#101a28" : "#020308"} emissiveIntensity={tvOn ? 0.18 : 0.06} transparent opacity={0.94} roughness={0.88} metalness={0} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                    <Html transform position={[0, 0, 0]} scale={htmlScale} style={{ width: `${widthPx}px`, height: `${heightPx}px`, pointerEvents: "none" }}>
                      <div className={styles.tvHtmlScreenHost} data-tv={tvData} data-boot={bootData} style={{ width: `${widthPx}px`, height: `${heightPx}px`, pointerEvents: "none" }}>
                        <div className={styles.tvHtmlScreenInset}>{screen}</div>
                      </div>
                    </Html>
                    <mesh geometry={glassGeometry} position={[0, 0, 0.002]} renderOrder={8} raycast={() => null}>
                      <meshPhysicalMaterial color="#0b1018" transparent opacity={0.12} transmission={0.85} roughness={0.18} thickness={0.1} ior={1.3} clearcoat={1} clearcoatRoughness={0.14} depthWrite={false} side={THREE.DoubleSide} />
                    </mesh>
                    {showDebugOutline ? (
                      <lineSegments geometry={outlineGeometry} position={[0, 0, 0.003]} renderOrder={9}>
                        <lineBasicMaterial color="#7fffd4" transparent opacity={0.92} depthWrite={false} />
                      </lineSegments>
                    ) : null}
                  </group>
                </group>
              ) : null}
            </group>
          </group>
        </group>
      </group>
    </>
  );
}

function RetroTv3DLoaded({ tvOn, bootStage, reducedMotion, children, rawRender }: RetroTv3DProps & { rawRender: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tvModelRootRef = useRef<THREE.Group | null>(null);
  const tvGlbRef = useRef<THREE.Group | null>(null);
  const rawControlsRef = useRef<OrbitControlsImpl | null>(null);
  const tiltTargetRef = useRef({ x: 0, y: 0 });
  const tiltCurrentRef = useRef({ x: 0, y: 0 });
  const [tvBounds, setTvBounds] = useState<TvLocalBounds | null>(null);
  const [calib, setCalib] = useState<TvScreenCalib | null>(null);
  const [calibInitialized, setCalibInitialized] = useState(false);
  const [calibCaps, setCalibCaps] = useState<TvCalibCaps>({ minW: 0.2, minH: 0.2, maxW: 10, maxH: 10 });
  const [calibControlMode, setCalibControlMode] = useState<"move" | "resize">("move");
  const calibRef = useRef<TvScreenCalib | null>(calib);
  const warnedInvalidBoundsRef = useRef(false);
  const gltf = useGLTF("/models/retro_tv.glb");

  const [debugMode] = useState<TvDebugMode>(() => (typeof window === "undefined" ? null : parseDebugMode(new URLSearchParams(window.location.search))));
  const [calibMode] = useState<boolean>(() => (typeof window === "undefined" ? false : new URLSearchParams(window.location.search).get("tvCalib") === "1"));
  const rawLike = rawRender || debugMode === "raw";
  const model = useMemo(() => prepareTvModel(gltf.scene), [gltf.scene]);

  useEffect(() => {
    calibRef.current = calib;
  }, [calib]);

  useEffect(() => {
    if (rawRender || typeof window === "undefined") return;
    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const tick = () => {
      if (cancelled) return;
      attempts += 1;
      const tvRoot = tvModelRootRef.current;
      const glbRoot = tvGlbRef.current;
      if (!tvRoot || !glbRoot) {
        if (attempts < 12) {
          raf = window.requestAnimationFrame(tick);
          return;
        }
        setTvBounds(null);
        if (!warnedInvalidBoundsRef.current) {
          console.warn("[RetroTv3D] tvGroup missing; screenRig disabled");
          warnedInvalidBoundsRef.current = true;
        }
        return;
      }
      const localBox = getRootLocalBoxFromObject(tvRoot, glbRoot);
      if (!localBox || localBox.isEmpty()) {
        setTvBounds(null);
        if (!warnedInvalidBoundsRef.current) {
          console.warn("[RetroTv3D] invalid TV bounds; screenRig disabled");
          warnedInvalidBoundsRef.current = true;
        }
        return;
      }
      const size = localBox.getSize(new THREE.Vector3());
      const center = localBox.getCenter(new THREE.Vector3());
      const valid =
        Number.isFinite(size.x) &&
        Number.isFinite(size.y) &&
        Number.isFinite(size.z) &&
        size.x > 1e-6 &&
        size.y > 1e-6 &&
        size.z > 1e-6;
      if (!valid) {
        setTvBounds(null);
        if (!warnedInvalidBoundsRef.current) {
          console.warn("[RetroTv3D] invalid TV bounds size; screenRig disabled");
          warnedInvalidBoundsRef.current = true;
        }
        return;
      }
      setTvBounds({
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
      });
      setCalibCaps({
        minW: size.x * 0.1,
        minH: size.y * 0.1,
        maxW: size.x * 0.92,
        maxH: size.y * 0.78,
      });
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
    };
  }, [model, rawRender]);

  useEffect(() => {
    if (rawRender || !tvBounds || calibInitialized || typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      const storedV4 = readStoredCalibV4();
      if (storedV4) {
        setCalib(storedV4);
        setCalibInitialized(true);
        return;
      }
      const legacy = readStoredLegacyCalib();
      if (legacy) {
        const migrated = localToNormalizedCalib(legacy, tvBounds);
        setCalib(migrated);
        window.localStorage.setItem(TV_CALIB_V4_KEY, JSON.stringify(migrated));
        setCalibInitialized(true);
        return;
      }
      setCalib(localToNormalizedCalib(DEFAULT_CALIB_LEGACY, tvBounds));
      setCalibInitialized(true);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [calibInitialized, rawRender, tvBounds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("tvScreenReset") !== "1") {
      window.sessionStorage.removeItem(TV_SCREEN_RESET_DONE_KEY);
      return;
    }
    if (window.sessionStorage.getItem(TV_SCREEN_RESET_DONE_KEY) === "1") return;
    window.localStorage.removeItem(TV_CALIB_V4_KEY);
    window.localStorage.removeItem(TV_CALIB_V3_KEY);
    window.localStorage.removeItem(TV_CALIB_V2_KEY);
    window.localStorage.removeItem(TV_CALIB_LEGACY_KEY);
    window.localStorage.removeItem(TV_HIDDEN_STORAGE_KEY);
    window.localStorage.removeItem("collabs.tvHiddenNames");
    window.localStorage.removeItem(TV_SCREEN_NAME_STORAGE_KEY);
    window.localStorage.removeItem(TV_YAW_STORAGE_KEY);
    window.sessionStorage.setItem(TV_SCREEN_RESET_DONE_KEY, "1");
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!calibMode || rawRender || !calib || !tvBounds) return;
    const stepInset = 0.005;
    const fallbackCalib = localToNormalizedCalib(DEFAULT_CALIB_LEGACY, tvBounds);
    const sizeX = Math.max(1e-6, tvBounds.size[0]);
    const sizeY = Math.max(1e-6, tvBounds.size[1]);
    const sizeZ = Math.max(1e-6, tvBounds.size[2]);
    const moveByLocal = (curr: TvScreenCalib, dx: number, dy: number, dz: number): TvScreenCalib => {
      const local = normalizedToLocalCalib(curr, tvBounds);
      return {
        ...curr,
        posN: [
          (local.pos[0] + dx - tvBounds.center[0]) / sizeX,
          (local.pos[1] + dy - tvBounds.center[1]) / sizeY,
          (local.pos[2] + dz - tvBounds.center[2]) / sizeZ,
        ],
      };
    };
    const resizeByLocal = (curr: TvScreenCalib, dw: number, dh: number): TvScreenCalib => {
      const local = normalizedToLocalCalib(curr, tvBounds);
      const nextW = clamp(local.size[0] + dw, calibCaps.minW, calibCaps.maxW);
      const nextH = clamp(local.size[1] + dh, calibCaps.minH, calibCaps.maxH);
      return {
        ...curr,
        sizeN: [nextW / sizeX, nextH / sizeY],
      };
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const stepPos = event.ctrlKey ? 0.03 : event.altKey ? 0.002 : 0.01;
      const stepSize = event.ctrlKey ? 0.08 : event.altKey ? 0.01 : 0.03;
      const stepRot = event.altKey ? Math.PI / 720 : Math.PI / 180;
      let handled = false;
      const apply = (fn: (curr: TvScreenCalib) => TvScreenCalib) =>
        setCalib((curr) => sanitizeCalibV4(fn(curr ?? fallbackCalib)));

      if (event.key === "Tab" || event.key === "`" || event.code === "Backquote") {
        event.preventDefault();
        setCalibControlMode((mode) => (mode === "move" ? "resize" : "move"));
        return;
      }

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          if (calibControlMode === "resize") apply((c) => resizeByLocal(c, -stepSize, 0));
          else apply((c) => moveByLocal(c, -stepPos, 0, 0));
          handled = true;
          break;
        case "ArrowRight":
          event.preventDefault();
          if (calibControlMode === "resize") apply((c) => resizeByLocal(c, stepSize, 0));
          else apply((c) => moveByLocal(c, stepPos, 0, 0));
          handled = true;
          break;
        case "ArrowUp":
          event.preventDefault();
          if (calibControlMode === "resize") apply((c) => resizeByLocal(c, 0, stepSize));
          else apply((c) => moveByLocal(c, 0, stepPos, 0));
          handled = true;
          break;
        case "ArrowDown":
          event.preventDefault();
          if (calibControlMode === "resize") apply((c) => resizeByLocal(c, 0, -stepSize));
          else apply((c) => moveByLocal(c, 0, -stepPos, 0));
          handled = true;
          break;
        default: {
          const key = event.key.toLowerCase();
          if (key === "q") {
            if (calibControlMode === "move") {
              event.preventDefault();
              apply((c) => moveByLocal(c, 0, 0, -stepPos));
              handled = true;
            }
          }
          else if (key === "e") {
            if (calibControlMode === "move") {
              event.preventDefault();
              apply((c) => moveByLocal(c, 0, 0, stepPos));
              handled = true;
            }
          }
          else if (key === "a") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0], c.rot[1] - stepRot, c.rot[2]] })); handled = true; }
          else if (key === "d") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0], c.rot[1] + stepRot, c.rot[2]] })); handled = true; }
          else if (key === "w") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0] + stepRot, c.rot[1], c.rot[2]] })); handled = true; }
          else if (key === "s") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0] - stepRot, c.rot[1], c.rot[2]] })); handled = true; }
          else if (key === "z") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0], c.rot[1], c.rot[2] - stepRot] })); handled = true; }
          else if (key === "c") { event.preventDefault(); apply((c) => ({ ...c, rot: [c.rot[0], c.rot[1], c.rot[2] + stepRot] })); handled = true; }
          else if (key === "j") { event.preventDefault(); apply((c) => resizeByLocal(c, -stepSize, 0)); handled = true; }
          else if (key === "l") { event.preventDefault(); apply((c) => resizeByLocal(c, stepSize, 0)); handled = true; }
          else if (key === "i") { event.preventDefault(); apply((c) => resizeByLocal(c, 0, stepSize)); handled = true; }
          else if (key === "k") { event.preventDefault(); apply((c) => resizeByLocal(c, 0, -stepSize)); handled = true; }
          else if (event.key === "[") { event.preventDefault(); apply((c) => ({ ...c, inset: c.inset - stepInset })); handled = true; }
          else if (event.key === "]") { event.preventDefault(); apply((c) => ({ ...c, inset: c.inset + stepInset })); handled = true; }
          else if (key === "r") { event.preventDefault(); setCalib(fallbackCalib); setCalibControlMode("move"); handled = true; }
          else if (key === "p") {
            event.preventDefault();
            const snapshot = sanitizeCalibV4(calibRef.current ?? fallbackCalib);
            window.localStorage.setItem(TV_CALIB_V4_KEY, JSON.stringify(snapshot));
            console.log("[RetroTv3D] saved calib", snapshot);
            handled = true;
          }
        }
      }
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [calib, calibCaps, calibControlMode, calibMode, rawRender, tvBounds]);

  const screenRigLocal = useMemo<ScreenRigLocal | null>(() => {
    if (rawRender || !tvBounds || !calib) return null;
    const local = normalizedToLocalCalib(calib, tvBounds);
    const valid =
      Number.isFinite(local.size[0]) &&
      Number.isFinite(local.size[1]) &&
      Number.isFinite(local.pos[0]) &&
      Number.isFinite(local.pos[1]) &&
      Number.isFinite(local.pos[2]) &&
      local.size[0] > 1e-6 &&
      local.size[1] > 1e-6;
    return valid ? local : null;
  }, [calib, rawRender, tvBounds]);

  useEffect(() => {
    if (rawRender || !calib || !screenRigLocal) return;
    const [softWn, softHn] = screenRigLocal.sizeNSoft;
    if (Math.abs(calib.sizeN[0] - softWn) < 1e-6 && Math.abs(calib.sizeN[1] - softHn) < 1e-6) return;
    const raf = window.requestAnimationFrame(() => {
      setCalib((curr) => {
        if (!curr) return curr;
        if (Math.abs(curr.sizeN[0] - softWn) < 1e-6 && Math.abs(curr.sizeN[1] - softHn) < 1e-6) return curr;
        return sanitizeCalibV4({
          ...curr,
          sizeN: [softWn, softHn],
        });
      });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [calib, rawRender, screenRigLocal]);

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reducedMotion || rawLike) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    tiltTargetRef.current.x = THREE.MathUtils.clamp(x, -1, 1);
    tiltTargetRef.current.y = THREE.MathUtils.clamp(y, -1, 1);
  };

  const onPointerLeave = () => {
    tiltTargetRef.current.x = 0;
    tiltTargetRef.current.y = 0;
  };

  const lampOn = tvOn && bootStage === "on";
  const hudWidth = screenRigLocal?.size[0] ?? 0;
  const hudHeight = screenRigLocal?.size[1] ?? 0;

  return (
    <div
      ref={rootRef}
      className={styles.tvModelRoot}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      style={
        {
          "--tv-parallax-x": "0deg",
          "--tv-parallax-y": "0deg",
          height: TV_CANVAS_HEIGHT,
        } as CSSProperties
      }
    >
      {!rawLike ? <div className={styles.tvModelHalo} aria-hidden="true" /> : null}
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.2, 4.6], fov: 24, near: 0.1, far: 40 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        className={styles.tvModelCanvas}
      >
        <RetroTvScene
          model={model}
          screen={children}
          tvOn={tvOn}
          bootStage={bootStage}
          calibMode={calibMode}
          debugMode={debugMode}
          rawRender={rawRender}
          reducedMotion={reducedMotion}
          screenRigLocal={screenRigLocal}
          tvModelRootRef={tvModelRootRef}
          tvGlbRef={tvGlbRef}
          rootRef={rootRef}
          tiltTargetRef={tiltTargetRef}
          tiltCurrentRef={tiltCurrentRef}
        />
        {rawRender ? <OrbitControls ref={rawControlsRef} makeDefault enableDamping dampingFactor={0.08} /> : null}
      </Canvas>
      {calibMode ? (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 80,
            pointerEvents: "none",
            fontSize: 12,
            lineHeight: 1.35,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            color: "#d9fff2",
            background: "rgba(5, 9, 14, 0.72)",
            border: "1px solid rgba(127,255,212,0.35)",
            borderRadius: 8,
            padding: "8px 10px",
            whiteSpace: "pre-line",
          }}
        >
          {calib && screenRigLocal
            ? `MODE ${calibControlMode.toUpperCase()}
W ${hudWidth.toFixed(3)} / maxW ${calibCaps.maxW.toFixed(3)}
H ${hudHeight.toFixed(3)} / maxH ${calibCaps.maxH.toFixed(3)}
inset ${clamp(calib.inset, 0, 0.08).toFixed(3)}
posN [${calib.posN.map((value) => value.toFixed(3)).join(", ")}]
sizeN [${calib.sizeN.map((value) => value.toFixed(3)).join(", ")}]
local W ${hudWidth.toFixed(3)} H ${hudHeight.toFixed(3)}`
            : "screenRig disabled (invalid TV bounds)"}
        </div>
      ) : null}
      {!rawLike ? <div className={styles.tvReadyLamp3d} data-power={lampOn ? "on" : "off"} aria-hidden="true" /> : null}
    </div>
  );
}

function RetroTv3DFallback({ tvOn, bootStage }: Pick<RetroTv3DProps, "tvOn" | "bootStage">) {
  const lampOn = tvOn && bootStage === "on";
  return (
    <div className={styles.tvModelRoot} style={{ height: TV_CANVAS_HEIGHT }}>
      <div className={styles.tvModelHalo} aria-hidden="true" />
      <div className={styles.tvModelCanvas} aria-hidden="true" />
      <div className={styles.tvReadyLamp3d} data-power={lampOn ? "on" : "off"} aria-hidden="true" />
    </div>
  );
}

export function RetroTv3D(props: RetroTv3DProps) {
  const [mounted, setMounted] = useState(false);
  const [rawRender, setRawRender] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enabled = params.get("tvRender") === "raw" || params.get("tvRenderer") === "raw";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRawRender(enabled);
    if (enabled && !didLogRawRender) {
      console.info("[RetroTv3D] RAW render enabled");
      didLogRawRender = true;
    }
    setMounted(true);
  }, []);

  const fallback = <RetroTv3DFallback tvOn={props.tvOn} bootStage={props.bootStage} />;
  if (!mounted) return fallback;

  return (
    <Suspense fallback={fallback}>
      <RetroTv3DLoaded {...props} rawRender={rawRender} />
    </Suspense>
  );
}

if (typeof window !== "undefined") {
  useGLTF.preload("/models/retro_tv.glb");
}
