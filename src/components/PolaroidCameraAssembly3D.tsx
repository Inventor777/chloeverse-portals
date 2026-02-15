"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

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
  onEjectDone?: () => void;
  onRetractDone?: () => void;
  onCardAnchorPx?: (projection: ScreenAnchorPx) => void;
  onStatusChange?: (status: string) => void;
};

const BEATS = {
  closeupEnd: 4.8,
  readyAt: 6.0,
} as const;

const PHOTO = {
  travelDelay: 0.22,
  travelDuration: 1.12,
  retractEnd: 0.55,
} as const;

const FRAMING = {
  heroFillWidth: 0.8,
  heroFillHeight: 0.78,
  heroDistanceScale: 1.24,
  heroFov: 24,
  macroFov: 12.8,
  macroDistance: 0.052,
} as const;

const ANCHORS = {
  lensOffsetX: 0.42,
  frontFaceZ: 1.05,
  topSlotY: 1.02,
  topSlotZ: 0.91,
  topExitZ: 0.89,
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
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

function easeInQuad(t: number) {
  const c = clamp01(t);
  return c * c;
}

function roundedBoxGeometry(width: number, height: number, depth: number, radius = 0.1, segments = 10) {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const r = Math.min(radius, hw - 0.01, hd - 0.01);

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

  const bevel = Math.min(r * 0.42, Math.min(width, height, depth) * 0.14);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: Math.max(3, Math.round(segments * 0.5)),
    curveSegments: Math.max(8, segments),
  });

  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0, -height * 0.5, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function computeFramedDistance(
  target: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
  aspect: number,
  fillWidth = FRAMING.heroFillWidth,
  fillHeight = FRAMING.heroFillHeight
) {
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov * 0.5) * aspect);
  const distW = size.x / (2 * Math.tan(hFov * 0.5) * fillWidth);
  const distH = size.y / (2 * Math.tan(vFov * 0.5) * fillHeight);
  const distance = Math.max(distW, distH) + size.z * 0.25;
  return { center, distance };
}

function createApertureTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const cx = 256;
  const cy = 256;
  ctx.fillStyle = "#040506";
  ctx.fillRect(0, 0, 512, 512);

  const bladeCount = 8;
  for (let i = 0; i < bladeCount; i += 1) {
    const a0 = (i / bladeCount) * Math.PI * 2 + 0.08;
    const a1 = ((i + 1) / bladeCount) * Math.PI * 2 - 0.08;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * 70, cy + Math.sin(a0) * 70);
    ctx.lineTo(cx + Math.cos(a0) * 182, cy + Math.sin(a0) * 182);
    ctx.arc(cx, cy, 182, a0, a1);
    ctx.lineTo(cx + Math.cos(a1) * 70, cy + Math.sin(a1) * 70);
    ctx.arc(cx, cy, 70, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? "rgba(22,25,30,0.48)" : "rgba(16,18,22,0.58)";
    ctx.fill();
  }

  const radial = ctx.createRadialGradient(cx, cy, 12, cx, cy, 244);
  radial.addColorStop(0, "rgba(0,0,0,0.98)");
  radial.addColorStop(0.18, "rgba(0,0,0,0.92)");
  radial.addColorStop(0.46, "rgba(8,10,12,0.7)");
  radial.addColorStop(1, "rgba(4,5,6,1)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createShellRoughnessTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const n0 = Math.sin((x * 12.9898 + y * 78.233) * 0.175) * 43758.5453;
      const n1 = Math.sin((x * 26.6517 + y * 41.773) * 0.097) * 24634.6345;
      const grain = (((n0 - Math.floor(n0)) * 0.62 + (n1 - Math.floor(n1)) * 0.38) * 255) | 0;
      image.data[i] = grain;
      image.data[i + 1] = grain;
      image.data[i + 2] = grain;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4.5, 3.8);
  tex.needsUpdate = true;
  return tex;
}

function createPolaroid() {
  const group = new THREE.Group();

  const photoGeo = new THREE.BoxGeometry(1.86, 2.26, 0.024);
  photoGeo.translate(0, 2.26 / 2, 0);

  const frame = new THREE.Mesh(
    photoGeo,
    new THREE.MeshStandardMaterial({ color: new THREE.Color("#f4f1ea"), roughness: 0.8, metalness: 0.02 })
  );
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const image = new THREE.Mesh(
    new THREE.PlaneGeometry(1.38, 1.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#10141b") })
  );
  image.position.set(0, 1.42, 0.0138);
  group.add(image);

  const footer = new THREE.Mesh(
    new THREE.PlaneGeometry(1.54, 0.42),
    new THREE.MeshBasicMaterial({ color: new THREE.Color("#f7f4ef") })
  );
  footer.position.set(0, 0.43, 0.0138);
  group.add(footer);

  return group;
}

export default function PolaroidCameraAssembly3D(props: PolaroidCameraAssembly3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<ScenePhase>(props.phase ?? "lens_intro");
  const timelineRef = useRef<number>(Number.isFinite(props.timelineT) ? (props.timelineT as number) : 0);
  const isInteractiveRef = useRef<boolean>(!!props.isInteractive);
  const captureNonceRef = useRef<number>(props.captureNonce ?? 0);
  const retractNonceRef = useRef<number>(props.retractNonce ?? 0);
  const captureStartMsRef = useRef<number | null>(null);
  const retractStartMsRef = useRef<number | null>(null);
  const photoDockedRef = useRef(false);

  const callbacksRef = useRef({
    onCaptureIntent: props.onCaptureIntent,
    onPointerHoverChange: props.onPointerHoverChange,
    onLensProject: props.onLensProject,
    onReady: props.onReady,
    onCaptureStart: props.onCaptureStart,
    onEjectDone: props.onEjectDone,
    onRetractDone: props.onRetractDone,
    onCardAnchorPx: props.onCardAnchorPx,
    onStatusChange: props.onStatusChange,
  });

  useEffect(() => {
    if (props.phase) {
      phaseRef.current = props.phase;
    }
  }, [props.phase]);

  useEffect(() => {
    if (Number.isFinite(props.timelineT)) {
      timelineRef.current = props.timelineT as number;
    }
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
      onEjectDone: props.onEjectDone,
      onRetractDone: props.onRetractDone,
      onCardAnchorPx: props.onCardAnchorPx,
      onStatusChange: props.onStatusChange,
    };
  }, [
    props.onCaptureIntent,
    props.onPointerHoverChange,
    props.onLensProject,
    props.onReady,
    props.onCaptureStart,
    props.onEjectDone,
    props.onRetractDone,
    props.onCardAnchorPx,
    props.onStatusChange,
  ]);

  useEffect(() => {
    const nonce = props.captureNonce ?? 0;
    if (nonce !== captureNonceRef.current) {
      captureNonceRef.current = nonce;
      captureStartMsRef.current = performance.now();
      retractStartMsRef.current = null;
      photoDockedRef.current = false;
      callbacksRef.current.onCaptureStart?.();
      callbacksRef.current.onStatusChange?.("Capturing");
    }
  }, [props.captureNonce]);

  useEffect(() => {
    const nonce = props.retractNonce ?? 0;
    if (nonce !== retractNonceRef.current) {
      retractNonceRef.current = nonce;
      retractStartMsRef.current = performance.now();
      captureStartMsRef.current = null;
    }
  }, [props.retractNonce]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(24, mount.clientWidth / mount.clientHeight, 0.01, 140);

    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const key = new THREE.DirectionalLight(0xf9f5ed, 1.22);
    key.position.set(3.4, 4.2, 4.9);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.00035;
    key.shadow.radius = 3;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe3e9f5, 0.28);
    fill.position.set(-4.8, 1.6, 3.1);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xd6dde8, 0.52);
    rim.position.set(1.6, 3.1, -4.8);
    rim.castShadow = true;
    rim.shadow.mapSize.set(512, 512);
    rim.shadow.bias = -0.00025;
    scene.add(rim);

    const lowFill = new THREE.DirectionalLight(0xf2efea, 0.18);
    lowFill.position.set(0, -1.2, 2.8);
    scene.add(lowFill);

    const lensRimLight = new THREE.PointLight(0xdde6f7, 0.31, 8.2, 2);
    lensRimLight.position.set(1.44, 1.06, 3.06);
    scene.add(lensRimLight);

    const rig = new THREE.Group();
    rig.position.set(0, -0.02, 0);
    rig.rotation.set(THREE.MathUtils.degToRad(2.8), THREE.MathUtils.degToRad(-1.4), THREE.MathUtils.degToRad(0.1));
    scene.add(rig);

    const cameraRoot = new THREE.Group();
    cameraRoot.rotation.set(THREE.MathUtils.degToRad(8.6), THREE.MathUtils.degToRad(-2.2), THREE.MathUtils.degToRad(0.3));
    rig.add(cameraRoot);

    const cameraBodyGroup = new THREE.Group();
    const movingPartsGroup = new THREE.Group();
    cameraRoot.add(cameraBodyGroup);
    cameraRoot.add(movingPartsGroup);

    const shellRoughnessTexture = createShellRoughnessTexture();
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#d6ccbe"),
      roughness: 0.38,
      metalness: 0.08,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      roughnessMap: shellRoughnessTexture || undefined,
    });
    const trimMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#c8bdae"),
      roughness: 0.74,
      metalness: 0.06,
      clearcoat: 0.14,
      clearcoatRoughness: 0.52,
    });
    const rubberMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#171b22"),
      roughness: 0.97,
      metalness: 0.01,
    });
    const darkMetalMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#3a3f47"),
      roughness: 0.45,
      metalness: 0.52,
    });
    const faceplateMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#d9d0c4"),
      roughness: 0.54,
      metalness: 0.08,
      clearcoat: 0.34,
      clearcoatRoughness: 0.5,
    });

    const body = new THREE.Mesh(roundedBoxGeometry(4.54, 1.92, 2.02, 0.38, 28), shellMaterial);
    body.position.y = 0.03;
    body.castShadow = true;
    body.receiveShadow = true;
    cameraBodyGroup.add(body);

    const faceplate = new THREE.Mesh(roundedBoxGeometry(3.92, 1.44, 0.16, 0.16, 20), faceplateMaterial);
    faceplate.position.set(0, 0.02, 1.0);
    faceplate.castShadow = true;
    faceplate.receiveShadow = true;
    cameraBodyGroup.add(faceplate);

    const faceplateInset = new THREE.Mesh(
      roundedBoxGeometry(3.72, 1.24, 0.028, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#b8afa2"), roughness: 0.92, metalness: 0.03 })
    );
    faceplateInset.position.set(0, 0.01, 1.085);
    cameraBodyGroup.add(faceplateInset);

    const grooveMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#8e867a"),
      roughness: 0.94,
      metalness: 0.02,
    });
    const frontGrooveTop = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.012, 0.012), grooveMaterial);
    frontGrooveTop.position.set(0, 0.585, 1.102);
    cameraBodyGroup.add(frontGrooveTop);
    const frontGrooveBottom = new THREE.Mesh(new THREE.BoxGeometry(3.56, 0.012, 0.012), grooveMaterial);
    frontGrooveBottom.position.set(0, -0.545, 1.102);
    cameraBodyGroup.add(frontGrooveBottom);
    const frontGrooveLeft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.12, 0.012), grooveMaterial);
    frontGrooveLeft.position.set(-1.78, 0.02, 1.102);
    cameraBodyGroup.add(frontGrooveLeft);
    const frontGrooveRight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.12, 0.012), grooveMaterial);
    frontGrooveRight.position.set(1.78, 0.02, 1.102);
    cameraBodyGroup.add(frontGrooveRight);

    const seamTop = new THREE.Mesh(
      roundedBoxGeometry(4.32, 0.02, 1.7, 0.08, 10),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#b7aea2"), roughness: 0.86, metalness: 0.04 })
    );
    seamTop.position.set(0, 0.91, 0.09);
    cameraBodyGroup.add(seamTop);
    const topPlateGrooveFront = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.008, 0.012), grooveMaterial);
    topPlateGrooveFront.position.set(0, 1.095, 0.56);
    cameraBodyGroup.add(topPlateGrooveFront);
    const topPlateGrooveRear = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.008, 0.012), grooveMaterial);
    topPlateGrooveRear.position.set(0, 1.095, -0.48);
    cameraBodyGroup.add(topPlateGrooveRear);

    const seamFront = new THREE.Mesh(
      new THREE.BoxGeometry(3.96, 0.015, 0.02),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#a59d90"), roughness: 0.92, metalness: 0.03 })
    );
    seamFront.position.set(0, -0.08, 1.02);
    cameraBodyGroup.add(seamFront);

    const leftGrip = new THREE.Mesh(roundedBoxGeometry(0.42, 1.3, 1.54, 0.1, 12), rubberMaterial);
    leftGrip.position.set(-2.02, 0.02, 0.16);
    cameraBodyGroup.add(leftGrip);

    const rightGrip = new THREE.Mesh(roundedBoxGeometry(0.42, 1.3, 1.54, 0.1, 12), rubberMaterial);
    rightGrip.position.set(2.02, 0.02, 0.16);
    cameraBodyGroup.add(rightGrip);

    for (let i = 0; i < 4; i += 1) {
      const y = -0.56 + i * 0.37;
      const leftGripAccent = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 1.3),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#161b22"), roughness: 0.98, metalness: 0.02 })
      );
      leftGripAccent.position.set(-1.83, y, 0.16);
      cameraBodyGroup.add(leftGripAccent);

      const rightGripAccent = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.2, 1.3),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#161b22"), roughness: 0.98, metalness: 0.02 })
      );
      rightGripAccent.position.set(1.83, y, 0.16);
      cameraBodyGroup.add(rightGripAccent);
    }

    const topPlate = new THREE.Mesh(
      new THREE.BoxGeometry(4.1, 0.12, 1.2),
      trimMaterial
    );
    topPlate.position.set(0, 1.03, 0.08);
    topPlate.castShadow = true;
    cameraBodyGroup.add(topPlate);

    const topStrip = new THREE.Mesh(
      new THREE.BoxGeometry(3.86, 0.2, 0.84),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#181c23"), roughness: 0.56, metalness: 0.14 })
    );
    topStrip.position.set(0, 1.08, -0.03);
    cameraBodyGroup.add(topStrip);

    const shutterModule = new THREE.Mesh(
      new THREE.BoxGeometry(0.74, 0.18, 0.5),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#252b35"), roughness: 0.52, metalness: 0.2 })
    );
    shutterModule.position.set(1.45, 1.15, 0.2);
    cameraBodyGroup.add(shutterModule);

    const shutterButton = new THREE.Mesh(
      roundedBoxGeometry(0.31, 0.13, 0.2, 0.05, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#2f333b"), roughness: 0.42, metalness: 0.24 })
    );
    shutterButton.position.set(1.72, 1.2, 0.2);
    cameraBodyGroup.add(shutterButton);

    const viewfinderBump = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.12, 0.22),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#343d47"), roughness: 0.6, metalness: 0.16 })
    );
    viewfinderBump.position.set(-1.32, 1.02, 0.24);
    cameraBodyGroup.add(viewfinderBump);

    const viewfinderFrame = new THREE.Mesh(
      roundedBoxGeometry(0.43, 0.09, 0.08, 0.035, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#20262f"), roughness: 0.5, metalness: 0.24 })
    );
    viewfinderFrame.position.set(-1.31, 1.018, 0.36);
    cameraBodyGroup.add(viewfinderFrame);

    const viewfinderGlass = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.11),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#8fa4bc"),
        transmission: 0.76,
        thickness: 0.045,
        ior: 1.43,
        roughness: 0.08,
        metalness: 0,
        transparent: true,
        opacity: 0.72,
      })
    );
    viewfinderGlass.position.set(-1.31, 1.02, 0.402);
    cameraBodyGroup.add(viewfinderGlass);

    const topSlot = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.03, 0.25),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#252525"), roughness: 0.46, metalness: 0.08 })
    );
    topSlot.position.set(0, ANCHORS.topSlotY, ANCHORS.topSlotZ);
    cameraBodyGroup.add(topSlot);

    const slotWallMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0b0b0b"),
      roughness: 0.9,
      metalness: 0.02,
    });
    const slotCavity = new THREE.Group();
    slotCavity.position.set(0, ANCHORS.topSlotY - 0.004, ANCHORS.topSlotZ - 0.02);
    cameraBodyGroup.add(slotCavity);

    const slotW = 1.62;
    const slotH = 0.12;
    const slotD = 0.34;
    const slotT = 0.018;
    const slotLeftWall = new THREE.Mesh(new THREE.BoxGeometry(slotT, slotH, slotD), slotWallMaterial);
    slotLeftWall.position.set(-(slotW * 0.5) + slotT * 0.5, 0, -slotD * 0.5);
    slotCavity.add(slotLeftWall);

    const slotRightWall = new THREE.Mesh(new THREE.BoxGeometry(slotT, slotH, slotD), slotWallMaterial);
    slotRightWall.position.set((slotW * 0.5) - slotT * 0.5, 0, -slotD * 0.5);
    slotCavity.add(slotRightWall);

    const slotTopWall = new THREE.Mesh(new THREE.BoxGeometry(slotW - slotT * 2, slotT, slotD), slotWallMaterial);
    slotTopWall.position.set(0, (slotH * 0.5) - slotT * 0.5, -slotD * 0.5);
    slotCavity.add(slotTopWall);

    const slotBottomWall = new THREE.Mesh(new THREE.BoxGeometry(slotW - slotT * 2, slotT, slotD), slotWallMaterial);
    slotBottomWall.position.set(0, -(slotH * 0.5) + slotT * 0.5, -slotD * 0.5);
    slotCavity.add(slotBottomWall);

    const slotBackWall = new THREE.Mesh(new THREE.BoxGeometry(slotW - slotT * 2, slotH - slotT * 2, slotT), slotWallMaterial);
    slotBackWall.position.set(0, 0, -slotD + slotT * 0.5);
    slotCavity.add(slotBackWall);

    const topSlotLip = new THREE.Mesh(
      new THREE.BoxGeometry(1.98, 0.085, 0.21),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#c8beaf"), roughness: 0.8, metalness: 0.04 })
    );
    topSlotLip.position.set(0, ANCHORS.topSlotY + 0.034, ANCHORS.topSlotZ + 0.07);
    topSlotLip.castShadow = true;
    cameraBodyGroup.add(topSlotLip);

    const bottomBand = new THREE.Mesh(
      new THREE.BoxGeometry(3.66, 0.04, 0.08),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#d2cabe"), roughness: 0.82, metalness: 0.02 })
    );
    bottomBand.position.set(0, -0.905, ANCHORS.frontFaceZ - 0.025);
    cameraBodyGroup.add(bottomBand);

    const bottomSlot = new THREE.Mesh(
      new THREE.BoxGeometry(1.74, 0.03, 0.22),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#1f1f1f"), roughness: 0.48, metalness: 0.08 })
    );
    bottomSlot.position.set(0, -0.95, ANCHORS.frontFaceZ);
    cameraBodyGroup.add(bottomSlot);

    const screwMaterial = darkMetalMaterial.clone();
    const screwPositions = [
      new THREE.Vector3(-1.72, 0.58, 1.1),
      new THREE.Vector3(1.72, 0.58, 1.1),
      new THREE.Vector3(-1.72, -0.66, 1.1),
      new THREE.Vector3(1.72, -0.66, 1.1),
    ];
    screwPositions.forEach((pos, index) => {
      const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 20), screwMaterial);
      screw.rotation.x = Math.PI * 0.5;
      screw.position.copy(pos);
      cameraBodyGroup.add(screw);

      const screwRecess = new THREE.Mesh(
        new THREE.CylinderGeometry(0.064, 0.064, 0.012, 24),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#949083"), roughness: 0.88, metalness: 0.05 })
      );
      screwRecess.rotation.x = Math.PI * 0.5;
      screwRecess.position.set(pos.x, pos.y, pos.z - 0.009);
      cameraBodyGroup.add(screwRecess);

      const screwSlot = new THREE.Mesh(
        new THREE.BoxGeometry(0.058, 0.008, 0.01),
        new THREE.MeshStandardMaterial({ color: new THREE.Color("#1a1f24"), roughness: 0.9, metalness: 0.05 })
      );
      screwSlot.position.set(pos.x, pos.y, pos.z + 0.016 + (index % 2 === 0 ? 0.0005 : -0.0005));
      cameraBodyGroup.add(screwSlot);
    });

    const lensGroup = new THREE.Group();
    lensGroup.position.set(ANCHORS.lensOffsetX, 0.06, 1.08);
    cameraBodyGroup.add(lensGroup);

    const lensMount = new THREE.Mesh(
      new THREE.TorusGeometry(0.83, 0.026, 24, 120),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#92897d"), roughness: 0.86, metalness: 0.08 })
    );
    lensMount.position.set(ANCHORS.lensOffsetX, 0.06, 1.078);
    cameraBodyGroup.add(lensMount);

    const lensOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.675, 0.675, 0.48, 112),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#0b0d11"), roughness: 0.42, metalness: 0.58 })
    );
    lensOuter.position.z = -0.08;
    lensOuter.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensOuter);

    const lensRimMaterial = darkMetalMaterial.clone();
    lensRimMaterial.color = new THREE.Color("#141414");
    lensRimMaterial.roughness = 0.42;
    lensRimMaterial.metalness = 0.66;
    const lensRim = new THREE.Mesh(new THREE.CylinderGeometry(0.705, 0.705, 0.036, 96), lensRimMaterial);
    lensRim.position.z = 0.152;
    lensRim.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensRim);

    const knurlBase = new THREE.Mesh(
      new THREE.TorusGeometry(0.61, 0.026, 24, 112),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#151a20"), roughness: 0.36, metalness: 0.4 })
    );
    knurlBase.position.z = 0.06;
    lensGroup.add(knurlBase);

    const knurlGroup = new THREE.Group();
    knurlGroup.position.z = 0.06;
    lensGroup.add(knurlGroup);
    for (let i = 0; i < 52; i += 1) {
      const a = (i / 52) * Math.PI * 2;
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.056, 0.026),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(i % 2 === 0 ? "#212730" : "#1b2129"),
          roughness: 0.44,
          metalness: 0.22,
        })
      );
      ridge.position.set(Math.cos(a) * 0.612, Math.sin(a) * 0.612, 0);
      ridge.rotation.z = a + Math.PI * 0.5;
      knurlGroup.add(ridge);
    }

    const lensBarrelA = new THREE.Mesh(
      new THREE.CylinderGeometry(0.49, 0.49, 0.19, 112),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#090b0e"), roughness: 0.28, metalness: 0.24 })
    );
    lensBarrelA.position.z = -0.02;
    lensBarrelA.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensBarrelA);

    const lensBarrelB = new THREE.Mesh(
      new THREE.CylinderGeometry(0.37, 0.37, 0.18, 112),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#07090b"), roughness: 0.3, metalness: 0.2 })
    );
    lensBarrelB.position.z = -0.11;
    lensBarrelB.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensBarrelB);

    const lensBarrelC = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.25, 0.2, 112),
      new THREE.MeshStandardMaterial({ color: new THREE.Color("#050709"), roughness: 0.46, metalness: 0.1 })
    );
    lensBarrelC.position.z = -0.205;
    lensBarrelC.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensBarrelC);

    const apertureTexture = createApertureTexture();
    const apertureDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.192, 84),
      new THREE.MeshBasicMaterial({ map: apertureTexture || undefined, transparent: true, opacity: 0.56 })
    );
    apertureDisc.position.z = -0.234;
    lensGroup.add(apertureDisc);

    const lensCore = new THREE.Mesh(new THREE.CircleGeometry(0.176, 96), new THREE.MeshBasicMaterial({ color: "#020202" }));
    lensCore.position.z = -0.248;
    lensGroup.add(lensCore);

    const lensGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.29, 96),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#7a8797"),
        roughness: 0.04,
        metalness: 0,
        transmission: 0.9,
        thickness: 0.12,
        ior: 1.45,
        transparent: true,
        opacity: 0.76,
      })
    );
    lensGlass.position.z = 0.108;
    lensGroup.add(lensGlass);

    const rearGlass = new THREE.Mesh(
      new THREE.CircleGeometry(0.235, 84),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#55667d"),
        roughness: 0.08,
        metalness: 0,
        transmission: 0.42,
        thickness: 0.1,
        ior: 1.45,
        transparent: true,
        opacity: 0.28,
      })
    );
    rearGlass.position.z = -0.05;
    lensGroup.add(rearGlass);

    const lensHighlightArc = new THREE.Mesh(
      new THREE.RingGeometry(0.256, 0.272, 96, 1, Math.PI * 0.2, Math.PI * 0.72),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#a8bed8"), transparent: true, opacity: 0.055, side: THREE.DoubleSide })
    );
    lensHighlightArc.position.z = 0.138;
    lensHighlightArc.rotation.z = Math.PI * 0.08;
    lensGroup.add(lensHighlightArc);

    const lensReflect = new THREE.Mesh(
      new THREE.CircleGeometry(0.105, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#b2c4dc"), transparent: true, opacity: 0.075 })
    );
    lensReflect.position.set(-0.05, 0.04, 0.11);
    lensGroup.add(lensReflect);

    const lensCenter = new THREE.Object3D();
    lensCenter.position.set(0, 0, 0.17);
    lensGroup.add(lensCenter);

    const lensEdge = new THREE.Object3D();
    lensEdge.position.set(0.72, 0, 0.17);
    lensGroup.add(lensEdge);

    const photo = createPolaroid();
    movingPartsGroup.add(photo);
    const topStartAnchor = new THREE.Vector3(0, ANCHORS.topSlotY - 0.14, ANCHORS.topSlotZ - 0.1);
    const topDockAnchor = new THREE.Vector3(0, ANCHORS.topSlotY + 1.02, ANCHORS.topSlotZ - 0.02);
    photo.position.copy(topStartAnchor);
    photo.rotation.set(-0.062, 0, 0.002);
    photo.visible = false;

    const topEjectPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ANCHORS.topSlotY);
    photo.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const holder = mesh as { material?: THREE.Material | THREE.Material[] };
      if (!holder.material) return;
      if (Array.isArray(holder.material)) {
        holder.material.forEach((material) => {
          const clipMaterial = material as THREE.Material & { clippingPlanes?: THREE.Plane[] };
          clipMaterial.clippingPlanes = [topEjectPlane];
        });
      } else {
        const clipMaterial = holder.material as THREE.Material & { clippingPlanes?: THREE.Plane[] };
        clipMaterial.clippingPlanes = [topEjectPlane];
      }
    });

    const setPhotoPose = (y: number, z: number, progress: number, settleTilt = 0) => {
      const p = clamp01(progress);
      photo.position.set(topDockAnchor.x, y, z);
      photo.rotation.set(mix(-0.062, -0.032, p) + settleTilt, 0, mix(0.002, -0.001, p));
    };

    setPhotoPose(topStartAnchor.y, topStartAnchor.z, 0);

    cameraBodyGroup.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const holder = mesh as { material?: THREE.Material | THREE.Material[] };
      if (!mesh.geometry || !holder.material) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });

    const captureHitTarget = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, 3.1, 2.7),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    captureHitTarget.position.set(0, 0.1, 1.02);
    cameraBodyGroup.add(captureHitTarget);

    const interactiveTargets = [captureHitTarget, body, shutterButton, shutterModule, lensOuter, lensRim];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoverState = false;
    const dom = renderer.domElement;

    const setHoverState = (next: boolean) => {
      if (hoverState === next) return;
      hoverState = next;
      dom.style.cursor = next && isInteractiveRef.current ? "pointer" : "default";
      callbacksRef.current.onPointerHoverChange?.(next && isInteractiveRef.current);
    };

    const intersectsInteractive = (event: PointerEvent) => {
      const rect = dom.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactiveTargets, true);
      return hit.length > 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!isInteractiveRef.current) {
        setHoverState(false);
        return;
      }
      setHoverState(intersectsInteractive(event));
    };

    const onPointerLeave = () => {
      setHoverState(false);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !isInteractiveRef.current) return;
      if (!intersectsInteractive(event)) return;
      callbacksRef.current.onCaptureIntent?.();
    };

    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerleave", onPointerLeave);
    dom.addEventListener("pointerdown", onPointerDown);

    const heroTarget = new THREE.Vector3();
    const heroPos = new THREE.Vector3();
    const macroTarget = new THREE.Vector3();
    const macroPos = new THREE.Vector3();
    const lookTarget = new THREE.Vector3();
    const lensQuat = new THREE.Quaternion();
    const lensNormal = new THREE.Vector3();
    const lensRight = new THREE.Vector3();
    const lensUp = new THREE.Vector3();
    const lensWorld = new THREE.Vector3();
    const lensEdgeWorld = new THREE.Vector3();
    const photoAnchorWorld = new THREE.Vector3();
    const projectedCenter = new THREE.Vector3();
    const projectedEdge = new THREE.Vector3();
    const projectedPhotoAnchor = new THREE.Vector3();
    const midPos = new THREE.Vector3();
    const midTarget = new THREE.Vector3();

    let readyNotified = false;
    let raf = 0;

    const refreshHeroFrame = () => {
      const aspect = Math.max(0.5, mount.clientWidth / Math.max(1, mount.clientHeight));
      const frame = computeFramedDistance(cameraBodyGroup, camera, aspect);
      heroTarget.copy(frame.center).add(new THREE.Vector3(0, 0.06, 0));
      heroPos.copy(heroTarget).add(new THREE.Vector3(0, 0.3, frame.distance * FRAMING.heroDistanceScale));
    };

    const refreshMacroFrame = () => {
      lensCenter.getWorldPosition(lensWorld);
      lensGroup.getWorldQuaternion(lensQuat);
      lensNormal.set(0, 0, 1).applyQuaternion(lensQuat).normalize();
      lensRight.set(1, 0, 0).applyQuaternion(lensQuat).normalize();
      lensUp.set(0, 1, 0).applyQuaternion(lensQuat).normalize();
      macroTarget.copy(lensWorld).addScaledVector(lensNormal, -0.3).addScaledVector(lensUp, 0.01);
      macroPos
        .copy(lensWorld)
        .addScaledVector(lensNormal, FRAMING.macroDistance)
        .addScaledVector(lensRight, 0.01)
        .addScaledVector(lensUp, 0.012);
    };

    const onResize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      refreshHeroFrame();
      refreshMacroFrame();
    };

    window.addEventListener("resize", onResize);
    onResize();

    const tick = () => {
      const now = performance.now();
      const t = Number.isFinite(timelineRef.current) ? timelineRef.current : 0;

      const closeupBlend = smoothstep(1.7, BEATS.closeupEnd, t);
      const dollyBlend = smoothstep(BEATS.closeupEnd, BEATS.readyAt, t);

      refreshMacroFrame();
      midPos.lerpVectors(macroPos, heroPos, closeupBlend * 0.72);
      camera.position.lerpVectors(midPos, heroPos, dollyBlend);
      midTarget.lerpVectors(macroTarget, heroTarget, closeupBlend * 0.76);
      lookTarget.lerpVectors(midTarget, heroTarget, dollyBlend);
      camera.fov = mix(FRAMING.macroFov, FRAMING.heroFov, clamp01(closeupBlend * 0.82 + dollyBlend * 0.18));
      camera.updateProjectionMatrix();
      camera.lookAt(lookTarget);

      if (!readyNotified && t >= BEATS.readyAt) {
        readyNotified = true;
        callbacksRef.current.onReady?.();
        callbacksRef.current.onStatusChange?.("Ready");
      }

      let shutterPress = 0;
      if (captureStartMsRef.current !== null) {
        const localCaptureElapsed = Math.max(0, (now - captureStartMsRef.current) / 1000);
        shutterPress = smoothstep(0.01, 0.08, localCaptureElapsed) * (1 - smoothstep(0.11, 0.2, localCaptureElapsed));

        if (localCaptureElapsed < PHOTO.travelDelay) {
          setPhotoPose(topStartAnchor.y, topStartAnchor.z, 0);
          photo.visible = false;
        } else {
          const motionLinear = clamp01((localCaptureElapsed - PHOTO.travelDelay) / PHOTO.travelDuration);
          const travelRaw = smoothstep(PHOTO.travelDelay, PHOTO.travelDelay + PHOTO.travelDuration, localCaptureElapsed);

          let ejectT = 0;
          if (motionLinear < 0.22) {
            const stuck = easeInQuad(motionLinear / 0.22);
            ejectT = 0.085 * stuck;
          } else {
            const release = easeOutCubic((motionLinear - 0.22) / 0.78);
            ejectT = 0.085 + 0.915 * release;
          }

          const settleTime = Math.max(0, localCaptureElapsed - (PHOTO.travelDelay + PHOTO.travelDuration));
          const overshootY =
            smoothstep(0.88, 1, travelRaw) *
            Math.sin(settleTime * 18) *
            Math.exp(-9 * settleTime) *
            0.013;
          const overshootZ = -overshootY * 0.22;
          const settleTilt = overshootY * 0.2;
          const travelY = mix(topStartAnchor.y, topDockAnchor.y, ejectT) + overshootY;
          const travelZ = mix(topStartAnchor.z, topDockAnchor.z, ejectT) + overshootZ;
          setPhotoPose(travelY, travelZ, ejectT, settleTilt);
          photo.visible = true;

          if (travelRaw >= 1 && !photoDockedRef.current) {
            photoDockedRef.current = true;
            callbacksRef.current.onEjectDone?.();
            callbacksRef.current.onStatusChange?.("Connected");
          }

          if (photoDockedRef.current) {
            captureStartMsRef.current = null;
            setPhotoPose(topDockAnchor.y, topDockAnchor.z, 1);
            photo.visible = true;
          }
        }
      } else if (retractStartMsRef.current !== null) {
        const retractElapsed = Math.max(0, (now - retractStartMsRef.current) / 1000);
        const retractT = smoothstep(0, PHOTO.retractEnd, retractElapsed);
        const retractY = mix(topDockAnchor.y, topStartAnchor.y, retractT);
        const retractZ = mix(topDockAnchor.z, topStartAnchor.z, retractT);
        setPhotoPose(retractY, retractZ, 1 - retractT);
        photo.visible = true;

        if (retractT >= 1) {
          photo.visible = false;
          retractStartMsRef.current = null;
          captureStartMsRef.current = null;
          photoDockedRef.current = false;
          setPhotoPose(topStartAnchor.y, topStartAnchor.z, 0);
          callbacksRef.current.onRetractDone?.();
        }
      } else if (phaseRef.current === "connected" || photoDockedRef.current) {
        setPhotoPose(topDockAnchor.y, topDockAnchor.z, 1);
        photo.visible = true;
      } else {
        setPhotoPose(topStartAnchor.y, topStartAnchor.z, 0);
        photo.visible = false;
      }

      shutterButton.position.y = mix(1.2, 1.168, shutterPress);

      lensCenter.getWorldPosition(lensWorld);
      lensEdge.getWorldPosition(lensEdgeWorld);
      projectedCenter.copy(lensWorld).project(camera);
      projectedEdge.copy(lensEdgeWorld).project(camera);

      callbacksRef.current.onLensProject?.({
        x: (projectedCenter.x * 0.5 + 0.5) * mount.clientWidth,
        y: (-projectedCenter.y * 0.5 + 0.5) * mount.clientHeight,
        r: Math.hypot(
          (projectedEdge.x - projectedCenter.x) * 0.5 * mount.clientWidth,
          (-projectedEdge.y + projectedCenter.y) * 0.5 * mount.clientHeight
        ),
        visible: projectedCenter.z > -1 && projectedCenter.z < 1,
      });

      photoAnchorWorld
        .copy(lensWorld)
        .addScaledVector(lensUp, 0.25)
        .addScaledVector(lensRight, 0.35)
        .addScaledVector(lensNormal, 0.04);
      projectedPhotoAnchor.copy(photoAnchorWorld).project(camera);
      callbacksRef.current.onCardAnchorPx?.({
        x: (projectedPhotoAnchor.x * 0.5 + 0.5) * mount.clientWidth,
        y: (-projectedPhotoAnchor.y * 0.5 + 0.5) * mount.clientHeight,
        visible: projectedPhotoAnchor.z > -1 && projectedPhotoAnchor.z < 1,
      });

      renderer.toneMappingExposure = 0.96 + closeupBlend * 0.16;
      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerleave", onPointerLeave);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.style.cursor = "default";
      callbacksRef.current.onPointerHoverChange?.(false);

      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const holder = mesh as { material?: THREE.Material | THREE.Material[] };
        if (!holder.material) return;
        if (Array.isArray(holder.material)) {
          holder.material.forEach((material) => material.dispose());
        } else {
          holder.material.dispose();
        }
      });
      if (apertureTexture) apertureTexture.dispose();
      if (shellRoughnessTexture) shellRoughnessTexture.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" />;
}
