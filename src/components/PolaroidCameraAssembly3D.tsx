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

type DebugPayload = {
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
  anchorPx?: { x: number; y: number; visible: boolean };
  message?: string;
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
  onDebug?: (d: DebugPayload) => void;
};

type MaterialLike = THREE.Material & {
  color?: THREE.Color;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  emissive?: THREE.Color;
};

const GLB_URL = "/models/polaroid_texture.glb";
const INTRO_SLOW = 1.1;
const TARGET_SIZE = 1.35;
const HERO_FIT = 0.86;
const HERO_SETTLE_MS = 450;
const EJECT_DELAY_MS = 240;
const EJECT_DUR_MS = 1150;
const PHOTO_RETRACT_MS = 500;

const BEATS = {
  revealStart: 2.25 * INTRO_SLOW,
  revealEnd: 3.95 * INTRO_SLOW,
  readyAt: 4.8 * INTRO_SLOW,
} as const;

const FRAMING = {
  heroFov: 24,
  macroFov: 12.8,
  macroDistance: 0.11,
} as const;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
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

function computeFitDistance(box: THREE.Box3, camera: THREE.PerspectiveCamera, fit = HERO_FIT) {
  const size = box.getSize(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * camera.aspect);
  const dW = size.x / (2 * Math.tan(hFov * 0.5) * fit);
  const dH = size.y / (2 * Math.tan(vFov * 0.5) * fit);
  return Math.max(dW, dH) + size.z * 0.22;
}

function setColorMapSpace(tex: THREE.Texture | null | undefined) {
  if (!tex) return;
  const t = tex as THREE.Texture & { encoding?: number; colorSpace?: THREE.ColorSpace };
  if ("colorSpace" in t) {
    t.colorSpace = THREE.SRGBColorSpace;
  } else if ("encoding" in t) {
    const legacy = t as unknown as { encoding?: number };
    legacy.encoding = (THREE as unknown as { sRGBEncoding?: number }).sRGBEncoding ?? legacy.encoding;
  }
  t.needsUpdate = true;
}

function simplifyMaterial(oldMaterial: THREE.Material, maxAnisotropy: number): THREE.MeshStandardMaterial {
  const src = oldMaterial as MaterialLike;
  const std = new THREE.MeshStandardMaterial({
    color: src.color?.clone() ?? new THREE.Color(0xffffff),
    metalness: 0,
    roughness: 0.85,
  });

  if (src.map) {
    std.map = src.map;
    setColorMapSpace(std.map);
    std.map.anisotropy = Math.min(8, maxAnisotropy);
    std.map.needsUpdate = true;
  }
  if (src.normalMap) {
    std.normalMap = src.normalMap;
    std.normalMap.needsUpdate = true;
  }
  if (src.roughnessMap) {
    std.roughnessMap = src.roughnessMap;
    std.roughnessMap.needsUpdate = true;
  }
  if (src.metalnessMap) {
    std.metalnessMap = src.metalnessMap;
    std.metalnessMap.needsUpdate = true;
  }
  if (src.emissiveMap) {
    std.emissiveMap = src.emissiveMap;
    setColorMapSpace(std.emissiveMap);
    std.emissiveMap.needsUpdate = true;
  }
  if (src.emissive) std.emissive.copy(src.emissive);
  std.needsUpdate = true;
  return std;
}

function createPhoto() {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.72, 0.012),
    new THREE.MeshStandardMaterial({ color: "#f7f4ef", roughness: 0.68, metalness: 0 })
  );
  group.add(mesh);
  return group;
}

const PolaroidCameraAssembly3D = forwardRef<PolaroidCameraAssembly3DHandle, PolaroidCameraAssembly3DProps>(
  function PolaroidCameraAssembly3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const phaseRef = useRef<ScenePhase>(props.phase ?? "lens_intro");
    const timelineRef = useRef<number>(Number.isFinite(props.timelineT) ? (props.timelineT as number) : 0);
    const isInteractiveRef = useRef<boolean>(!!props.isInteractive);
    const captureNonceRef = useRef<number>(props.captureNonce ?? 0);
    const retractNonceRef = useRef<number>(props.retractNonce ?? 0);

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
        triggerFlashOnly: () => triggerFlashOnlyFnRef.current?.(),
        putBack: () => putBackFnRef.current?.() ?? Promise.resolve(),
        setInteractionEnabled: (enabled: boolean) => setInteractionFnRef.current?.(enabled),
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(mount.clientWidth, mount.clientHeight, false);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = false;
      renderer.debug.checkShaderErrors = true;
      renderer.domElement.style.position = "absolute";
      renderer.domElement.style.inset = "0";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      mount.appendChild(renderer.domElement);

      const onContextLost = (event: Event) => {
        event.preventDefault();
        console.error("[contact] WEBGL CONTEXT LOST");
      };
      const onContextRestored = () => {
        console.warn("[contact] WEBGL CONTEXT RESTORED - reload page");
      };
      renderer.domElement.addEventListener("webglcontextlost", onContextLost);
      renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(FRAMING.heroFov, mount.clientWidth / mount.clientHeight, 0.01, 120);

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;

      const hemi = new THREE.HemisphereLight(0xffffff, 0x202020, 0.55);
      const key = new THREE.DirectionalLight(0xffffff, 3.6);
      key.position.set(3, 4, 5);
      const rim = new THREE.DirectionalLight(0xdfe9ff, 2.0);
      rim.position.set(-4, 2, -3);
      scene.add(hemi, key, rim, key.target, rim.target);
      console.info(
        "[contact] scene init children",
        scene.children.map((child) => `${child.type}:${child.name || "(unnamed)"}`)
      );

      const rig = new THREE.Group();
      rig.position.set(0, -0.03, 0);
      rig.rotation.set(THREE.MathUtils.degToRad(2.8), THREE.MathUtils.degToRad(-1.5), THREE.MathUtils.degToRad(0.1));
      scene.add(rig);
      const cameraRoot = new THREE.Group();
      cameraRoot.rotation.set(THREE.MathUtils.degToRad(8.2), THREE.MathUtils.degToRad(-2.1), THREE.MathUtils.degToRad(0.25));
      rig.add(cameraRoot);
      const modelRoot = new THREE.Group();
      cameraRoot.add(modelRoot);

      const lensCenter = new THREE.Object3D();
      const lensEdge = new THREE.Object3D();
      const cardAnchor = new THREE.Object3D();
      const slotGroup = new THREE.Group();
      modelRoot.add(lensCenter, lensEdge, cardAnchor, slotGroup);

      const photo = createPhoto();
      photo.visible = false;
      slotGroup.add(photo);

      const slotStart = new THREE.Vector3();
      const slotDock = new THREE.Vector3();
      const retractFrom = new THREE.Vector3();
      const photoPose = new THREE.Vector3();
      const setPhotoPose = (position: THREE.Vector3, progress: number) => {
        photo.position.copy(position);
        photo.rotation.set(mix(-0.064, -0.03, progress), 0, mix(0.002, -0.001, progress));
      };
      setPhotoPose(slotStart, 0);

      const debugState: DebugPayload = {
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
        slotCreated: true,
        photoCreated: true,
        ejectState: "idle",
        ejectT: 0,
      };
      let lastDebugEmit = 0;
      const emitDebug = (force = false) => {
        const cb = callbacksRef.current.onDebug;
        if (!cb) return;
        const now = performance.now();
        if (!force && now - lastDebugEmit < 250) return;
        lastDebugEmit = now;
        cb({ ...debugState });
      };

      const emitGlbStatus = (s: { status: "loading" | "loaded" | "error"; url: string; message?: string }) => {
        callbacksRef.current.onGlbStatus?.(s);
        debugState.glbStatus = s.status;
        debugState.url = s.url;
        debugState.message = s.message;
        emitDebug(true);
      };

      let hasGlb = false;
      let loadedModel: THREE.Object3D | null = null;
      const bounds = new THREE.Box3();
      const boundsCenter = new THREE.Vector3();
      const boundsSize = new THREE.Vector3();
      const worldCenter = new THREE.Vector3();
      let maxDim = 1;

      let ejectState: "idle" | "delayed" | "ejecting" | "done" | "retracting" = "idle";
      let delayedStartMs = 0;
      let ejectStartMs = 0;
      let retractStartMs = 0;
      let ejectDoneSent = false;
      const retractResolvers: Array<() => void> = [];
      const resolveRetracts = () => {
        while (retractResolvers.length > 0) retractResolvers.shift()?.();
      };

      const retractPhoto = () =>
        new Promise<void>((resolve) => {
          if (ejectState === "idle") return resolve();
          retractResolvers.push(resolve);
          retractFrom.copy(photo.position);
          retractStartMs = performance.now();
          ejectState = "retracting";
          callbacksRef.current.onStatusChange?.("Retracting");
        });

      triggerFnRef.current = () => {
        if (!hasGlb) return false;
        if (ejectState === "delayed" || ejectState === "ejecting" || ejectState === "retracting") return false;
        delayedStartMs = performance.now();
        ejectState = "delayed";
        ejectDoneSent = false;
        callbacksRef.current.onCaptureStart?.();
        callbacksRef.current.onFlash?.();
        callbacksRef.current.onStatusChange?.("Capturing");
        return true;
      };
      triggerFlashOnlyFnRef.current = () => {
        // no-op by design for hero compatibility
      };
      putBackFnRef.current = () => retractPhoto();
      setInteractionFnRef.current = (enabled: boolean) => {
        isInteractiveRef.current = enabled;
      };

      emitGlbStatus({ status: "loading", url: GLB_URL });
      const loader = new GLTFLoader();
      loader.load(
        GLB_URL,
        (gltf) => {
          loadedModel = gltf.scene;
          modelRoot.add(loadedModel);

          loadedModel.updateWorldMatrix(true, true);
          const preBox = new THREE.Box3().setFromObject(loadedModel);
          const preCenter = preBox.getCenter(new THREE.Vector3());
          const preSize = preBox.getSize(new THREE.Vector3());
          const preMaxDim = Math.max(preSize.x, preSize.y, preSize.z);
          if (Number.isFinite(preMaxDim) && preMaxDim > 0) {
            loadedModel.position.sub(preCenter);
            loadedModel.scale.setScalar(TARGET_SIZE / preMaxDim);
          }

          loadedModel.updateWorldMatrix(true, true);
          const sceneBox = new THREE.Box3().setFromObject(loadedModel);
          const sceneCenter = sceneBox.getCenter(new THREE.Vector3());
          const sceneSize = sceneBox.getSize(new THREE.Vector3());
          const sceneVolume = Math.max(1e-8, sceneSize.x * sceneSize.y * sceneSize.z);
          bounds.copy(sceneBox);
          boundsCenter.copy(sceneCenter);
          boundsSize.copy(sceneSize);
          maxDim = Math.max(sceneSize.x, sceneSize.y, sceneSize.z);

          const lensRadius = Math.max(0.03 * maxDim, 0.08 * maxDim);
          lensCenter.position.set(boundsCenter.x, boundsCenter.y + 0.06 * boundsSize.y, bounds.max.z - 0.08 * boundsSize.z);
          lensEdge.position.copy(lensCenter.position).add(new THREE.Vector3(lensRadius, 0, 0));
          cardAnchor.position.set(boundsCenter.x + 0.06 * boundsSize.x, bounds.min.y + 0.56 * boundsSize.y, bounds.max.z - 0.1 * boundsSize.z);
          slotGroup.position.set(boundsCenter.x, bounds.min.y + 0.34 * boundsSize.y, bounds.max.z - 0.06 * boundsSize.z);

          const photoW = 0.58 * boundsSize.x;
          const photoH = photoW * 1.05;
          photo.scale.set(photoW / 0.56, photoH / 0.72, Math.max(0.4, (0.01 * boundsSize.z) / 0.012));
          slotStart.set(0, -0.22 * photoH, -0.06 * boundsSize.z);
          slotDock.set(0, slotStart.y + 0.78 * photoH, slotStart.z + 0.08 * boundsSize.z);
          setPhotoPose(slotStart, 0);
          photo.visible = false;

          let meshCount = 0;
          let visibleMeshes = 0;
          let hiddenCount = 0;
          const hiddenByHeuristic: string[] = [];
          const nearBlackWide: string[] = [];
          const tmpBox = new THREE.Box3();
          const tmpSize = new THREE.Vector3();
          const tmpCenter = new THREE.Vector3();
          const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

          loadedModel.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            meshCount += 1;
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            tmpBox.setFromObject(node);
            tmpBox.getCenter(tmpCenter);
            tmpBox.getSize(tmpSize);
            const meshVol = Math.max(0, tmpSize.x * tmpSize.y * tmpSize.z);
            const nameLower = (node.name || "").toLowerCase();
            const farRight = tmpCenter.x > sceneCenter.x + 0.3 * sceneSize.x;
            const farLeft = tmpCenter.x < sceneCenter.x - 0.35 * sceneSize.x;
            const lowAndFar = tmpCenter.y < sceneCenter.y - 0.15 * sceneSize.y && (farRight || farLeft);
            const byName = /pack|stack|photo|papers|plug|cord|cable/i.test(nameLower);
            const notHuge = meshVol < 0.18 * sceneVolume;
            const shouldHide = (farRight || farLeft || lowAndFar || byName) && notHuge;
            if (shouldHide) {
              node.visible = false;
              hiddenByHeuristic.push(node.name || "(unnamed-mesh)");
              hiddenCount += 1;
              console.info(
                "[contact] HIDE",
                node.name || "(unnamed)",
                "center",
                tmpCenter.toArray().map((n) => +n.toFixed(3))
              );
            }

            const oldMats = Array.isArray(node.material) ? node.material : [node.material];
            const newMats = oldMats.map((m) => simplifyMaterial(m, maxAnisotropy));
            node.material = Array.isArray(node.material) ? newMats : newMats[0];
            if (!node.geometry.attributes.normal) node.geometry.computeVertexNormals();
            node.castShadow = false;
            node.receiveShadow = false;
            if (node.visible) visibleMeshes += 1;

            for (const material of newMats) {
              if (material.map) {
                setColorMapSpace(material.map);
                material.map.anisotropy = Math.min(8, maxAnisotropy);
                material.map.needsUpdate = true;
              }
              if (material.emissiveMap) {
                setColorMapSpace(material.emissiveMap);
                material.emissiveMap.needsUpdate = true;
              }
              material.needsUpdate = true;
              const c = material.color;
              const isNearBlack = c.r < 0.08 && c.g < 0.08 && c.b < 0.08;
              const isWide = tmpSize.x > sceneSize.x * 0.5;
              if (isNearBlack && isWide) {
                nearBlackWide.push(node.name || "(unnamed-mesh)");
              }
            }
            oldMats.forEach((m) => m.dispose());
          });

          debugState.totalMeshes = meshCount;
          debugState.visibleMeshes = visibleMeshes;
          debugState.hiddenMeshes = Math.max(0, meshCount - visibleMeshes);
          debugState.lensFound = true;
          debugState.lensCenter = [lensCenter.position.x, lensCenter.position.y, lensCenter.position.z];
          debugState.lensRadius = lensRadius;
          debugState.propHideApplied = hiddenByHeuristic.length > 0;
          console.info("[contact] hiddenCount", hiddenCount);
          if (hiddenCount === 0) {
            console.warn("[contact] hiddenCount=0 (no detachable accessory nodes matched heuristics)");
          }
          if (hiddenByHeuristic.length > 0) {
            console.info("[contact] hidden accessory props", hiddenByHeuristic);
          }
          if (nearBlackWide.length > 0) {
            console.info("[contact] near-black wide meshes (potential slab)", nearBlackWide);
          }

          hasGlb = true;
          loadedModel.localToWorld(worldCenter.copy(boundsCenter));
          key.target.position.copy(worldCenter);
          rim.target.position.copy(worldCenter);
          emitGlbStatus({ status: "loaded", url: GLB_URL });
          emitDebug(true);
          console.info("[contact] GLB loaded", GLB_URL, "meshes:", meshCount, "materials simplified");
        },
        undefined,
        (err) => {
          const message =
            err && typeof err === "object" && "message" in err
              ? String((err as { message?: unknown }).message)
              : String(err);
          hasGlb = false;
          debugState.message = message;
          emitGlbStatus({ status: "error", url: GLB_URL, message });
          console.error("[contact] GLB load failed", GLB_URL, err);
        }
      );

      const hitTarget = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 1.8, 2.2),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
      );
      hitTarget.position.set(0, 0.1, 0.6);
      cameraRoot.add(hitTarget);

      const interactiveTargets: THREE.Object3D[] = [hitTarget, modelRoot];
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
        if (!isInteractiveRef.current) return setHover(false);
        setHover(hitInteractive(event));
      };
      const onPointerLeave = () => setHover(false);
      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || !isInteractiveRef.current) return;
        if (!hitInteractive(event)) return;
        callbacksRef.current.onCaptureIntent?.();
      };
      dom.addEventListener("pointermove", onPointerMove);
      dom.addEventListener("pointerleave", onPointerLeave);
      dom.addEventListener("pointerdown", onPointerDown);

      const heroPos = new THREE.Vector3();
      const heroTarget = new THREE.Vector3();
      const macroPos = new THREE.Vector3();
      const macroTarget = new THREE.Vector3();
      const midPos = new THREE.Vector3();
      const midTarget = new THREE.Vector3();
      const lookTarget = new THREE.Vector3();
      const heroSettleFromPos = new THREE.Vector3();
      const heroSettleToPos = new THREE.Vector3();
      const heroSettleFromLook = new THREE.Vector3();
      const heroSettleToLook = new THREE.Vector3();
      const heroSettleLook = new THREE.Vector3();
      const lensWorld = new THREE.Vector3();
      const lensEdgeWorld = new THREE.Vector3();
      const cardWorld = new THREE.Vector3();
      const projectedCenter = new THREE.Vector3();
      const projectedEdge = new THREE.Vector3();
      const projectedCard = new THREE.Vector3();

      let heroSettleStartMs = 0;
      let heroSettleActive = false;
      let readyNotified = false;
      let raf = 0;

      const onResize = () => {
        const w = mount.clientWidth;
        const h = Math.max(1, mount.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      onResize();

      const updatePhoto = (now: number) => {
        if (phaseRef.current === "retracting" && ejectState !== "idle" && ejectState !== "retracting") {
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
            callbacksRef.current.onStatusChange?.("Ejecting");
          }
          return;
        }
        if (ejectState === "ejecting") {
          const t = clamp01((now - ejectStartMs) / EJECT_DUR_MS);
          const eased = easeInOutCubic(t);
          debugState.ejectState = "ejecting";
          debugState.ejectT = t;
          photoPose.lerpVectors(slotStart, slotDock, eased);
          setPhotoPose(photoPose, eased);
          photo.visible = true;
          if (t >= 1) {
            ejectState = "done";
            if (!ejectDoneSent) {
              ejectDoneSent = true;
              callbacksRef.current.onEjectDone?.();
              callbacksRef.current.onStatusChange?.("Connected");
            }
          }
          return;
        }
        if (ejectState === "retracting") {
          const t = clamp01((now - retractStartMs) / PHOTO_RETRACT_MS);
          const eased = easeInOutCubic(t);
          debugState.ejectState = "retracting";
          debugState.ejectT = t;
          photoPose.lerpVectors(retractFrom, slotStart, eased);
          setPhotoPose(photoPose, 1 - eased);
          photo.visible = true;
          if (t >= 1) {
            ejectState = "idle";
            ejectDoneSent = false;
            photo.visible = false;
            setPhotoPose(slotStart, 0);
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

      const tick = () => {
        const now = performance.now();
        const t = Number.isFinite(timelineRef.current) ? timelineRef.current : 0;

        if (hasGlb && loadedModel) {
          const worldBox = new THREE.Box3().setFromObject(loadedModel);
          if (!worldBox.isEmpty()) {
            camera.fov = FRAMING.heroFov;
            camera.updateProjectionMatrix();
            const fit = computeFitDistance(worldBox, camera, HERO_FIT);
            const size = worldBox.getSize(new THREE.Vector3());
            const center = worldBox.getCenter(new THREE.Vector3());
            const localMax = Math.max(size.x, size.y, size.z);
            heroTarget.copy(center);
            heroPos.copy(center).add(new THREE.Vector3(localMax * 0.18, localMax * 0.12, fit * 0.95));
          }

          lensCenter.getWorldPosition(lensWorld);
          const modelQ = modelRoot.getWorldQuaternion(new THREE.Quaternion());
          const lensN = new THREE.Vector3(0, 0, 1).applyQuaternion(modelQ).normalize();
          const lensR = new THREE.Vector3(1, 0, 0).applyQuaternion(modelQ).normalize();
          const lensU = new THREE.Vector3(0, 1, 0).applyQuaternion(modelQ).normalize();
          macroTarget.copy(lensWorld).addScaledVector(lensN, -0.3).addScaledVector(lensU, 0.012);
          macroPos.copy(lensWorld).addScaledVector(lensN, FRAMING.macroDistance).addScaledVector(lensR, 0.015).addScaledVector(lensU, 0.015);

          const bodyReveal = smoothstep(BEATS.revealStart, BEATS.revealEnd, t);
          const dollyBlend = smoothstep(BEATS.revealEnd, BEATS.readyAt, t);
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
            const s = clamp01((now - heroSettleStartMs) / HERO_SETTLE_MS);
            const eased = easeOutCubic(s);
            camera.position.lerpVectors(heroSettleFromPos, heroSettleToPos, eased);
            heroSettleLook.lerpVectors(heroSettleFromLook, heroSettleToLook, eased);
            camera.lookAt(heroSettleLook);
            if (s >= 1) heroSettleActive = false;
          }
        } else {
          camera.position.set(0, 0.14, 2.2);
          camera.lookAt(0, 0, 0);
        }

        updatePhoto(now);
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
        if (anchorFinite) debugState.anchorPx = { x: cardX, y: cardY, visible: anchorVisible };
        callbacksRef.current.onCardAnchorPx?.({ x: cardX, y: cardY, visible: anchorVisible });

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
        window.removeEventListener("resize", onResize);
        dom.removeEventListener("pointermove", onPointerMove);
        dom.removeEventListener("pointerleave", onPointerLeave);
        dom.removeEventListener("pointerdown", onPointerDown);
        dom.removeEventListener("webglcontextlost", onContextLost);
        dom.removeEventListener("webglcontextrestored", onContextRestored);
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
        envRT.dispose();
        pmrem.dispose();

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
