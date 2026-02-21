"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type LensProjection = {
  x: number;
  y: number;
  r: number;
  visible: boolean;
};

export type ScreenAnchorPx = {
  x: number;
  y: number;
  visible: boolean;
};

export type PartTune = {
  x: number;
  y: number;
  out: number;
  rollDeg: number;
  w: number;
  h: number;
  d: number;
};

export type ContactTune = {
  version: number;
  lens: PartTune;
  flash: PartTune;
  view: PartTune;
};

type ScenePhase =
  | "lens_intro"
  | "lens_closeup"
  | "dolly_out"
  | "ready"
  | "capturing"
  | "ejecting"
  | "connected"
  | "retracting";

export type PolaroidCameraAssembly3DHandle = {
  trigger: () => boolean;
  triggerFlashOnly: () => void;
  putBack: () => Promise<void>;
  setInteractionEnabled: (enabled: boolean) => void;
};

type PolaroidCameraAssembly3DProps = {
  phase?: ScenePhase;
  timelineT?: number;
  captureNonce?: number;
  retractNonce?: number;
  isInteractive?: boolean;
  onCaptureIntent?: () => void;
  onPointerHoverChange?: (hovering: boolean) => void;
  onLensProject?: (projection: LensProjection) => void;
  onReady?: () => void;
  onCaptureStart?: () => void;
  onFlash?: () => void;
  onEjectDone?: () => void;
  onRetractDone?: () => void;
  onCardAnchorPx?: (projection: ScreenAnchorPx) => void;
  onStatusChange?: (status: string) => void;
  onGlbStatus?: (s: { status: "loading" | "loaded" | "error"; url: string; message?: string }) => void;
  tune?: ContactTune;
  onDebug?: (d: {
    glbStatus: "loading" | "loaded" | "error";
    url: string;
    totalMeshes: number;
    visibleMeshes: number;
    hiddenMeshes: number;
    pinkOverrideApplied: boolean;
    propHideApplied: boolean;
    componentCount: number;
    keptTris: number;
    totalTris: number;
    keptRatio: number;
    isolateApplied: boolean;
    cardAnchorProjected: boolean;
    lensFound?: boolean;
    lensCenter?: [number, number, number];
    lensRadius?: number;
    slotCreated?: boolean;
    photoCreated?: boolean;
    ejectState?: "idle" | "delayed" | "ejecting" | "done" | "retracting";
    ejectT?: number;
    createdParts?: boolean;
    flashCenter?: [number, number, number];
    viewCenter?: [number, number, number];
    faceRight?: [number, number, number];
    faceUp?: [number, number, number];
    faceN?: [number, number, number];
    partSizes?: {
      lensR: number;
      lensDepth: number;
      flashW: number;
      flashH: number;
      viewW: number;
      viewH: number;
    };
    bodyMaxDim?: number;
    partCount?: number;
    tune?: string;
    anchorPx?: { x: number; y: number; visible: boolean };
    message?: string;
  }) => void;
};

const GLB_URL = "/models/polaroid_pink.glb";
const DEBUG = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
const INTRO_SLOW = 1.1;
const PINK = 0xf6b6c8;
const WHITE = 0xf7f4ef;
const BEZEL = 0x141414;
const RUBBER = 0x0b0b0b;
const DARK_PLASTIC = 0x101010;
const GLASS_TINT = 0xeaf2ff;
const EXPOSURE_READY = 1.25;
const TARGET_SIZE = 1.35;
const HERO_FIT = 0.86;
const HERO_SETTLE_MS = 450;
const FACE_PAD_FRAC = 0.01;

const DEFAULT_TUNE: ContactTune = {
  version: 1,
  lens: { x: -0.02, y: -0.06, out: 0.01, rollDeg: 0, w: 0.165, h: 0.165, d: 0.04 },
  flash: { x: 0.18, y: 0.18, out: 0.01, rollDeg: 0, w: 0.17, h: 0.07, d: 0.03 },
  view: { x: 0.18, y: 0.02, out: 0.01, rollDeg: 0, w: 0.085, h: 0.085, d: 0.025 },
};

const EJECT_DELAY_MS = 240;
const EJECT_DUR_MS = 1150;

const BEATS = {
  sparkStart: 0.45 * INTRO_SLOW,
  macroStart: 1.1 * INTRO_SLOW,
  macroResolveEnd: 2.25 * INTRO_SLOW,
  revealStart: 2.25 * INTRO_SLOW,
  revealEnd: 3.95 * INTRO_SLOW,
  readyAt: 4.8 * INTRO_SLOW,
} as const;

const PHOTO = {
  retractDurationMs: 500,
} as const;

const FRAMING = {
  heroFov: 24,
  macroFov: 12.8,
  macroDistance: 0.11,
} as const;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function normalizePartTune(input: Partial<PartTune> | null | undefined, fallback: PartTune): PartTune {
  return {
    x: Number.isFinite(input?.x) ? (input!.x as number) : fallback.x,
    y: Number.isFinite(input?.y) ? (input!.y as number) : fallback.y,
    out: Number.isFinite(input?.out) ? (input!.out as number) : fallback.out,
    rollDeg: Number.isFinite(input?.rollDeg) ? (input!.rollDeg as number) : fallback.rollDeg,
    w: Number.isFinite(input?.w) ? (input!.w as number) : fallback.w,
    h: Number.isFinite(input?.h) ? (input!.h as number) : fallback.h,
    d: Number.isFinite(input?.d) ? (input!.d as number) : fallback.d,
  };
}

function normalizeTune(input: Partial<ContactTune> | null | undefined): ContactTune {
  if (!input || input.version !== DEFAULT_TUNE.version) {
    return {
      version: DEFAULT_TUNE.version,
      lens: { ...DEFAULT_TUNE.lens },
      flash: { ...DEFAULT_TUNE.flash },
      view: { ...DEFAULT_TUNE.view },
    };
  }
  return {
    version: DEFAULT_TUNE.version,
    lens: normalizePartTune(input.lens, DEFAULT_TUNE.lens),
    flash: normalizePartTune(input.flash, DEFAULT_TUNE.flash),
    view: normalizePartTune(input.view, DEFAULT_TUNE.view),
  };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function easeOutCubic(t: number) {
  const c = clamp01(t);
  return 1 - (1 - c) * (1 - c) * (1 - c);
}

function easeInOutCubic(t: number) {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) * 0.5;
}

function createMicroRoughnessTexture() {
  const size = 64;
  const seed = Math.random() * 1000;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const n0 = Math.sin((x * 12.9898 + y * 78.233 + seed) * 0.16) * 43758.5453;
      const n1 = Math.sin((x * 26.11 + y * 43.17 + seed * 0.73) * 0.09) * 19341.1734;
      const g = Math.round(((n0 - Math.floor(n0)) * 0.72 + (n1 - Math.floor(n1)) * 0.28) * 255);
      image.data[i] = g;
      image.data[i + 1] = g;
      image.data[i + 2] = g;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.needsUpdate = true;
  return tex;
}

function createPolaroidPhoto() {
  const group = new THREE.Group();
  const photo = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.72, 0.012),
    new THREE.MeshPhysicalMaterial({
      color: "#F7F4EF",
      roughness: 0.65,
      metalness: 0.0,
      clearcoat: 0.08,
      clearcoatRoughness: 0.42,
      emissive: new THREE.Color("#f5ebdc").multiplyScalar(0.015),
      emissiveIntensity: 0.2,
    })
  );
  photo.castShadow = true;
  photo.receiveShadow = true;
  group.add(photo);

  return group;
}

function computeBoundsRelativeTo(target: THREE.Object3D, relativeTo: THREE.Object3D) {
  target.updateWorldMatrix(true, true);
  relativeTo.updateWorldMatrix(true, false);
  const inverse = new THREE.Matrix4().copy(relativeTo.matrixWorld).invert();
  const box = new THREE.Box3().makeEmpty();

  target.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (!node.visible) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    const local = node.geometry.boundingBox
      .clone()
      .applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, node.matrixWorld));
    box.union(local);
  });

  return box;
}

function computeFitDistance(box: THREE.Box3, camera: THREE.PerspectiveCamera, fit = HERO_FIT) {
  const size = box.getSize(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * camera.aspect);
  const dW = size.x / (2 * Math.tan(hFov * 0.5) * fit);
  const dH = size.y / (2 * Math.tan(vFov * 0.5) * fit);
  return Math.max(dW, dH) + size.z * 0.22;
}

const PolaroidCameraAssembly3D = forwardRef<PolaroidCameraAssembly3DHandle, PolaroidCameraAssembly3DProps>(
  function PolaroidCameraAssembly3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);

    const phaseRef = useRef<ScenePhase>(props.phase ?? "lens_intro");
    const timelineRef = useRef<number>(Number.isFinite(props.timelineT) ? (props.timelineT as number) : 0);
    const isInteractiveRef = useRef<boolean>(!!props.isInteractive);
    const captureNonceRef = useRef<number>(props.captureNonce ?? 0);
    const retractNonceRef = useRef<number>(props.retractNonce ?? 0);
    const boundsBoxRef = useRef<THREE.Box3>(new THREE.Box3());
    const boundsSizeRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const boundsCenterRef = useRef<THREE.Vector3>(new THREE.Vector3());
    const maxDimRef = useRef(1);
    const bodyBoxRef = useRef<THREE.Box3 | null>(null);
    const bodyCenterRef = useRef(new THREE.Vector3());
    const bodySizeRef = useRef(new THREE.Vector3());
    const bodyMaxDimRef = useRef(1);
    const partsGroupRef = useRef<THREE.Group | null>(null);
    const heroMeshRef = useRef<THREE.Mesh | null>(null);
    const flashLightRef = useRef<THREE.PointLight | null>(null);
    const tuneRef = useRef<ContactTune>(normalizeTune(props.tune));
    const tuneVersionRef = useRef(0);

    const triggerFnRef = useRef<(() => boolean) | null>(null);
    const triggerFlashOnlyFnRef = useRef<(() => void) | null>(null);
    const putBackFnRef = useRef<(() => Promise<void>) | null>(null);
    const setInteractionFnRef = useRef<((enabled: boolean) => void) | null>(null);

    const callbacksRef = useRef({
      onCaptureIntent: props.onCaptureIntent,
      onPointerHoverChange: props.onPointerHoverChange,
      onLensProject: props.onLensProject,
      onReady: props.onReady,
      onCaptureStart: props.onCaptureStart,
      onFlash: props.onFlash,
      onEjectDone: props.onEjectDone,
      onRetractDone: props.onRetractDone,
      onCardAnchorPx: props.onCardAnchorPx,
      onStatusChange: props.onStatusChange,
      onGlbStatus: props.onGlbStatus,
      onDebug: props.onDebug,
    });

    useImperativeHandle(
      ref,
      () => ({
        trigger: () => triggerFnRef.current?.() ?? false,
        triggerFlashOnly: () => {
          triggerFlashOnlyFnRef.current?.();
        },
        putBack: () => putBackFnRef.current?.() ?? Promise.resolve(),
        setInteractionEnabled: (enabled: boolean) => {
          setInteractionFnRef.current?.(enabled);
        },
      }),
      []
    );

    useEffect(() => {
      if (props.phase) phaseRef.current = props.phase;
    }, [props.phase]);

    useEffect(() => {
      if (Number.isFinite(props.timelineT)) timelineRef.current = props.timelineT as number;
    }, [props.timelineT]);

    useEffect(() => {
      tuneRef.current = normalizeTune(props.tune);
      tuneVersionRef.current += 1;
    }, [props.tune]);

    useEffect(() => {
      isInteractiveRef.current = !!props.isInteractive;
    }, [props.isInteractive]);

    useEffect(() => {
      callbacksRef.current = {
        onCaptureIntent: props.onCaptureIntent,
        onPointerHoverChange: props.onPointerHoverChange,
        onLensProject: props.onLensProject,
        onReady: props.onReady,
        onCaptureStart: props.onCaptureStart,
        onFlash: props.onFlash,
        onEjectDone: props.onEjectDone,
        onRetractDone: props.onRetractDone,
        onCardAnchorPx: props.onCardAnchorPx,
        onStatusChange: props.onStatusChange,
        onGlbStatus: props.onGlbStatus,
        onDebug: props.onDebug,
      };
    }, [
      props.onCaptureIntent,
      props.onPointerHoverChange,
      props.onLensProject,
      props.onReady,
      props.onCaptureStart,
      props.onFlash,
      props.onEjectDone,
      props.onRetractDone,
      props.onCardAnchorPx,
      props.onStatusChange,
      props.onGlbStatus,
      props.onDebug,
    ]);

    useEffect(() => {
      const nonce = props.captureNonce ?? 0;
      if (nonce !== captureNonceRef.current) {
        captureNonceRef.current = nonce;
        triggerFnRef.current?.();
      }
    }, [props.captureNonce]);

    useEffect(() => {
      const nonce = props.retractNonce ?? 0;
      if (nonce !== retractNonceRef.current) {
        retractNonceRef.current = nonce;
        void putBackFnRef.current?.();
      }
    }, [props.retractNonce]);

    useEffect(() => {
      const mount = mountRef.current;
      if (!mount) return;

      THREE.ColorManagement.enabled = true;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = EXPOSURE_READY;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      console.debug("[contact-3d] renderer", {
        outputColorSpace: renderer.outputColorSpace,
        toneMapping: renderer.toneMapping,
        toneMappingExposure: renderer.toneMappingExposure,
        shadowMapEnabled: renderer.shadowMap.enabled,
        shadowMapType: renderer.shadowMap.type,
      });
      renderer.localClippingEnabled = true;
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      mount.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(FRAMING.heroFov, mount.clientWidth / mount.clientHeight, 0.01, 120);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const roomEnv = new RoomEnvironment();
      const envRT = pmrem.fromScene(roomEnv, 0.04);
      scene.environment = envRT.texture;

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0x101013, 0.9);
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.18);
      const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
      keyLight.position.set(3, 4, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.00028;
      keyLight.shadow.radius = 2.4;
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 24;
      const rimLight = new THREE.DirectionalLight(0xdfe9ff, 1.4);
      rimLight.position.set(-4, 2, -3);
      scene.add(hemiLight, ambientLight, keyLight, rimLight);
      scene.add(keyLight.target, rimLight.target);

      const rig = new THREE.Group();
      rig.position.set(0, -0.03, 0);
      rig.rotation.set(THREE.MathUtils.degToRad(2.8), THREE.MathUtils.degToRad(-1.5), THREE.MathUtils.degToRad(0.1));
      scene.add(rig);

      const cameraRoot = new THREE.Group();
      cameraRoot.rotation.set(THREE.MathUtils.degToRad(8.2), THREE.MathUtils.degToRad(-2.1), THREE.MathUtils.degToRad(0.25));
      rig.add(cameraRoot);

      const cameraBodyGroup = new THREE.Group();
      cameraRoot.add(cameraBodyGroup);

      const glbGroup = new THREE.Group();
      const modelContainer = new THREE.Group();
      const placeholderGroup = new THREE.Group();
      glbGroup.visible = false;
      placeholderGroup.visible = true;
      cameraBodyGroup.add(glbGroup, placeholderGroup);
      glbGroup.add(modelContainer);

      const placeholderBody = new THREE.Mesh(
        new THREE.BoxGeometry(1.42, 0.82, 0.62),
        new THREE.MeshStandardMaterial({ color: "#2a2a2a", roughness: 0.72, metalness: 0.08 })
      );
      placeholderBody.castShadow = true;
      placeholderBody.receiveShadow = true;
      placeholderGroup.add(placeholderBody);

      const roughnessTex = createMicroRoughnessTexture();
      const debugEnabled = DEBUG;

      const lensCenter = new THREE.Object3D();
      const lensEdge = new THREE.Object3D();
      const slotCenter = new THREE.Object3D();
      const flashCenterMarker = new THREE.Object3D();
      const viewCenterMarker = new THREE.Object3D();
      const cardAnchor = new THREE.Object3D();
      const boundsCenterMarker = new THREE.Object3D();
      glbGroup.add(lensCenter, lensEdge, slotCenter, flashCenterMarker, viewCenterMarker, cardAnchor, boundsCenterMarker);

      const lensGroup = new THREE.Group();
      const slotGroup = new THREE.Group();
      glbGroup.add(lensGroup, slotGroup);
      if (!partsGroupRef.current) {
        partsGroupRef.current = new THREE.Group();
        partsGroupRef.current.name = "__proceduralParts";
        scene.add(partsGroupRef.current);
      }
      const proceduralPartsGroup = partsGroupRef.current as THREE.Group;

      if (!flashLightRef.current) {
        flashLightRef.current = new THREE.PointLight(0xffffff, 0, 2, 2);
      }
      const flashLight = flashLightRef.current;
      flashLight.intensity = 0;
      flashLight.distance = 2;
      flashLight.decay = 2;
      scene.add(flashLight);
      let flashCoverMat: THREE.Material | null = null;
      let flashReflectorMat: THREE.MeshStandardMaterial | null = null;
      let flashBurstStartMs = 0;
      let flashBurstActive = false;

      const photo = createPolaroidPhoto();
      slotGroup.add(photo);

      const slotStart = new THREE.Vector3(0, 0, 0);
      const slotDock = new THREE.Vector3(0, 0, 0);
      const retractFrom = new THREE.Vector3();

      const setPhotoPose = (position: THREE.Vector3, progress: number, settleTilt = 0) => {
        const p = clamp01(progress);
        photo.position.copy(position);
        photo.rotation.set(mix(-0.064, -0.03, p) + settleTilt, 0, mix(0.002, -0.001, p));
      };

      setPhotoPose(slotStart, 0);
      photo.visible = false;

      let ejectState: "idle" | "delayed" | "ejecting" | "done" | "retracting" = "idle";
      let delayedStartMs = 0;
      let ejectStartMs = 0;
      let retractStartMs = 0;
      let ejectDoneSent = false;
      const retractResolvers: Array<() => void> = [];

      const resolveRetracts = () => {
        while (retractResolvers.length > 0) {
          retractResolvers.shift()?.();
        }
      };

      const triggerFlashBurst = () => {
        if (!flashCoverMat || !flashReflectorMat) {
          debugState.message = "flash refs missing";
          emitDebug(true);
          return;
        }
        flashBurstStartMs = performance.now();
        flashBurstActive = true;
      };

      const updateFlashBurst = (now: number) => {
        if (!flashCoverMat || !flashReflectorMat) {
          flashLight.intensity = 0;
          return;
        }
        const coverWithEmissive = flashCoverMat as THREE.Material & {
          emissive?: THREE.Color;
          emissiveIntensity?: number;
        };
        if (!flashBurstActive) {
          if (typeof coverWithEmissive.emissiveIntensity === "number") {
            coverWithEmissive.emissiveIntensity = 0;
          }
          flashReflectorMat.emissiveIntensity = 0.08;
          flashLight.intensity = 0;
          return;
        }
        const durationMs = 140;
        const t = clamp01((now - flashBurstStartMs) / durationMs);
        const spike = t < 0.45 ? t / 0.45 : 1 - (t - 0.45) / 0.55;
        const k = Math.max(0, spike);
        if (coverWithEmissive.emissive) {
          coverWithEmissive.emissive.setHex(0xffffff);
        }
        if (typeof coverWithEmissive.emissiveIntensity === "number") {
          coverWithEmissive.emissiveIntensity = 0.9 * k;
        }
        flashReflectorMat.emissive.setHex(0xffffff);
        flashReflectorMat.emissiveIntensity = 0.08 + 2.12 * k;
        flashLight.intensity = 55 * k;
        if (t >= 1) {
          flashBurstActive = false;
          if (typeof coverWithEmissive.emissiveIntensity === "number") {
            coverWithEmissive.emissiveIntensity = 0;
          }
          flashReflectorMat.emissiveIntensity = 0.08;
          flashLight.intensity = 0;
        }
      };

      const triggerEject = () => {
        if (ejectState === "delayed" || ejectState === "ejecting" || ejectState === "retracting") return false;
        delayedStartMs = performance.now();
        ejectState = "delayed";
        debugState.ejectState = ejectState;
        debugState.ejectT = 0;
        ejectDoneSent = false;
        photo.visible = false;
        setPhotoPose(slotStart, 0);
        callbacksRef.current.onFlash?.();
        callbacksRef.current.onCaptureStart?.();
        callbacksRef.current.onStatusChange?.("Capturing");
        emitDebug(true);
        return true;
      };

      const retractPhoto = () =>
        new Promise<void>((resolve) => {
          retractResolvers.push(resolve);
          if (ejectState === "idle") {
            photo.visible = false;
            setPhotoPose(slotStart, 0);
            debugState.ejectState = ejectState;
            debugState.ejectT = 0;
            callbacksRef.current.onRetractDone?.();
            callbacksRef.current.onStatusChange?.("Ready");
            resolveRetracts();
            return;
          }
          if (ejectState !== "retracting") {
            if (!photo.visible) {
              photo.visible = true;
              setPhotoPose(slotStart, 0);
            }
            retractFrom.copy(photo.position);
            retractStartMs = performance.now();
            ejectState = "retracting";
            debugState.ejectState = ejectState;
            debugState.ejectT = 0;
            callbacksRef.current.onStatusChange?.("Retracting");
            emitDebug(true);
          }
        });

      triggerFnRef.current = triggerEject;
      triggerFlashOnlyFnRef.current = () => {
        triggerFlashBurst();
      };
      putBackFnRef.current = retractPhoto;
      setInteractionFnRef.current = (enabled: boolean) => {
        isInteractiveRef.current = enabled;
      };

      let hasGlb = false;
      const lensCenterLocal = new THREE.Vector3(0, 0, 0);
      const debugState: {
        glbStatus: "loading" | "loaded" | "error";
        url: string;
        totalMeshes: number;
        visibleMeshes: number;
        hiddenMeshes: number;
        pinkOverrideApplied: boolean;
        propHideApplied: boolean;
        componentCount: number;
        keptTris: number;
        totalTris: number;
        keptRatio: number;
        isolateApplied: boolean;
        cardAnchorProjected: boolean;
        lensFound?: boolean;
        lensCenter?: [number, number, number];
        lensRadius?: number;
        slotCreated?: boolean;
        photoCreated?: boolean;
        ejectState?: "idle" | "delayed" | "ejecting" | "done" | "retracting";
        ejectT?: number;
        createdParts?: boolean;
        flashCenter?: [number, number, number];
        viewCenter?: [number, number, number];
        faceRight?: [number, number, number];
        faceUp?: [number, number, number];
        faceN?: [number, number, number];
        partSizes?: {
          lensR: number;
          lensDepth: number;
          flashW: number;
          flashH: number;
          viewW: number;
          viewH: number;
        };
        bodyMaxDim?: number;
        partCount?: number;
        tune?: string;
        anchorPx?: { x: number; y: number; visible: boolean };
        message?: string;
      } = {
        glbStatus: "loading",
        url: GLB_URL,
        totalMeshes: 0,
        visibleMeshes: 0,
        hiddenMeshes: 0,
        pinkOverrideApplied: false,
        propHideApplied: false,
        componentCount: 0,
        keptTris: 0,
        totalTris: 0,
        keptRatio: 0,
        isolateApplied: false,
        cardAnchorProjected: false,
        lensFound: false,
        slotCreated: false,
        photoCreated: false,
        ejectState: "idle",
        ejectT: 0,
        createdParts: false,
        bodyMaxDim: undefined,
        partCount: 0,
      };
      let lastDebugEmitMs = 0;
      const emitDebug = (force = false) => {
        if (!debugEnabled) return;
        const now = performance.now();
        if (!force && now - lastDebugEmitMs < 250) return;
        lastDebugEmitMs = now;
        callbacksRef.current.onDebug?.({ ...debugState });
      };
      const emitGlbStatus = (s: { status: "loading" | "loaded" | "error"; url: string; message?: string }) => {
        callbacksRef.current.onGlbStatus?.(s);
        (window as Window & { __CONTACT_GLB_STATUS?: typeof s }).__CONTACT_GLB_STATUS = s;
        debugState.glbStatus = s.status;
        debugState.url = s.url;
        debugState.message = s.message;
        emitDebug(true);
      };

      const meshBoxInGlbSpace = (mesh: THREE.Mesh) => {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        if (!mesh.geometry.boundingBox) return null;
        const toLocal = new THREE.Matrix4().copy(glbGroup.matrixWorld).invert();
        return mesh.geometry.boundingBox
          .clone()
          .applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld));
      };

      const collectMeshes = (root: THREE.Object3D) => {
        root.updateWorldMatrix(true, true);
        glbGroup.updateWorldMatrix(true, true);
        const meshes: Array<{ mesh: THREE.Mesh; box: THREE.Box3; center: THREE.Vector3; size: THREE.Vector3 }> = [];
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          const box = meshBoxInGlbSpace(node);
          if (!box || box.isEmpty()) return;
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          meshes.push({ mesh: node, box, center, size });
        });
        return meshes;
      };

      type IsolationResult = {
        componentCount: number;
        keptTris: number;
        totalTris: number;
        keptRatio: number;
        isolateApplied: boolean;
        message?: string;
      };

      const isolateLargestConnectedComponent = (mesh: THREE.Mesh): IsolationResult => {
        const geometry = mesh.geometry;
        if (!(geometry instanceof THREE.BufferGeometry)) {
          return {
            componentCount: 0,
            keptTris: 0,
            totalTris: 0,
            keptRatio: 0,
            isolateApplied: false,
            message: "Primary mesh does not use BufferGeometry.",
          };
        }

        const position = geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
        if (!position || position.itemSize < 3 || position.count < 3) {
          return {
            componentCount: 0,
            keptTris: 0,
            totalTris: 0,
            keptRatio: 0,
            isolateApplied: false,
            message: "Primary mesh geometry has no valid positions.",
          };
        }

        const vertexCount = position.count;
        const hasIndex = !!geometry.index;
        const indexArray = geometry.index?.array;
        const triCount = hasIndex
          ? Math.floor((geometry.index?.count ?? 0) / 3)
          : Math.floor(vertexCount / 3);
        if (triCount <= 0) {
          return {
            componentCount: 0,
            keptTris: 0,
            totalTris: 0,
            keptRatio: 0,
            isolateApplied: false,
            message: "Primary mesh has zero triangles.",
          };
        }

        const parent = new Int32Array(vertexCount);
        const rank = new Uint8Array(vertexCount);
        for (let i = 0; i < vertexCount; i += 1) parent[i] = i;

        const find = (x: number) => {
          let p = x;
          while (parent[p] !== p) p = parent[p];
          while (parent[x] !== x) {
            const next = parent[x];
            parent[x] = p;
            x = next;
          }
          return p;
        };

        const union = (a: number, b: number) => {
          const ra = find(a);
          const rb = find(b);
          if (ra === rb) return;
          if (rank[ra] < rank[rb]) {
            parent[ra] = rb;
            return;
          }
          if (rank[ra] > rank[rb]) {
            parent[rb] = ra;
            return;
          }
          parent[rb] = ra;
          rank[ra] += 1;
        };

        let rep: Int32Array | null = null;
        if (!hasIndex) {
          rep = new Int32Array(vertexCount);
          const quantizedToRep = new Map<string, number>();
          const invStep = 100000;
          for (let i = 0; i < vertexCount; i += 1) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            const key = `${Math.round(x * invStep)},${Math.round(y * invStep)},${Math.round(z * invStep)}`;
            const existing = quantizedToRep.get(key);
            if (existing !== undefined) rep[i] = existing;
            else {
              quantizedToRep.set(key, i);
              rep[i] = i;
            }
          }
        }

        const resolveRep = (vertexIndex: number) => (rep ? rep[vertexIndex] : vertexIndex);
        const resolveTri = (triIndex: number): [number, number, number] => {
          if (hasIndex && indexArray) {
            const offset = triIndex * 3;
            return [indexArray[offset] as number, indexArray[offset + 1] as number, indexArray[offset + 2] as number];
          }
          const base = triIndex * 3;
          return [base, base + 1, base + 2];
        };

        let totalTris = 0;
        for (let tri = 0; tri < triCount; tri += 1) {
          const [aOrig, bOrig, cOrig] = resolveTri(tri);
          if (aOrig >= vertexCount || bOrig >= vertexCount || cOrig >= vertexCount) continue;
          const a = resolveRep(aOrig);
          const b = resolveRep(bOrig);
          const c = resolveRep(cOrig);
          union(a, b);
          union(b, c);
          union(a, c);
          totalTris += 1;
        }

        const triCounts = new Map<number, number>();
        for (let tri = 0; tri < triCount; tri += 1) {
          const [aOrig, bOrig, cOrig] = resolveTri(tri);
          if (aOrig >= vertexCount || bOrig >= vertexCount || cOrig >= vertexCount) continue;
          const root = find(resolveRep(aOrig));
          triCounts.set(root, (triCounts.get(root) ?? 0) + 1);
        }

        let keptRoot = -1;
        let keptTris = 0;
        triCounts.forEach((count, root) => {
          if (count > keptTris) {
            keptTris = count;
            keptRoot = root;
          }
        });

        const componentCount = triCounts.size;
        const keptRatio = totalTris > 0 ? keptTris / totalTris : 0;
        if (componentCount <= 1) {
          return {
            componentCount,
            keptTris,
            totalTris,
            keptRatio,
            isolateApplied: false,
            message:
              "GLB is 1 connected component; cannot remove props automatically. Need cleaned GLB export or different model.",
          };
        }

        const keptIndices: number[] = [];
        for (let tri = 0; tri < triCount; tri += 1) {
          const [aOrig, bOrig, cOrig] = resolveTri(tri);
          if (aOrig >= vertexCount || bOrig >= vertexCount || cOrig >= vertexCount) continue;
          const root = find(resolveRep(aOrig));
          if (root === keptRoot) {
            keptIndices.push(aOrig, bOrig, cOrig);
          }
        }

        if (keptIndices.length === 0) {
          return {
            componentCount,
            keptTris,
            totalTris,
            keptRatio,
            isolateApplied: false,
            message: "Connected-component isolation found no triangles for kept component.",
          };
        }

        const oldGeometry = mesh.geometry as THREE.BufferGeometry;
        const newGeometry = oldGeometry.clone();
        newGeometry.setIndex(keptIndices);
        newGeometry.computeBoundingBox();
        newGeometry.computeBoundingSphere();
        mesh.geometry = newGeometry;

        return {
          componentCount,
          keptTris,
          totalTris,
          keptRatio,
          isolateApplied: true,
        };
      };

      const applyModelMaterials = (root: THREE.Object3D) => {
        let changed = 0;
        root.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          if (!node.visible) return;
          if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
          const mat = new THREE.MeshPhysicalMaterial({
            color: PINK,
            emissive: 0x000000,
            roughness: 0.55,
            metalness: 0,
            clearcoat: 0.35,
            clearcoatRoughness: 0.22,
            roughnessMap: roughnessTex || undefined,
            side: THREE.DoubleSide,
            vertexColors: false,
          });

          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
          else node.material.dispose();
          node.material = mat;
          mat.needsUpdate = true;
          node.castShadow = false;
          node.receiveShadow = false;
          changed += 1;
        });
        debugState.pinkOverrideApplied = changed > 0;
        emitDebug(true);
      };

      type FaceLayout = {
        centerWorld: THREE.Vector3;
        sizeWorld: THREE.Vector3;
        maxDim: number;
        faceN: THREE.Vector3;
        faceRight: THREE.Vector3;
        faceUp: THREE.Vector3;
        facePoint: THREE.Vector3;
        lensCenterWorld: THREE.Vector3;
        flashCenterWorld: THREE.Vector3;
        viewCenterWorld: THREE.Vector3;
        cardAnchorWorld: THREE.Vector3;
        q: THREE.Quaternion;
        lensSide: number;
        lensR: number;
        lensDepth: number;
        flashW: number;
        flashH: number;
        flashD: number;
        viewW: number;
        viewH: number;
        viewD: number;
      };

      const raycastHit = (target: THREE.Vector3, hero: THREE.Object3D, towardCamN: THREE.Vector3, maxDim: number) => {
        const origin = target.clone().add(towardCamN.clone().multiplyScalar(0.6 * maxDim));
        const dir = towardCamN.clone().negate();
        const ray = new THREE.Raycaster(origin, dir, 0, 2.0 * maxDim);
        const hits = ray.intersectObject(hero, true);
        if (!hits.length) return null;

        const h = hits[0];
        const p = h.point.clone();
        const n = new THREE.Vector3(0, 0, 1);
        if (h.face && h.object) {
          n.copy(h.face.normal).transformDirection(h.object.matrixWorld).normalize();
        } else {
          n.copy(towardCamN).normalize();
        }

        return { point: p, normal: n };
      };

      const computeFaceLayout = (): FaceLayout | null => {
        const boxWorld = bodyBoxRef.current;
        const hero = heroMeshRef.current;
        if (!boxWorld || boxWorld.isEmpty() || !hero) return null;
        hero.updateWorldMatrix(true, true);
        const tune = tuneRef.current;
        const centerWorld = bodyCenterRef.current.clone();
        const sizeWorld = bodySizeRef.current.clone();
        const maxDim = bodyMaxDimRef.current;
        if (!Number.isFinite(maxDim) || maxDim <= 1e-6) return null;

        const toCam = new THREE.Vector3().subVectors(camera.position, centerWorld).normalize();
        const faceN = toCam.clone();
        const upWorld = new THREE.Vector3(0, 1, 0);
        const faceRight = new THREE.Vector3().crossVectors(upWorld, faceN);
        if (faceRight.lengthSq() < 1e-6) faceRight.set(1, 0, 0);
        faceRight.normalize();
        const faceUp = new THREE.Vector3().crossVectors(faceN, faceRight).normalize();

        const min = boxWorld.min;
        const max = boxWorld.max;
        const corners = [
          new THREE.Vector3(min.x, min.y, min.z),
          new THREE.Vector3(min.x, min.y, max.z),
          new THREE.Vector3(min.x, max.y, min.z),
          new THREE.Vector3(min.x, max.y, max.z),
          new THREE.Vector3(max.x, min.y, min.z),
          new THREE.Vector3(max.x, min.y, max.z),
          new THREE.Vector3(max.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, max.z),
        ];
        let maxProj = -Infinity;
        for (const c of corners) {
          const proj = c.clone().sub(centerWorld).dot(faceN);
          if (proj > maxProj) maxProj = proj;
        }

        const pad = FACE_PAD_FRAC * maxDim;
        const facePoint = centerWorld.clone().add(faceN.clone().multiplyScalar(maxProj + pad));
        const lensSide = clamp(tune.lens.w * maxDim, 0.08 * maxDim, 0.3 * maxDim);
        const lensHeight = clamp(tune.lens.h * maxDim, 0.08 * maxDim, 0.3 * maxDim);
        const lensDepth = clamp(tune.lens.d * maxDim, 0.012 * maxDim, 0.1 * maxDim);
        const lensR = lensSide * 0.28;
        const flashW = clamp(tune.flash.w * maxDim, 0.08 * maxDim, 0.35 * maxDim);
        const flashH = clamp(tune.flash.h * maxDim, 0.05 * maxDim, 0.25 * maxDim);
        const flashD = clamp(tune.flash.d * maxDim, 0.01 * maxDim, 0.1 * maxDim);
        const viewW = clamp(tune.view.w * maxDim, 0.08 * maxDim, 0.35 * maxDim);
        const viewH = clamp(tune.view.h * maxDim, 0.05 * maxDim, 0.25 * maxDim);
        const viewD = clamp(tune.view.d * maxDim, 0.01 * maxDim, 0.1 * maxDim);

        const lensGuess = facePoint
          .clone()
          .add(faceRight.clone().multiplyScalar(tune.lens.x * sizeWorld.x))
          .add(faceUp.clone().multiplyScalar(tune.lens.y * sizeWorld.y));
        const flashCenterWorld = facePoint
          .clone()
          .add(faceRight.clone().multiplyScalar(tune.flash.x * sizeWorld.x))
          .add(faceUp.clone().multiplyScalar(tune.flash.y * sizeWorld.y));
        const viewCenterWorld = facePoint
          .clone()
          .add(faceRight.clone().multiplyScalar(tune.view.x * sizeWorld.x))
          .add(faceUp.clone().multiplyScalar(tune.view.y * sizeWorld.y));
        const lensHit = raycastHit(lensGuess, hero, faceN, maxDim);
        const lensCenterWorld = lensHit
          ? lensHit.point.clone().add(lensHit.normal.clone().multiplyScalar(tune.lens.out * maxDim))
          : lensGuess.clone().add(faceN.clone().multiplyScalar(tune.lens.out * maxDim));
        const cardAnchorWorld = facePoint
          .clone()
          .add(faceRight.clone().multiplyScalar(0.04 * sizeWorld.x))
          .add(faceUp.clone().multiplyScalar(0.18 * sizeWorld.y))
          .add(faceN.clone().multiplyScalar(0.06 * maxDim));

        const basis = new THREE.Matrix4().makeBasis(faceRight, faceUp, faceN);
        const q = new THREE.Quaternion().setFromRotationMatrix(basis);

        return {
          centerWorld,
          sizeWorld,
          maxDim,
          faceN,
          faceRight,
          faceUp,
          facePoint,
          lensCenterWorld,
          flashCenterWorld,
          viewCenterWorld,
          cardAnchorWorld,
          q,
          lensSide: Math.min(lensSide, lensHeight),
          lensR,
          lensDepth,
          flashW,
          flashH,
          flashD,
          viewW,
          viewH,
          viewD,
        };
      };

      type InsetModuleBuild = {
        center: THREE.Vector3;
        normal: THREE.Vector3;
        q: THREE.Quaternion;
        frame: THREE.Mesh;
        cavity: THREE.Mesh;
        cover: THREE.Mesh;
        strip: THREE.Mesh;
        reflector: THREE.Mesh | null;
        coverMat: THREE.MeshPhysicalMaterial;
        reflectorMat: THREE.MeshStandardMaterial | null;
      };

      type InsetLensModuleBuild = {
        center: THREE.Vector3;
        normal: THREE.Vector3;
        right: THREE.Vector3;
        q: THREE.Quaternion;
        frame: THREE.Mesh;
        cavity: THREE.Mesh;
        barrel: THREE.Mesh;
        glass1: THREE.Mesh;
        glass2: THREE.Mesh;
        strip: THREE.Mesh;
        barrelR: number;
        lensSide: number;
      };

      const buildInsetModule = (opts: {
        name: string;
        centerGuess: THREE.Vector3;
        w: number;
        h: number;
        d: number;
        outFrac: number;
        rollDeg: number;
        hero: THREE.Object3D;
        towardCamN: THREE.Vector3;
        maxDim: number;
        qFallback: THREE.Quaternion;
        isFlash?: boolean;
      }): InsetModuleBuild => {
        const hit = raycastHit(opts.centerGuess, opts.hero, opts.towardCamN, opts.maxDim);
        const center = (hit ? hit.point : opts.centerGuess.clone())
          .clone()
          .add((hit ? hit.normal : opts.towardCamN).clone().normalize().multiplyScalar(opts.outFrac * opts.maxDim));
        const n = (hit ? hit.normal : opts.towardCamN.clone()).clone().normalize();

        const upWorld = new THREE.Vector3(0, 1, 0);
        const r = new THREE.Vector3().crossVectors(upWorld, n);
        if (r.lengthSq() < 1e-6) {
          r.set(1, 0, 0).applyQuaternion(opts.qFallback).normalize();
        }
        if (r.lengthSq() < 1e-6) {
          r.set(1, 0, 0);
        }
        r.normalize();
        const u = new THREE.Vector3().crossVectors(n, r).normalize();
        const m = new THREE.Matrix4().makeBasis(r, u, n);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const qRoll = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(opts.rollDeg));
        q.multiply(qRoll);

        const lipInset = 0.012 * opts.maxDim;
        const cavityInset = 0.03 * opts.maxDim;
        const coverOut = 0.006 * opts.maxDim;

        const frameT = Math.max(0.08 * opts.h, 0.01 * opts.maxDim);
        const recessD = Math.max(0.55 * opts.d, 0.02 * opts.maxDim);

        const bezelMat = new THREE.MeshPhysicalMaterial({
          color: BEZEL,
          roughness: 0.35,
          metalness: 0.12,
          clearcoat: 0.2,
          clearcoatRoughness: 0.25,
        });

        const cavityMat = new THREE.MeshStandardMaterial({
          color: DARK_PLASTIC,
          roughness: 0.9,
          metalness: 0.02,
        });

        const coverMat = new THREE.MeshPhysicalMaterial({
          color: opts.isFlash ? WHITE : GLASS_TINT,
          transmission: opts.isFlash ? 0.55 : 0.75,
          roughness: opts.isFlash ? 0.26 : 0.14,
          ior: 1.35,
          thickness: 0.1,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          emissive: new THREE.Color(WHITE),
          emissiveIntensity: 0,
        });

        const frame = new THREE.Mesh(new THREE.BoxGeometry(opts.w, opts.h, opts.d), bezelMat);
        frame.name = `${opts.name}_frame`;
        frame.quaternion.copy(q);
        frame.position.copy(center).add(n.clone().multiplyScalar(-lipInset));

        const cavityW = Math.max(0.001, opts.w - frameT * 1.2);
        const cavityH = Math.max(0.001, opts.h - frameT * 1.2);
        const cavity = new THREE.Mesh(new THREE.BoxGeometry(cavityW, cavityH, recessD), cavityMat);
        cavity.name = `${opts.name}_cavity`;
        cavity.quaternion.copy(q);
        cavity.position.copy(center).add(n.clone().multiplyScalar(-cavityInset));

        const coverW = Math.max(0.001, opts.w - frameT * 1.6);
        const coverH = Math.max(0.001, opts.h - frameT * 1.6);
        const cover = new THREE.Mesh(new THREE.BoxGeometry(coverW, coverH, opts.d * 0.18), coverMat);
        cover.name = `${opts.name}_cover`;
        cover.quaternion.copy(q);
        cover.position.copy(center).add(n.clone().multiplyScalar(coverOut));
        cover.renderOrder = 6;

        const strip = new THREE.Mesh(
          new THREE.PlaneGeometry(Math.max(0.001, (opts.w - frameT * 2.2) * 0.95), Math.max(0.001, (opts.h - frameT * 2.2) * 0.18)),
          new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.05, depthWrite: false, depthTest: true })
        );
        strip.name = `${opts.name}_highlight`;
        strip.quaternion.copy(q);
        strip.position.copy(center).add(n.clone().multiplyScalar(coverOut + 0.002 * opts.maxDim));
        strip.rotateOnAxis(n, 0.6);
        strip.renderOrder = 7;

        let reflector: THREE.Mesh | null = null;
        let reflectorMat: THREE.MeshStandardMaterial | null = null;
        if (opts.isFlash) {
          reflectorMat = new THREE.MeshStandardMaterial({
            color: WHITE,
            emissive: WHITE,
            emissiveIntensity: 0.08,
            roughness: 0.6,
          });
          reflector = new THREE.Mesh(
            new THREE.PlaneGeometry(Math.max(0.001, opts.w - frameT * 2.2), Math.max(0.001, opts.h - frameT * 2.2)),
            reflectorMat
          );
          reflector.name = `${opts.name}_reflector`;
          reflector.quaternion.copy(q);
          reflector.position.copy(center).add(n.clone().multiplyScalar(-0.004 * opts.maxDim));
          reflector.renderOrder = 3;
        }

        return { center, normal: n, q, frame, cavity, cover, strip, reflector, coverMat, reflectorMat };
      };

      const buildInsetLensModule = (opts: {
        name: string;
        centerGuess: THREE.Vector3;
        side: number;
        depth: number;
        outFrac: number;
        rollDeg: number;
        hero: THREE.Object3D;
        towardCamN: THREE.Vector3;
        maxDim: number;
      }): InsetLensModuleBuild => {
        const hit = raycastHit(opts.centerGuess, opts.hero, opts.towardCamN, opts.maxDim);
        const center = (hit ? hit.point : opts.centerGuess.clone())
          .clone()
          .add((hit ? hit.normal : opts.towardCamN).clone().normalize().multiplyScalar(opts.outFrac * opts.maxDim));
        const n = (hit ? hit.normal : opts.towardCamN.clone()).clone().normalize();

        const upWorld = new THREE.Vector3(0, 1, 0);
        const r = new THREE.Vector3().crossVectors(upWorld, n);
        if (r.lengthSq() < 1e-6) r.set(1, 0, 0);
        r.normalize();
        const u = new THREE.Vector3().crossVectors(n, r).normalize();
        const m = new THREE.Matrix4().makeBasis(r, u, n);
        const q = new THREE.Quaternion().setFromRotationMatrix(m);
        const qRoll = new THREE.Quaternion().setFromAxisAngle(n, THREE.MathUtils.degToRad(opts.rollDeg));
        q.multiply(qRoll);

        const lipInset = 0.012 * opts.maxDim;
        const cavityInset = 0.032 * opts.maxDim;

        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(opts.side, opts.side, opts.depth),
          new THREE.MeshPhysicalMaterial({
            color: BEZEL,
            roughness: 0.35,
            metalness: 0.12,
            clearcoat: 0.2,
            clearcoatRoughness: 0.25,
          })
        );
        frame.name = `${opts.name}_frame`;
        frame.quaternion.copy(q);
        frame.position.copy(center).add(n.clone().multiplyScalar(-lipInset));

        const cavity = new THREE.Mesh(
          new THREE.BoxGeometry(opts.side * 0.8, opts.side * 0.8, opts.depth * 0.7),
          new THREE.MeshStandardMaterial({ color: DARK_PLASTIC, roughness: 0.9, metalness: 0.02 })
        );
        cavity.name = `${opts.name}_cavity`;
        cavity.quaternion.copy(q);
        cavity.position.copy(center).add(n.clone().multiplyScalar(-cavityInset));

        const barrelR = opts.side * 0.28;
        const barrelLen = opts.depth * 0.55;
        const barrelGeo = new THREE.CylinderGeometry(barrelR * 1.02, barrelR * 1.06, barrelLen, 36);
        barrelGeo.rotateX(Math.PI * 0.5);
        const barrel = new THREE.Mesh(
          barrelGeo,
          new THREE.MeshStandardMaterial({ color: RUBBER, roughness: 0.85, metalness: 0.05 })
        );
        barrel.name = `${opts.name}_barrel`;
        barrel.quaternion.copy(q);
        barrel.position.copy(center).add(n.clone().multiplyScalar(-0.01 * opts.maxDim));

        const glassGeo = new THREE.CylinderGeometry(barrelR * 0.92, barrelR * 0.92, Math.max(barrelLen * 0.12, 0.002), 36);
        glassGeo.rotateX(Math.PI * 0.5);
        const glassMat = new THREE.MeshPhysicalMaterial({
          color: WHITE,
          transmission: 1,
          roughness: 0.07,
          ior: 1.45,
          thickness: 0.25,
          transparent: true,
          opacity: 1,
          depthWrite: false,
        });
        const glass1 = new THREE.Mesh(glassGeo, glassMat.clone());
        glass1.name = `${opts.name}_glass_1`;
        glass1.quaternion.copy(q);
        glass1.position.copy(center).add(n.clone().multiplyScalar(0.004 * opts.maxDim));
        glass1.renderOrder = 6;

        const glass2 = new THREE.Mesh(glassGeo, glassMat.clone());
        glass2.name = `${opts.name}_glass_2`;
        glass2.quaternion.copy(q);
        glass2.position.copy(center).add(n.clone().multiplyScalar(-0.01 * opts.maxDim));
        glass2.renderOrder = 6;

        const strip = new THREE.Mesh(
          new THREE.PlaneGeometry(barrelR * 1.18, barrelR * 0.22),
          new THREE.MeshBasicMaterial({ color: WHITE, transparent: true, opacity: 0.018, depthWrite: false, depthTest: true })
        );
        strip.name = `${opts.name}_glass_highlight`;
        strip.quaternion.copy(q);
        strip.position.copy(center).add(n.clone().multiplyScalar(0.006 * opts.maxDim));
        strip.rotateOnAxis(n, 0.62);
        strip.renderOrder = 7;

        return {
          center,
          normal: n,
          right: r.clone(),
          q,
          frame,
          cavity,
          barrel,
          glass1,
          glass2,
          strip,
          barrelR,
          lensSide: opts.side,
        };
      };

      const clearGroup = (group: THREE.Group) => {
        for (let i = group.children.length - 1; i >= 0; i -= 1) {
          const child = group.children[i] as THREE.Object3D & {
            geometry?: { dispose?: () => void };
            material?: THREE.Material | THREE.Material[];
          };
          group.remove(child);
          child.geometry?.dispose?.();
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => m.dispose?.());
          }
        }
      };

      const buildProceduralParts = (
        layout: FaceLayout
      ): {
        lensCenterWorld: THREE.Vector3;
        lensRadius: number;
        lensRight: THREE.Vector3;
        lensSide: number;
        flashCenterWorld: THREE.Vector3;
        viewCenterWorld: THREE.Vector3;
        flashNormal: THREE.Vector3;
      } | null => {
        const hero = heroMeshRef.current;
        if (!hero) return null;
        const tune = tuneRef.current;
        const debugPartMode = debugEnabled;

        const lensGuess = layout.facePoint
          .clone()
          .add(layout.faceRight.clone().multiplyScalar(tune.lens.x * layout.sizeWorld.x))
          .add(layout.faceUp.clone().multiplyScalar(tune.lens.y * layout.sizeWorld.y));
        const lensMod = buildInsetLensModule({
          name: "lens",
          centerGuess: lensGuess,
          side: layout.lensSide,
          depth: layout.lensDepth,
          outFrac: tune.lens.out,
          rollDeg: tune.lens.rollDeg,
          hero,
          towardCamN: layout.faceN,
          maxDim: layout.maxDim,
        });
        proceduralPartsGroup.add(lensMod.frame, lensMod.cavity, lensMod.barrel, lensMod.glass1, lensMod.glass2, lensMod.strip);

        const flashGuess = layout.facePoint
          .clone()
          .add(layout.faceRight.clone().multiplyScalar(tune.flash.x * layout.sizeWorld.x))
          .add(layout.faceUp.clone().multiplyScalar(tune.flash.y * layout.sizeWorld.y));
        const flashMod = buildInsetModule({
          name: "flash",
          centerGuess: flashGuess,
          w: layout.flashW,
          h: layout.flashH,
          d: layout.flashD,
          outFrac: tune.flash.out,
          rollDeg: tune.flash.rollDeg,
          hero,
          towardCamN: layout.faceN,
          maxDim: layout.maxDim,
          qFallback: layout.q,
          isFlash: true,
        });
        proceduralPartsGroup.add(flashMod.frame, flashMod.cavity, flashMod.cover, flashMod.strip);
        if (flashMod.reflector) proceduralPartsGroup.add(flashMod.reflector);
        flashCoverMat = flashMod.coverMat;
        flashReflectorMat = flashMod.reflectorMat;

        flashLight.distance = 2 * layout.maxDim;
        flashLight.position.copy(flashMod.center).addScaledVector(flashMod.normal, 0.02 * layout.maxDim);
        flashLight.decay = 2;
        flashLight.intensity = 0;

        const viewGuess = layout.facePoint
          .clone()
          .add(layout.faceRight.clone().multiplyScalar(tune.view.x * layout.sizeWorld.x))
          .add(layout.faceUp.clone().multiplyScalar(tune.view.y * layout.sizeWorld.y));
        const viewMod = buildInsetModule({
          name: "view",
          centerGuess: viewGuess,
          w: layout.viewW,
          h: layout.viewH,
          d: layout.viewD,
          outFrac: tune.view.out,
          rollDeg: tune.view.rollDeg,
          hero,
          towardCamN: layout.faceN,
          maxDim: layout.maxDim,
          qFallback: layout.q,
        });
        proceduralPartsGroup.add(viewMod.frame, viewMod.cavity, viewMod.cover, viewMod.strip);

        if (debugPartMode) {
          const r = Math.max(0.01 * layout.maxDim, 0.002);
          const mk = (color: number, p: THREE.Vector3) => {
            const m = new THREE.Mesh(
              new THREE.SphereGeometry(r, 14, 14),
              new THREE.MeshBasicMaterial({ color, depthTest: false })
            );
            m.position.copy(p);
            proceduralPartsGroup.add(m);
          };
          const mkNormal = (color: number, p: THREE.Vector3, n: THREE.Vector3) => {
            const len = Math.max(0.028 * layout.maxDim, 0.008);
            const tube = Math.max(0.0016 * layout.maxDim, 0.0012);
            const g = new THREE.CylinderGeometry(tube, tube, len, 10);
            const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, depthTest: false }));
            m.position.copy(p).addScaledVector(n, len * 0.5);
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
            proceduralPartsGroup.add(m);
          };
          mk(0x4bc0ff, lensMod.center);
          mk(0xfff08c, flashMod.center);
          mk(0x8cf0ff, viewMod.center);
          mkNormal(0x4bc0ff, lensMod.center, lensMod.normal);
          mkNormal(0xfff08c, flashMod.center, flashMod.normal);
          mkNormal(0x8cf0ff, viewMod.center, viewMod.normal);
        }

        return {
          lensCenterWorld: lensMod.center,
          lensRadius: lensMod.barrelR,
          lensRight: lensMod.right,
          lensSide: lensMod.lensSide,
          flashCenterWorld: flashMod.center,
          viewCenterWorld: viewMod.center,
          flashNormal: flashMod.normal,
        };
      };

      const syncAnchorsFromLayout = (
        layout: FaceLayout,
        modules: {
          lensCenterWorld: THREE.Vector3;
          lensRadius: number;
          lensRight: THREE.Vector3;
          lensSide: number;
          flashCenterWorld: THREE.Vector3;
          viewCenterWorld: THREE.Vector3;
        }
      ) => {
        glbGroup.updateWorldMatrix(true, false);

        lensCenterLocal.copy(glbGroup.worldToLocal(modules.lensCenterWorld.clone()));
        lensCenter.position.copy(lensCenterLocal);
        boundsCenterMarker.position.copy(glbGroup.worldToLocal(layout.centerWorld.clone()));

        const lensRadius = modules.lensRadius;
        lensEdge.position.copy(glbGroup.worldToLocal(modules.lensCenterWorld.clone().addScaledVector(modules.lensRight, lensRadius)));
        flashCenterMarker.position.copy(glbGroup.worldToLocal(modules.flashCenterWorld.clone()));
        viewCenterMarker.position.copy(glbGroup.worldToLocal(modules.viewCenterWorld.clone()));
        slotCenter.position.copy(glbGroup.worldToLocal(modules.lensCenterWorld.clone().addScaledVector(layout.faceUp, 0.22 * layout.sizeWorld.y)));

        const cardLocal = glbGroup.worldToLocal(layout.cardAnchorWorld.clone());
        cardAnchor.position.copy(cardLocal);

        debugState.lensFound = true;
        debugState.lensCenter = [modules.lensCenterWorld.x, modules.lensCenterWorld.y, modules.lensCenterWorld.z];
        debugState.lensRadius = lensRadius;
        debugState.flashCenter = [modules.flashCenterWorld.x, modules.flashCenterWorld.y, modules.flashCenterWorld.z];
        debugState.viewCenter = [modules.viewCenterWorld.x, modules.viewCenterWorld.y, modules.viewCenterWorld.z];
        debugState.faceRight = [layout.faceRight.x, layout.faceRight.y, layout.faceRight.z];
        debugState.faceUp = [layout.faceUp.x, layout.faceUp.y, layout.faceUp.z];
        debugState.faceN = [layout.faceN.x, layout.faceN.y, layout.faceN.z];
        debugState.partSizes = {
          lensR: layout.lensR,
          lensDepth: layout.lensDepth,
          flashW: layout.flashW,
          flashH: layout.flashH,
          viewW: layout.viewW,
          viewH: layout.viewH,
        };
        debugState.bodyMaxDim = bodyMaxDimRef.current;
        const t = tuneRef.current;
        debugState.tune = `lens(${t.lens.x.toFixed(3)},${t.lens.y.toFixed(3)},${t.lens.out.toFixed(3)},r${t.lens.rollDeg.toFixed(0)},w${t.lens.w.toFixed(3)},h${t.lens.h.toFixed(3)},d${t.lens.d.toFixed(3)}) flash(${t.flash.x.toFixed(3)},${t.flash.y.toFixed(3)},${t.flash.out.toFixed(3)},r${t.flash.rollDeg.toFixed(0)},w${t.flash.w.toFixed(3)},h${t.flash.h.toFixed(3)},d${t.flash.d.toFixed(3)}) view(${t.view.x.toFixed(3)},${t.view.y.toFixed(3)},${t.view.out.toFixed(3)},r${t.view.rollDeg.toFixed(0)},w${t.view.w.toFixed(3)},h${t.view.h.toFixed(3)},d${t.view.d.toFixed(3)})`;
        if (debugEnabled) {
          console.info("[contact] procedural parts", {
            lensCenter: debugState.lensCenter,
            flashCenter: debugState.flashCenter,
            viewCenter: debugState.viewCenter,
            maxDim: layout.maxDim,
            createdParts: debugState.createdParts,
            partCount: debugState.partCount,
          });
        }
        if (ejectState === "idle" || ejectState === "delayed") {
          setPhotoPose(slotStart, 0);
          photo.visible = false;
        }
      };

      const rebuildProceduralParts = () => {
        const group = partsGroupRef.current;
        if (!group || !bodyBoxRef.current) return;
        clearGroup(group);
        flashCoverMat = null;
        flashReflectorMat = null;

        const layout = computeFaceLayout();
        if (!layout) {
          debugState.createdParts = false;
          debugState.message = "Body metrics unavailable for procedural parts.";
          debugState.partCount = 0;
          emitDebug(true);
          return;
        }

        const modules = buildProceduralParts(layout);
        if (!modules) {
          debugState.createdParts = false;
          debugState.message = "Hero mesh unavailable for inset module build.";
          debugState.partCount = 0;
          emitDebug(true);
          return;
        }
        debugState.createdParts = true;
        debugState.partCount = group.children.length;
        debugState.slotCreated = false;
        debugState.photoCreated = false;
        syncAnchorsFromLayout(layout, modules);
        emitDebug(true);
      };

      const normalizeModel = (root: THREE.Object3D) => {
        let box = computeBoundsRelativeTo(root, glbGroup);
        if (box.isEmpty()) return null;

        root.position.sub(box.getCenter(new THREE.Vector3()));
        box = computeBoundsRelativeTo(root, glbGroup);

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim < 1e-6) return null;

        root.scale.setScalar(TARGET_SIZE / maxDim);
        box = computeBoundsRelativeTo(root, glbGroup);

        if (Math.abs(box.min.z) > Math.abs(box.max.z) * 1.12) {
          root.rotation.y += Math.PI;
          box = computeBoundsRelativeTo(root, glbGroup);
          root.position.sub(box.getCenter(new THREE.Vector3()));
          box = computeBoundsRelativeTo(root, glbGroup);
        }

        return box;
      };

      lensCenter.position.set(0, 0, 0);
      lensEdge.position.set(0.1, 0, 0);
      cardAnchor.position.set(0, 0.15, 0.2);

      emitGlbStatus({ status: "loading", url: GLB_URL });
      console.info("[contact] GLB load start", GLB_URL);
      heroMeshRef.current = null;
      const loader = new GLTFLoader();
      loader.load(
        GLB_URL,
        (gltf) => {
          const modelRoot = gltf.scene;
          modelContainer.clear();
          modelContainer.add(modelRoot);
          glbGroup.visible = true;
          placeholderGroup.visible = false;

          const box = normalizeModel(modelRoot);
          if (!box || box.isEmpty()) {
            const message = "Loaded GLB but bounds are empty";
            console.warn("[contact] GLB loaded with invalid bounds", GLB_URL, message);
            hasGlb = false;
            glbGroup.visible = false;
            placeholderGroup.visible = true;
            emitGlbStatus({ status: "error", url: GLB_URL, message });
            return;
          }

          const meshes = collectMeshes(modelRoot);
          debugState.totalMeshes = meshes.length;
          debugState.visibleMeshes = meshes.filter((item) => item.mesh.visible).length;
          debugState.hiddenMeshes = Math.max(0, debugState.totalMeshes - debugState.visibleMeshes);
          debugState.message = undefined;
          debugState.componentCount = 0;
          debugState.keptTris = 0;
          debugState.totalTris = 0;
          debugState.keptRatio = 0;
          debugState.isolateApplied = false;
          debugState.propHideApplied = false;
          debugState.pinkOverrideApplied = false;
          debugState.lensFound = false;
          debugState.slotCreated = false;
          debugState.photoCreated = false;
          debugState.createdParts = false;
          debugState.flashCenter = undefined;
          debugState.viewCenter = undefined;
          debugState.faceRight = undefined;
          debugState.faceUp = undefined;
          debugState.faceN = undefined;
          debugState.partSizes = undefined;
          debugState.bodyMaxDim = undefined;
          debugState.partCount = 0;
          debugState.tune = undefined;
          debugState.ejectState = ejectState;
          debugState.ejectT = 0;
          let primaryMesh: THREE.Mesh | null = null;
          if (meshes.length === 0) {
            heroMeshRef.current = null;
            debugState.message = "GLB loaded but totalMeshes=0";
          } else {
            primaryMesh = meshes[0].mesh;
            heroMeshRef.current = primaryMesh;
            const isolation = isolateLargestConnectedComponent(primaryMesh);
            debugState.componentCount = isolation.componentCount;
            debugState.keptTris = isolation.keptTris;
            debugState.totalTris = isolation.totalTris;
            debugState.keptRatio = isolation.keptRatio;
            debugState.isolateApplied = isolation.isolateApplied;
            debugState.propHideApplied = isolation.isolateApplied;
            if (isolation.message) debugState.message = isolation.message;
            console.info("[contact] isolate largest component", {
              componentCount: isolation.componentCount,
              keptTris: isolation.keptTris,
              totalTris: isolation.totalTris,
              keptRatio: isolation.keptRatio,
              isolateApplied: isolation.isolateApplied,
            });
          }

          const heroBox = computeBoundsRelativeTo(modelRoot, glbGroup);
          const activeBox = heroBox.isEmpty() ? box : heroBox;
          modelRoot.updateWorldMatrix(true, true);
          glbGroup.updateWorldMatrix(true, true);
          const localCenter = activeBox.getCenter(new THREE.Vector3());
          const localSize = activeBox.getSize(new THREE.Vector3());
          const localMaxDim = Math.max(localSize.x, localSize.y, localSize.z);
          boundsBoxRef.current.copy(activeBox);
          boundsSizeRef.current.copy(localSize);
          boundsCenterRef.current.copy(localCenter);
          maxDimRef.current = localMaxDim;

          if (primaryMesh) {
            const bodyBox = new THREE.Box3().setFromObject(primaryMesh);
            if (!bodyBox.isEmpty()) {
              bodyBoxRef.current = bodyBox.clone();
              bodyCenterRef.current.copy(bodyBox.getCenter(new THREE.Vector3()));
              bodySizeRef.current.copy(bodyBox.getSize(new THREE.Vector3()));
              bodyMaxDimRef.current = Math.max(bodySizeRef.current.x, bodySizeRef.current.y, bodySizeRef.current.z);
              debugState.bodyMaxDim = bodyMaxDimRef.current;
            } else {
              bodyBoxRef.current = null;
              debugState.message = "Body mesh bounds empty after isolation.";
            }
          } else {
            bodyBoxRef.current = null;
            heroMeshRef.current = null;
          }

          const size = activeBox.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);
          console.info("[contact] GLB loaded", GLB_URL, { size, maxDim });
          if (!Number.isFinite(maxDim) || maxDim <= 0) {
            console.warn("[contact] GLB loaded but bounds maxDim invalid", GLB_URL, { size, maxDim });
            debugState.message = `Invalid bounds maxDim: ${String(maxDim)}`;
          }
          glbGroup.updateWorldMatrix(true, true);
          const worldCenter =
            bodyBoxRef.current && !bodyBoxRef.current.isEmpty()
              ? bodyCenterRef.current.clone()
              : glbGroup.localToWorld(activeBox.getCenter(new THREE.Vector3()));
          keyLight.target.position.copy(worldCenter);
          rimLight.target.position.copy(worldCenter);
          console.info(
            "[contact] lights:",
            scene.children.filter((o) => (o as THREE.Object3D & { isLight?: boolean }).isLight).length
          );
          console.info("[contact] bounds:", { size, maxDim });

          hasGlb = true;
          emitGlbStatus({ status: "loaded", url: GLB_URL });
          applyModelMaterials(modelRoot);
          debugState.visibleMeshes = collectMeshes(modelRoot).filter((item) => item.mesh.visible).length;
          debugState.hiddenMeshes = Math.max(0, debugState.totalMeshes - debugState.visibleMeshes);
          if (bodyBoxRef.current) {
            rebuildProceduralParts();
          } else {
            debugState.createdParts = false;
            debugState.message = debugState.message ?? "Failed to compute body metrics for procedural parts.";
          }
          if (debugHelper) {
            debugHelper.box.copy(new THREE.Box3().setFromObject(modelContainer));
          }
          emitDebug(true);
          setHeroFrame();
          setMacroFrame();
        },
        undefined,
        (err) => {
          const message =
            err && typeof err === "object" && "message" in err
              ? String((err as { message?: unknown }).message)
              : String(err);
          hasGlb = false;
          bodyBoxRef.current = null;
          heroMeshRef.current = null;
          clearGroup(proceduralPartsGroup);
          debugState.partCount = 0;
          placeholderGroup.visible = true;
          glbGroup.visible = false;
          console.error("[contact] GLB LOAD FAILED", GLB_URL, err);
          emitGlbStatus({ status: "error", url: GLB_URL, message });
        }
      );

      const captureHitTarget = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.8, 2.2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      captureHitTarget.position.set(0, 0.1, 0.6);
      cameraBodyGroup.add(captureHitTarget);

      const interactiveTargets: THREE.Object3D[] = [captureHitTarget, glbGroup, lensGroup, slotGroup, proceduralPartsGroup];
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const dom = renderer.domElement;
      let hover = false;

      const setHover = (next: boolean) => {
        if (hover === next) return;
        hover = next;
        dom.style.cursor = next && isInteractiveRef.current ? "pointer" : "default";
        callbacksRef.current.onPointerHoverChange?.(next && isInteractiveRef.current);
      };

      const hitInteractive = (event: PointerEvent) => {
        const rect = dom.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(interactiveTargets, true).length > 0;
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!isInteractiveRef.current) {
          setHover(false);
          return;
        }
        setHover(hitInteractive(event));
      };

      const onPointerLeave = () => {
        setHover(false);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || !isInteractiveRef.current) return;
        if (!hitInteractive(event)) return;
        callbacksRef.current.onCaptureIntent?.();
      };

      dom.addEventListener("pointermove", onPointerMove);
      dom.addEventListener("pointerleave", onPointerLeave);
      dom.addEventListener("pointerdown", onPointerDown);

      const heroTarget = new THREE.Vector3();
      const heroPos = new THREE.Vector3();
      const heroSettleFromPos = new THREE.Vector3();
      const heroSettleToPos = new THREE.Vector3();
      const heroSettleFromLook = new THREE.Vector3();
      const heroSettleToLook = new THREE.Vector3();
      const heroSettleLook = new THREE.Vector3();
      const macroTarget = new THREE.Vector3();
      const macroPos = new THREE.Vector3();
      const lookTarget = new THREE.Vector3();
      const midPos = new THREE.Vector3();
      const midTarget = new THREE.Vector3();
      let heroSettleStartMs = 0;
      let heroSettleActive = false;

      const lensQuat = new THREE.Quaternion();
      const lensNormal = new THREE.Vector3();
      const lensRight = new THREE.Vector3();
      const lensUp = new THREE.Vector3();

      const lensWorld = new THREE.Vector3();
      const lensEdgeWorld = new THREE.Vector3();
      const cardWorld = new THREE.Vector3();
      const projectedCenter = new THREE.Vector3();
      const projectedEdge = new THREE.Vector3();
      const projectedCard = new THREE.Vector3();
      const photoPose = new THREE.Vector3();

      const setHeroFrame = () => {
        if (!hasGlb || !glbGroup.visible) return;
        const worldBox = new THREE.Box3().setFromObject(modelContainer);
        if (worldBox.isEmpty()) return;

        camera.fov = FRAMING.heroFov;
        camera.updateProjectionMatrix();

        const fitDistance = computeFitDistance(worldBox, camera, HERO_FIT);
        const size = worldBox.getSize(new THREE.Vector3());
        const center = worldBox.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);

        heroTarget.copy(center);
        heroPos.copy(center).add(new THREE.Vector3(maxDim * 0.18, maxDim * 0.12, fitDistance * 0.95));
      };

      const setMacroFrame = () => {
        if (!hasGlb || !glbGroup.visible) return;
        lensCenter.getWorldPosition(lensWorld);
        glbGroup.getWorldQuaternion(lensQuat);

        lensNormal.set(0, 0, 1).applyQuaternion(lensQuat).normalize();
        lensRight.set(1, 0, 0).applyQuaternion(lensQuat).normalize();
        lensUp.set(0, 1, 0).applyQuaternion(lensQuat).normalize();

        macroTarget.copy(lensWorld).addScaledVector(lensNormal, -0.3).addScaledVector(lensUp, 0.012);
        macroPos
          .copy(lensWorld)
          .addScaledVector(lensNormal, FRAMING.macroDistance)
          .addScaledVector(lensRight, 0.015)
          .addScaledVector(lensUp, 0.015);
      };

      let debugHelper: THREE.Box3Helper | null = null;
      if (debugEnabled) {
        const s = 0.016;
        boundsCenterMarker.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0xffd54a }))
        );
        lensCenter.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0x4bc0ff }))
        );
        slotCenter.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0xff6f61 }))
        );
        flashCenterMarker.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0xfff08c }))
        );
        viewCenterMarker.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0x8cf0ff }))
        );
        cardAnchor.add(
          new THREE.Mesh(new THREE.SphereGeometry(s, 14, 14), new THREE.MeshBasicMaterial({ color: 0x7af06d }))
        );
        debugHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(modelContainer), 0x00ffcc);
        scene.add(debugHelper);
      }

      let rebuildTimeout: number | null = null;
      const scheduleRebuildProceduralParts = () => {
        if (rebuildTimeout !== null) window.clearTimeout(rebuildTimeout);
        rebuildTimeout = window.setTimeout(() => {
          rebuildTimeout = null;
          if (hasGlb && glbGroup.visible) {
            rebuildProceduralParts();
            setMacroFrame();
          }
        }, 80);
      };

      const onResize = () => {
        renderer.setSize(mount.clientWidth, mount.clientHeight);
        camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
        camera.updateProjectionMatrix();
        if (!hasGlb || !glbGroup.visible) {
          camera.position.set(0, 0.14, 2.2);
          camera.lookAt(0, 0, 0);
          return;
        }
        setHeroFrame();
        setMacroFrame();
        heroSettleActive = false;
        camera.position.copy(heroPos);
        camera.lookAt(heroTarget);
        scheduleRebuildProceduralParts();
      };

      window.addEventListener("resize", onResize);
      onResize();

      const updatePhoto = (now: number) => {
        if (phaseRef.current === "retracting" && ejectState !== "retracting" && ejectState !== "idle") {
          void retractPhoto();
        }

        if (ejectState === "delayed") {
          debugState.ejectState = "delayed";
          debugState.ejectT = clamp01((now - delayedStartMs) / EJECT_DELAY_MS);
          setPhotoPose(slotStart, 0);
          photo.visible = false;
          if (now - delayedStartMs >= EJECT_DELAY_MS) {
            ejectState = "ejecting";
            ejectStartMs = now;
            debugState.ejectState = "ejecting";
            callbacksRef.current.onStatusChange?.("Ejecting");
          }
          return;
        }

        if (ejectState === "ejecting") {
          const progress = clamp01((now - ejectStartMs) / EJECT_DUR_MS);
          debugState.ejectState = "ejecting";
          debugState.ejectT = progress;
          const eased = easeInOutCubic(progress);
          photoPose.lerpVectors(slotStart, slotDock, eased);
          setPhotoPose(photoPose, eased);
          photo.visible = true;

          if (progress >= 1) {
            ejectState = "done";
            debugState.ejectState = "done";
            debugState.ejectT = 1;
            setPhotoPose(slotDock, 1);
            photo.visible = true;
            if (!ejectDoneSent) {
              ejectDoneSent = true;
              callbacksRef.current.onEjectDone?.();
              callbacksRef.current.onStatusChange?.("Connected");
            }
          }
          return;
        }

        if (ejectState === "retracting") {
          const progress = clamp01((now - retractStartMs) / PHOTO.retractDurationMs);
          debugState.ejectState = "retracting";
          debugState.ejectT = progress;
          const eased = easeInOutCubic(progress);
          photoPose.lerpVectors(retractFrom, slotStart, eased);
          setPhotoPose(photoPose, 1 - eased);
          photo.visible = true;
          if (progress >= 1) {
            ejectState = "idle";
            ejectDoneSent = false;
            photo.visible = false;
            setPhotoPose(slotStart, 0);
            debugState.ejectState = "idle";
            debugState.ejectT = 0;
            callbacksRef.current.onRetractDone?.();
            callbacksRef.current.onStatusChange?.("Ready");
            resolveRetracts();
          }
          return;
        }

        if (ejectState === "done") {
          debugState.ejectState = "done";
          debugState.ejectT = 1;
          setPhotoPose(slotDock, 1);
          photo.visible = true;
          return;
        }

        debugState.ejectState = "idle";
        debugState.ejectT = 0;
        setPhotoPose(slotStart, 0);
        photo.visible = false;
      };

      let readyNotified = false;
      let raf = 0;
      let appliedTuneVersion = -1;

      const tick = () => {
        const now = performance.now();
        const t = Number.isFinite(timelineRef.current) ? timelineRef.current : 0;

        if (!hasGlb || !glbGroup.visible) {
          updateFlashBurst(now);
          camera.position.set(0, 0.14, 2.2);
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
          raf = window.requestAnimationFrame(tick);
          return;
        }

        if (appliedTuneVersion !== tuneVersionRef.current) {
          rebuildProceduralParts();
          setMacroFrame();
          appliedTuneVersion = tuneVersionRef.current;
        }

        const bodyReveal = smoothstep(BEATS.revealStart, BEATS.revealEnd, t);
        const dollyBlend = smoothstep(BEATS.revealEnd, BEATS.readyAt, t);
        renderer.toneMappingExposure = EXPOSURE_READY;

        setMacroFrame();
        midPos.lerpVectors(macroPos, heroPos, bodyReveal * 0.64);
        camera.position.lerpVectors(midPos, heroPos, dollyBlend);
        midTarget.lerpVectors(macroTarget, heroTarget, bodyReveal * 0.72);
        lookTarget.lerpVectors(midTarget, heroTarget, dollyBlend);

        const settleT = smoothstep(BEATS.revealEnd, BEATS.readyAt, t);
        camera.position.y += Math.sin(settleT * Math.PI * 2.2) * (1 - settleT) * 0.008;

        camera.fov = mix(FRAMING.macroFov, FRAMING.heroFov, clamp01(bodyReveal * 0.76 + dollyBlend * 0.24));
        camera.updateProjectionMatrix();
        camera.lookAt(lookTarget);

        if (!readyNotified && t >= BEATS.readyAt) {
          readyNotified = true;
          heroSettleFromPos.copy(camera.position);
          heroSettleFromLook.copy(lookTarget);
          heroSettleToPos.copy(heroPos);
          heroSettleToLook.copy(heroTarget);
          heroSettleStartMs = now;
          heroSettleActive = true;
          callbacksRef.current.onReady?.();
          callbacksRef.current.onStatusChange?.("Ready");
        }

        if (heroSettleActive && phaseRef.current === "ready") {
          const settle = clamp01((now - heroSettleStartMs) / HERO_SETTLE_MS);
          const eased = easeOutCubic(settle);
          camera.position.lerpVectors(heroSettleFromPos, heroSettleToPos, eased);
          heroSettleLook.lerpVectors(heroSettleFromLook, heroSettleToLook, eased);
          camera.lookAt(heroSettleLook);
          if (settle >= 1) heroSettleActive = false;
        }

        updatePhoto(now);
        updateFlashBurst(now);

        renderer.render(scene, camera);

        lensCenter.getWorldPosition(lensWorld);
        lensEdge.getWorldPosition(lensEdgeWorld);
        projectedCenter.copy(lensWorld).project(camera);
        projectedEdge.copy(lensEdgeWorld).project(camera);

        const rect = renderer.domElement.getBoundingClientRect();
        const lensX = rect.left + (projectedCenter.x * 0.5 + 0.5) * rect.width;
        const lensY = rect.top + (-projectedCenter.y * 0.5 + 0.5) * rect.height;

        callbacksRef.current.onLensProject?.({
          x: lensX,
          y: lensY,
          r: Math.hypot(
            (projectedEdge.x - projectedCenter.x) * 0.5 * rect.width,
            (-projectedEdge.y + projectedCenter.y) * 0.5 * rect.height
          ),
          visible:
            projectedCenter.z > -1 &&
            projectedCenter.z < 1 &&
            lensX >= rect.left &&
            lensX <= rect.right &&
            lensY >= rect.top &&
            lensY <= rect.bottom,
        });

        cardAnchor.getWorldPosition(cardWorld);
        projectedCard.copy(cardWorld).project(camera);
        const cardX = rect.left + (projectedCard.x * 0.5 + 0.5) * rect.width;
        const cardY = rect.top + (-projectedCard.y * 0.5 + 0.5) * rect.height;
        const anchorVisible = projectedCard.z > -1 && projectedCard.z < 1;
        const anchorFinite = Number.isFinite(cardX) && Number.isFinite(cardY);
        debugState.cardAnchorProjected = anchorFinite;
        if (anchorFinite) {
          debugState.anchorPx = { x: cardX, y: cardY, visible: anchorVisible };
        } else {
          debugState.anchorPx = undefined;
        }

        callbacksRef.current.onCardAnchorPx?.({
          x: cardX,
          y: cardY,
          visible: anchorVisible,
        });
        emitDebug();

        raf = window.requestAnimationFrame(tick);
      };

      raf = window.requestAnimationFrame(tick);

      return () => {
        triggerFnRef.current = null;
        triggerFlashOnlyFnRef.current = null;
        putBackFnRef.current = null;
        setInteractionFnRef.current = null;

        window.cancelAnimationFrame(raf);
        if (rebuildTimeout !== null) {
          window.clearTimeout(rebuildTimeout);
          rebuildTimeout = null;
        }
        window.removeEventListener("resize", onResize);
        dom.removeEventListener("pointermove", onPointerMove);
        dom.removeEventListener("pointerleave", onPointerLeave);
        dom.removeEventListener("pointerdown", onPointerDown);
        dom.style.cursor = "default";
        callbacksRef.current.onPointerHoverChange?.(false);

        const materials = new Set<THREE.Material>();
        scene.traverse((node) => {
          if (!(node instanceof THREE.Mesh)) return;
          node.geometry.dispose();
          if (Array.isArray(node.material)) node.material.forEach((m) => materials.add(m));
          else materials.add(node.material);
        });
        materials.forEach((m) => m.dispose());

        if (roughnessTex) roughnessTex.dispose();
        if (debugHelper) scene.remove(debugHelper);
        partsGroupRef.current = null;
        bodyBoxRef.current = null;
        heroMeshRef.current = null;

        envRT.dispose();
        pmrem.dispose();
        (roomEnv as unknown as { dispose?: () => void }).dispose?.();

        renderer.dispose();
        if (renderer.domElement.parentElement === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    }, []);

    return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
  }
);

export default PolaroidCameraAssembly3D;
