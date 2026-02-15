
"use client";

import { animate, motion, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type WorkSection = {
  heading: string;
  body: string[];
};

type MatrixWorkStation3DProps = {
  sections: WorkSection[];
};

type ScreenPhase = "locked" | "flash" | "boot" | "dossier";
type ViewMode = "hero" | "zooming" | "screen";

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

function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function smoothStep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
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
  const [phase, setPhase] = useState<ScreenPhase>("locked");
  const [viewMode, setViewMode] = useState<ViewMode>("hero");
  const [typedCount, setTypedCount] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [introComplete, setIntroComplete] = useState(false);

  const dragMaxRef = useRef(dragMax);
  const swipeProgressRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const phaseRef = useRef<ScreenPhase>("locked");
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
  const canvasScrollRef = useRef(0);
  const canvasMaxScrollRef = useRef(0);

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
    if (phase === "flash" || phase === "boot" || phase === "dossier") {
      canvasReadyRef.current = true;
    }
  }, [phase]);

  useEffect(() => {
    introCompleteRef.current = introComplete;
  }, [introComplete]);

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

  const playAuthBeep = useCallback(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    const context = new AudioContextCtor();
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);

    const oscillator = context.createOscillator();
    oscillator.type = "square";
    oscillator.frequency.value = 1120;
    oscillator.connect(gain);

    const now = context.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    oscillator.start(now);
    oscillator.stop(now + 0.24);

    window.setTimeout(() => {
      context.close().catch(() => undefined);
    }, 320);
  }, []);

  const skipIntro = useCallback(() => {
    if (introCompleteRef.current) return;
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
    const mount = mountRef.current;
    const root = rootRef.current;
    if (!mount || !root) return;

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
    renderer.toneMappingExposure = 0.88;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(33, mount.clientWidth / Math.max(1, mount.clientHeight), 0.025, 90);
    camera.updateProjectionMatrix();
    const cameraBase = new THREE.Vector3(0.22, 1.55, 5.35);
    camera.position.copy(cameraBase);

    const stage = new THREE.Group();
    stage.position.y = -0.2;
    scene.add(stage);

    const backPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(42, 22),
      new THREE.MeshBasicMaterial({
        color: 0x040b08,
        transparent: true,
        opacity: 0.16,
      })
    );
    backPlate.position.set(0, 4.3, -10.5);
    stage.add(backPlate);

    const ambient = new THREE.AmbientLight(0xb6dfca, 0.42);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xf4fff6, 1.84);
    key.position.set(2.7, 4.8, 2.8);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xb3d5c3, 0.74);
    fill.position.set(-3.8, 2.9, 3.6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x76dba4, 0.42);
    rim.position.set(1.1, 1.8, -4.5);
    scene.add(rim);

    const rearRim = new THREE.DirectionalLight(0x6bcf99, 0.24);
    rearRim.position.set(-2.4, 1.5, -5.6);
    scene.add(rearRim);

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
      color: 0x1a201e,
      roughness: 0.64,
      roughnessMap: chassisNoiseTexture ?? undefined,
      metalness: 0.14,
    });
    const shellDarkMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1210,
      roughness: 0.78,
      metalness: 0.08,
    });
    const metalTrimMaterial = new THREE.MeshStandardMaterial({
      color: 0x74807a,
      roughness: 0.34,
      metalness: 0.78,
    });
    const plateMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b4541,
      roughness: 0.42,
      roughnessMap: chassisNoiseTexture ?? undefined,
      metalness: 0.66,
    });

    const keyboardBase = new THREE.Group();
    keyboardBase.position.set(0, -0.74, 0.86);
    keyboardBase.scale.setScalar(1.03);
    terminal.add(keyboardBase);

    const keyboardMain = new THREE.Mesh(
      createRoundedBoxGeometry(4.22, 0.64, 2.54, 0.11, 12),
      shellMaterial
    );
    keyboardMain.rotation.x = -0.05;
    keyboardBase.add(keyboardMain);

    const keyboardUnderside = new THREE.Mesh(
      createRoundedBoxGeometry(4.02, 0.18, 2.22, 0.08, 10),
      shellDarkMaterial
    );
    keyboardUnderside.position.set(0, -0.26, 0.08);
    keyboardUnderside.rotation.x = -0.07;
    keyboardBase.add(keyboardUnderside);

    const keyboardFrontLip = new THREE.Mesh(
      createRoundedBoxGeometry(4.08, 0.14, 0.28, 0.04, 8),
      metalTrimMaterial
    );
    keyboardFrontLip.position.set(0, 0.16, 1.16);
    keyboardFrontLip.rotation.x = -0.1;
    keyboardBase.add(keyboardFrontLip);

    const frontGrillMaterial = new THREE.MeshStandardMaterial({ color: 0x202825, roughness: 0.38, metalness: 0.62 });
    for (let i = 0; i < 16; i += 1) {
      const grill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.018, 0.046), frontGrillMaterial);
      grill.position.set(-1.24 + i * 0.165, 0.1, 1.25);
      keyboardBase.add(grill);
    }

    const keyboardTop = new THREE.Group();
    keyboardTop.position.set(0, 0.29, 0.1);
    keyboardTop.rotation.x = -0.16;
    keyboardBase.add(keyboardTop);

    const keyboardDeck = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.06, 1.96), plateMaterial);
    keyboardTop.add(keyboardDeck);

    const keyWell = new THREE.Mesh(
      new THREE.BoxGeometry(3.56, 0.03, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x111816, roughness: 0.74, metalness: 0.12 })
    );
    keyWell.position.set(0, 0.038, -0.02);
    keyboardTop.add(keyWell);

    const keyboardDeckScrewGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.016, 14);
    const keyboardDeckScrewMaterial = new THREE.MeshStandardMaterial({ color: 0x838c87, roughness: 0.24, metalness: 0.86 });
    const deckScrewPoints: [number, number, number][] = [
      [-1.86, 0.05, -0.94],
      [1.86, 0.05, -0.94],
      [-1.86, 0.05, 0.92],
      [1.86, 0.05, 0.92],
    ];
    deckScrewPoints.forEach(([x, y, z]) => {
      const screw = new THREE.Mesh(keyboardDeckScrewGeo, keyboardDeckScrewMaterial);
      screw.rotation.x = Math.PI * 0.5;
      screw.position.set(x, y, z);
      keyboardTop.add(screw);
    });

    const keyCapGeometry = createRoundedBoxGeometry(0.118, 0.056, 0.118, 0.016, 6);
    const keyCapMaterial = new THREE.MeshStandardMaterial({
      color: 0x47544d,
      roughness: 0.46,
      roughnessMap: keyNoiseTexture ?? undefined,
      metalness: 0.22,
      emissive: 0x193125,
      emissiveIntensity: 0.12,
    });
    const rowCounts = [19, 20, 21, 21, 20, 18];
    const rowOffsets = [0.06, 0.03, 0, 0.02, 0.08, 0.15];
    const keyCount = rowCounts.reduce((sum, value) => sum + value, 0);
    const keyCaps = new THREE.InstancedMesh(keyCapGeometry, keyCapMaterial, keyCount);
    keyCaps.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    keyCaps.castShadow = false;
    keyCaps.receiveShadow = true;
    keyboardTop.add(keyCaps);

    const keyDummy = new THREE.Object3D();
    const keyColor = new THREE.Color();
    let keyIndex = 0;
    for (let row = 0; row < rowCounts.length; row += 1) {
      const columns = rowCounts[row];
      for (let col = 0; col < columns; col += 1) {
        let sx = 1;
        let sy = 1 + row * 0.03;
        const sz = 1;
        keyColor.setHex(0x47544d);

        if (row === 0 && col === 0) {
          sx = 1.85;
          keyColor.setHex(0x904949);
        } else if (row === 2 && col === columns - 1) {
          sx = 2.35;
          keyColor.setHex(0xb3723c);
        } else if (row === rowCounts.length - 1 && col >= 7 && col <= 11) {
          sx = 1.9;
          keyColor.setHex(0xb39845);
        } else if ((row === 1 && (col === 3 || col === 12)) || (row === 4 && col === 15)) {
          keyColor.setHex(0x365144);
          sy += 0.06;
        }

        const x = -1.38 + rowOffsets[row] + col * 0.145;
        const z = -0.68 + row * 0.16;
        const heightJitter = ((row + col) % 3) * 0.002;
        keyDummy.position.set(x, 0.125 + heightJitter, z);
        keyDummy.scale.set(sx, sy, sz);
        keyDummy.updateMatrix();
        keyCaps.setMatrixAt(keyIndex, keyDummy.matrix);
        keyCaps.setColorAt(keyIndex, keyColor);
        keyIndex += 1;
      }
    }
    keyCaps.instanceMatrix.needsUpdate = true;
    if (keyCaps.instanceColor) keyCaps.instanceColor.needsUpdate = true;

    const monitorSupport = new THREE.Mesh(
      createRoundedBoxGeometry(1.42, 0.32, 0.8, 0.08, 8),
      shellMaterial
    );
    monitorSupport.position.set(0, -0.36, 0.22);
    terminal.add(monitorSupport);

    const monitorHousing = new THREE.Group();
    monitorHousing.position.set(0, -0.14, -0.08);
    monitorHousing.rotation.x = -0.06;
    terminal.add(monitorHousing);

    const monitorShell = new THREE.Mesh(
      createRoundedBoxGeometry(3.36, 1.98, 2.36, 0.2, 18),
      shellMaterial
    );
    monitorShell.position.set(0, 0.72, 0.16);
    monitorHousing.add(monitorShell);

    const monitorRear = new THREE.Mesh(
      createRoundedBoxGeometry(2.72, 1.48, 1.34, 0.12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x1f2724,
        roughness: 0.58,
        roughnessMap: chassisNoiseTexture ?? undefined,
        metalness: 0.18,
      })
    );
    monitorRear.position.set(0, 0.86, -0.88);
    monitorHousing.add(monitorRear);

    const monitorSeam = new THREE.Mesh(
      new THREE.BoxGeometry(3.02, 0.018, 1.92),
      new THREE.MeshStandardMaterial({ color: 0x2c3531, roughness: 0.3, metalness: 0.48 })
    );
    monitorSeam.position.set(0, 0.12, 0.18);
    monitorHousing.add(monitorSeam);

    const rearVentMaterial = new THREE.MeshStandardMaterial({ color: 0x0c100f, roughness: 0.82, metalness: 0.08 });
    for (let i = 0; i < 10; i += 1) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.024, 0.05), rearVentMaterial);
      vent.position.set(0, 1.46 - i * 0.1, -1.02);
      monitorHousing.add(vent);
    }
    for (let i = 0; i < 7; i += 1) {
      const sideVentLeft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.78), rearVentMaterial);
      sideVentLeft.position.set(-1.62, 1.24 - i * 0.12, -0.42);
      monitorHousing.add(sideVentLeft);

      const sideVentRight = sideVentLeft.clone();
      sideVentRight.position.x = 1.62;
      monitorHousing.add(sideVentRight);
    }

    const recessCavity = new THREE.Mesh(
      createRoundedRectRingGeometry(2.34, 1.42, 2.06, 1.14, 0.16, 0.08, 0.36, 16),
      new THREE.MeshStandardMaterial({ color: 0x030604, roughness: 0.92, metalness: 0.04 })
    );
    recessCavity.position.set(0, 0.62, 0.88);
    monitorHousing.add(recessCavity);

    const recessLip = new THREE.Mesh(
      createRoundedRectRingGeometry(2.3, 1.36, 2.08, 1.16, 0.14, 0.08, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: 0x141a18, roughness: 0.58, metalness: 0.18 })
    );
    recessLip.position.set(0, 0.62, 1.09);
    monitorHousing.add(recessLip);

    const screenW = 2.02;
    const screenH = 1.14;
    canvasPaintedRef.current = false;
    canvasPresentedFramesRef.current = 0;

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a4741,
      roughness: 0.28,
      metalness: 0.72,
      emissive: 0x101713,
      emissiveIntensity: 0.16,
    });
    const frameDepth = 0.08;
    const frameThickness = 0.17;
    const frameTop = new THREE.Mesh(
      createRoundedBoxGeometry(screenW + 0.36, frameThickness, frameDepth, 0.04, 8),
      frameMaterial
    );
    frameTop.position.set(0, 0.62 + screenH * 0.5 + 0.11, 1.26);
    frameTop.renderOrder = 2;
    monitorHousing.add(frameTop);
    const frameBottom = new THREE.Mesh(
      createRoundedBoxGeometry(screenW + 0.36, frameThickness, frameDepth, 0.04, 8),
      frameMaterial
    );
    frameBottom.position.set(0, 0.62 - screenH * 0.5 - 0.11, 1.26);
    frameBottom.renderOrder = 2;
    monitorHousing.add(frameBottom);
    const frameLeft = new THREE.Mesh(
      createRoundedBoxGeometry(frameThickness, screenH + 0.2, frameDepth, 0.04, 8),
      frameMaterial
    );
    frameLeft.position.set(-screenW * 0.5 - 0.12, 0.62, 1.26);
    frameLeft.renderOrder = 2;
    monitorHousing.add(frameLeft);
    const frameRight = new THREE.Mesh(
      createRoundedBoxGeometry(frameThickness, screenH + 0.2, frameDepth, 0.04, 8),
      frameMaterial
    );
    frameRight.position.set(screenW * 0.5 + 0.12, 0.62, 1.26);
    frameRight.renderOrder = 2;
    monitorHousing.add(frameRight);

    const screenGeometry = new THREE.PlaneGeometry(screenW, screenH, 28, 28);
    const screenVerts = screenGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < screenVerts.count; i += 1) {
      const nx = screenVerts.getX(i) / (screenW * 0.5);
      const ny = screenVerts.getY(i) / (screenH * 0.5);
      const bow = Math.max(0, 1 - nx * nx - ny * ny) * 0.072;
      screenVerts.setZ(i, bow);
    }
    screenVerts.needsUpdate = true;
    screenGeometry.computeVertexNormals();

    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 1024;
    screenCanvas.height = 768;
    const screenContext = screenCanvas.getContext("2d");
    const screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.colorSpace = THREE.SRGBColorSpace;
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
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

    const screenMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: screenTexture,
      emissiveMap: screenTexture,
      roughness: 0.12,
      metalness: 0.02,
      emissive: 0x8ad5a9,
      emissiveIntensity: 2.28,
      side: THREE.DoubleSide,
      transparent: true,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.set(0, 0.62, 1.1);
    screen.renderOrder = 1;
    monitorHousing.add(screen);

    const curvedGlassGeometry = new THREE.PlaneGeometry(screenW * 1.03, screenH * 1.03, 36, 28);
    const vertices = curvedGlassGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < vertices.count; index += 1) {
      const x = vertices.getX(index) / (screenW * 0.5);
      const y = vertices.getY(index) / (screenH * 0.5);
      const bulge = Math.max(0, 1 - x * x - y * y) * 0.084;
      vertices.setZ(index, bulge);
    }
    vertices.needsUpdate = true;
    curvedGlassGeometry.computeVertexNormals();

    const glass = new THREE.Mesh(
      curvedGlassGeometry,
      new THREE.MeshPhysicalMaterial({
        color: 0x8fc5ad,
        roughness: 0.08,
        metalness: 0.02,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        depthTest: true,
        clearcoat: 0.38,
        clearcoatRoughness: 0.22,
        ior: 1.4,
        transmission: 0.06,
      })
    );
    glass.position.set(0, 0.62, 1.21);
    glass.renderOrder = 3;
    monitorHousing.add(glass);
    const glassMaterial = glass.material as THREE.MeshPhysicalMaterial;

    const glassStreak = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW * 0.9, screenH * 0.22),
      new THREE.MeshBasicMaterial({
        color: 0xe7fff2,
        transparent: true,
        opacity: 0.072,
        depthWrite: false,
      })
    );
    glassStreak.position.set(0, 0.82, 1.24);
    glassStreak.rotation.z = -0.22;
    monitorHousing.add(glassStreak);

    const screenTopLeft = new THREE.Object3D();
    screenTopLeft.position.set(-screenW * 0.5, 0.62 + screenH * 0.5, 1.2);
    monitorHousing.add(screenTopLeft);

    const screenTopRight = new THREE.Object3D();
    screenTopRight.position.set(screenW * 0.5, 0.62 + screenH * 0.5, 1.2);
    monitorHousing.add(screenTopRight);

    const screenBottomLeft = new THREE.Object3D();
    screenBottomLeft.position.set(-screenW * 0.5, 0.62 - screenH * 0.5, 1.2);
    monitorHousing.add(screenBottomLeft);

    const screenBottomRight = new THREE.Object3D();
    screenBottomRight.position.set(screenW * 0.5, 0.62 - screenH * 0.5, 1.2);
    monitorHousing.add(screenBottomRight);

    const screenCenterAnchor = new THREE.Object3D();
    screenCenterAnchor.position.set(0, 0.62, 1.12);
    monitorHousing.add(screenCenterAnchor);

    const screenGlow = new THREE.PointLight(0x67ff9e, 0.42, 4.8, 2.2);
    screenGlow.position.set(0, 0.5, 1.02);
    terminal.add(screenGlow);
    const keyboardSpill = new THREE.SpotLight(0x73ffad, 0.2, 6, Math.PI / 5, 0.65, 1.7);
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

    const sideBracket = new THREE.Mesh(
      createRoundedBoxGeometry(0.22, 0.86, 0.28, 0.03, 8),
      metalTrimMaterial
    );
    sideBracket.position.set(1.94, -0.06, 0.54);
    terminal.add(sideBracket);

    const sideBoltGeometry = new THREE.CylinderGeometry(0.032, 0.032, 0.02, 16);
    const sideBoltMaterial = new THREE.MeshStandardMaterial({ color: 0x8d9691, roughness: 0.24, metalness: 0.86 });
    [0.24, -0.24].forEach((y) => {
      const bolt = new THREE.Mesh(sideBoltGeometry, sideBoltMaterial);
      bolt.rotation.x = Math.PI * 0.5;
      bolt.position.set(1.94, y, 0.7);
      terminal.add(bolt);
    });

    const cableNotch = new THREE.Mesh(
      createRoundedBoxGeometry(0.72, 0.12, 0.14, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0x090d0c, roughness: 0.62, metalness: 0.18 })
    );
    cableNotch.position.set(0, -1.06, -0.96);
    terminal.add(cableNotch);

    const footMaterial = new THREE.MeshStandardMaterial({ color: 0x090b0b, roughness: 0.88, metalness: 0.02 });
    const footGeo = createRoundedBoxGeometry(0.32, 0.05, 0.22, 0.03, 6);
    const feet: [number, number, number][] = [
      [-1.54, -1.1, 1.34],
      [1.54, -1.1, 1.34],
      [-1.54, -1.1, -0.48],
      [1.54, -1.1, -0.48],
    ];
    feet.forEach(([x, y, z]) => {
      const foot = new THREE.Mesh(footGeo, footMaterial);
      foot.position.set(x, y, z);
      terminal.add(foot);
    });

    const chassisScrewGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.012, 14);
    const chassisScrewMat = new THREE.MeshStandardMaterial({ color: 0x666f6a, roughness: 0.3, metalness: 0.8 });
    const chassisScrews: [number, number, number][] = [
      [-1.6, 1.16, -0.96],
      [1.6, 1.16, -0.96],
      [-1.6, -0.04, -0.96],
      [1.6, -0.04, -0.96],
      [-1.3, -0.52, 1.2],
      [1.3, -0.52, 1.2],
    ];
    chassisScrews.forEach(([x, y, z]) => {
      const screw = new THREE.Mesh(chassisScrewGeo, chassisScrewMat);
      screw.rotation.x = Math.PI * 0.5;
      screw.position.set(x, y, z);
      terminal.add(screw);
    });

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
    powerLed.position.set(1.18, 0.05, 1.26);
    monitorHousing.add(powerLed);
    const powerLedMaterial = powerLed.material as THREE.MeshStandardMaterial;

    const leverAssembly = new THREE.Group();
    leverAssembly.position.set(1.94, -0.56, 1.02);
    terminal.add(leverAssembly);

    const leverHousing = new THREE.Mesh(
      createRoundedBoxGeometry(0.68, 1.46, 0.38, 0.1, 10),
      new THREE.MeshStandardMaterial({
        color: 0x151b18,
        roughness: 0.54,
        roughnessMap: chassisNoiseTexture ?? undefined,
        metalness: 0.34,
      })
    );
    leverAssembly.add(leverHousing);

    const leverChannel = new THREE.Mesh(
      createRoundedBoxGeometry(0.22, 1.24, 0.12, 0.04, 8),
      new THREE.MeshStandardMaterial({ color: 0x070b09, roughness: 0.4, metalness: 0.42 })
    );
    leverChannel.position.set(0.16, -0.03, 0.1);
    leverAssembly.add(leverChannel);

    const leverLip = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 1.24, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x28332e, roughness: 0.28, metalness: 0.52 })
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
      new THREE.MeshStandardMaterial({ color: 0x87938e, roughness: 0.24, metalness: 0.88 })
    );
    leverStem.position.set(0.16, 0.22, 0.13);
    leverAssembly.add(leverStem);

    const leverHandle = new THREE.Mesh(
      createRoundedBoxGeometry(0.2, 0.16, 0.18, 0.06, 8),
      new THREE.MeshStandardMaterial({ color: 0xcfd7d3, roughness: 0.3, metalness: 0.62 })
    );
    leverHandle.position.set(0.16, 0.52, 0.15);
    leverHandle.userData = { action: "auth", baseY: leverHandle.position.y };
    leverAssembly.add(leverHandle);

    const leverGripInset = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.06, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x4d5852, roughness: 0.6, metalness: 0.16 })
    );
    leverGripInset.position.set(0, 0.03, 0.03);
    leverHandle.add(leverGripInset);

    const screwMaterial = new THREE.MeshStandardMaterial({ color: 0x5f6762, roughness: 0.26, metalness: 0.84 });
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

    const remote = new THREE.Group();
    remote.position.set(1.02, -0.84, 1.12);
    remote.rotation.x = -0.18;
    terminal.add(remote);

    const remoteBody = new THREE.Mesh(
      createRoundedBoxGeometry(1.18, 0.2, 0.58, 0.08, 8),
      new THREE.MeshStandardMaterial({ color: 0x151a18, roughness: 0.62, metalness: 0.25 })
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


    const fitBox = new THREE.Box3();
    const fitSize = new THREE.Vector3();
    const fitCenter = new THREE.Vector3();
    const computeFitDistance = (aspect: number) => {
      fitBox.setFromObject(stationRoot);
      fitBox.getCenter(fitCenter);
      fitBox.getSize(fitSize);
      const fitVFov = THREE.MathUtils.degToRad(33);
      const hFov = 2 * Math.atan(Math.tan(fitVFov * 0.5) * aspect);
      const fillHeight = 0.9;
      const fillWidth = 0.93;
      const distV = (fitSize.y * 0.5) / (Math.tan(fitVFov * 0.5) * fillHeight);
      const distH = (fitSize.x * 0.5) / (Math.tan(hFov * 0.5) * fillWidth);
      return Math.max(distV, distH) + fitSize.z * 0.42;
    };

    const interactiveMeshes: THREE.Mesh[] = [slashButton, caretButton, holdButton, leverHandle];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const stableZoomCenter = new THREE.Vector3();
    const stableZoomNormal = new THREE.Vector3();
    const stableCameraOffset = new THREE.Vector3();
    zoomTargetLockedRef.current = false;
    const lockZoomTarget = () => {
      if (zoomTargetLockedRef.current) return;
      screenCenterAnchor.getWorldPosition(stableZoomCenter);
      const screenQuaternion = new THREE.Quaternion();
      screen.getWorldQuaternion(screenQuaternion);
      stableZoomNormal.set(0, 0, 1).applyQuaternion(screenQuaternion).normalize();
      stableCameraOffset.copy(camera.position).sub(stableZoomCenter);
      if (stableZoomNormal.dot(stableCameraOffset) < 0) {
        stableZoomNormal.multiplyScalar(-1);
      }
      const finalFov = 26.8;
      const finalVFov = THREE.MathUtils.degToRad(finalFov);
      const screenDistanceRaw = (screenH * 0.55) / Math.tan(finalVFov * 0.5);
      const safeZoomDistance = THREE.MathUtils.clamp(screenDistanceRaw, 0.6, 6.2);
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
      const hits = raycaster.intersectObjects(interactiveMeshes, false);
      const next = hits.length > 0 && hits[0].object instanceof THREE.Mesh ? (hits[0].object as THREE.Mesh) : null;

      if (next !== hoveredButton) {
        if (hoveredButton) pulseButton(hoveredButton, false);
        hoveredButton = next;
        if (hoveredButton) pulseButton(hoveredButton, true);
      }
      renderer.domElement.style.cursor = hoveredButton ? "pointer" : "default";
    };

    const onPointerDown = (event: PointerEvent) => {
      skipIntro();
      updateButtonHover(event);
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

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
    const onRendererPointerLeave = () => {
      if (hoveredButton) pulseButton(hoveredButton, false);
      hoveredButton = null;
      renderer.domElement.style.cursor = "default";
    };
    renderer.domElement.addEventListener("pointerleave", onRendererPointerLeave);

    let fitDistance = computeFitDistance(camera.aspect);

    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      fitDistance = computeFitDistance(camera.aspect);
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

    const renderScreenCanvas = (time: number, elapsed: number, power: number) => {
      if (!screenContext) return;
      const w = screenCanvas.width;
      const h = screenCanvas.height;
      const ctx = screenContext;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#060f0a";
      ctx.fillRect(0, 0, w, h);
      canvasReadyRef.current = true;

      const glow = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.42, w * 0.72);
      glow.addColorStop(0, `rgba(112,255,170,${0.1 + power * 0.24})`);
      glow.addColorStop(0.55, `rgba(68,170,108,${0.04 + power * 0.08})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      ctx.font = "700 34px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (phaseRef.current === "locked") {
        if (elapsed < 1.6 && !introCompleteRef.current) {
          const wake = clamp01((elapsed - 0.8) / 0.8);
          const lineW = (0.08 + wake * 0.92) * w;
          ctx.fillStyle = `rgba(132,255,184,${0.9 - wake * 0.7})`;
          ctx.fillRect((w - lineW) * 0.5, h * 0.5 - 2, lineW, 4);
        } else if (Math.sin(time * 0.0028) > -0.2) {
          ctx.fillStyle = "rgba(184,255,215,0.88)";
          ctx.fillText("TOP SECRET CLEARANCE REQUIRED", w * 0.5, h * 0.5);
        }
      } else if (phaseRef.current === "flash") {
        const authFlashElapsed =
          authFlashStartMsRef.current === null ? 0 : Math.max(0, time - authFlashStartMsRef.current);
        const showLockedPulse = authFlashElapsed < 360 ? Math.floor(authFlashElapsed / 120) % 2 === 0 : false;
        const acceptedAlpha = clamp01((authFlashElapsed - 220) / 240);
        ctx.fillStyle = "rgba(160,255,199,0.92)";
        ctx.fillRect(0, h * 0.5 - 1.5, w, 3);
        if (showLockedPulse) {
          ctx.fillStyle = "rgba(184,255,215,0.82)";
          ctx.fillText("TOP SECRET CLEARANCE REQUIRED", w * 0.5, h * 0.46);
        }
        ctx.fillStyle = `rgba(186,255,219,${0.64 + acceptedAlpha * 0.34})`;
        ctx.fillText("CLEARANCE ACCEPTED", w * 0.5, h * 0.56);
      } else {
        ctx.textAlign = "left";
        ctx.font = "500 24px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = "rgba(186,255,216,0.86)";
        let y = 52;
        const bootLines = BOOT_LINES.slice(0, typedCountRef.current);
        bootLines.forEach((line) => {
          ctx.fillStyle = "rgba(153,216,179,0.5)";
          ctx.fillText("$", 24, y);
          ctx.fillStyle = "rgba(186,255,216,0.84)";
          ctx.fillText(line, 52, y);
          y += 34;
        });

        if (phaseRef.current === "dossier") {
          y += 18;
          const scroll = canvasScrollRef.current * 0.52;
          let cursor = y - scroll;
          const sections = sanitizedSectionsRef.current;
          sections.forEach((section) => {
            if (cursor > -120 && cursor < h + 60) {
              ctx.fillStyle = "rgba(161,236,196,0.64)";
              ctx.font = "600 16px ui-monospace, SFMono-Regular, Menlo, monospace";
              ctx.fillText(section.heading, 24, cursor);
            }
            cursor += 28;
            ctx.font = "500 22px ui-monospace, SFMono-Regular, Menlo, monospace";
            section.body.forEach((line) => {
              if (cursor > -80 && cursor < h + 80) {
                ctx.fillStyle = "rgba(183,255,213,0.82)";
                ctx.fillText(line, 24, cursor);
              }
              cursor += 30;
            });
            cursor += 22;
          });
          canvasMaxScrollRef.current = Math.max(0, cursor - h + 70);
        }
      }

      ctx.fillStyle = "rgba(192,255,220,0.038)";
      for (let y = 0; y < h; y += 3) {
        ctx.fillRect(0, y, w, 1);
      }

      const edge = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.28, w * 0.5, h * 0.5, w * 0.75);
      edge.addColorStop(0.7, "rgba(0,0,0,0)");
      edge.addColorStop(1, "rgba(0,0,0,0.42)");
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, w, h);
      if (!canvasPaintedRef.current) {
        const sample = ctx.getImageData((w * 0.5) | 0, (h * 0.5) | 0, 1, 1).data;
        canvasPaintedRef.current = sample[3] > 0 && sample[0] + sample[1] + sample[2] > 0;
      }

      screenTexture.needsUpdate = true;
    };

    let animationFrame = 0;
    let previousTime = performance.now();
    const startedAt = previousTime;
    const zoomScreenCam = new THREE.Vector3();
    const zoomSignedOffset = new THREE.Vector3();

    const renderFrame = (time: number) => {
      const dt = Math.min(0.05, (time - previousTime) / 1000);
      previousTime = time;

      const elapsed = (time - startedAt) / 1000;
      const introDuration = reducedMotionRef.current ? 0.9 : 3.6;
      const introNorm = introCompleteRef.current ? 1 : clamp01(elapsed / introDuration);
      const phaseB = reducedMotionRef.current ? 1 : clamp01((elapsed - 1.6) / 2.0);
      const phaseC = reducedMotionRef.current ? 1 : clamp01((elapsed - 2.2) / 1.4);
      const wakeNorm = reducedMotionRef.current ? 1 : clamp01((elapsed - 0.7) / 0.9);
      const blackoutOpacity = introCompleteRef.current ? 0 : elapsed < 0.7 ? 1 : clamp01(1 - (elapsed - 0.7) / 0.9);
      if (blackoutRef.current) {
        blackoutRef.current.style.opacity = `${blackoutOpacity}`;
      }
      if (!introCompleteRef.current && introNorm >= 1) {
        introCompleteRef.current = true;
        window.setTimeout(() => setIntroComplete(true), 0);
      }

      const aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
      const aspectT = clamp01((aspect - 1.18) / 0.42);
      const targetScale = THREE.MathUtils.lerp(0.88, 1.0, aspect >= 1.6 ? 1 : aspectT);
      stationRoot.scale.setScalar(targetScale);

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

      const keyLightBoost = authedState ? 1.16 : 1;
      key.intensity = THREE.MathUtils.lerp(key.intensity, 1.74 * keyLightBoost, 1 - Math.exp(-8 * dt));
      fill.intensity = THREE.MathUtils.lerp(fill.intensity, authedState ? 0.78 : 0.68, 1 - Math.exp(-6 * dt));
      rim.intensity = THREE.MathUtils.lerp(rim.intensity, authedState ? 0.44 : 0.36, 1 - Math.exp(-6 * dt));

      const screenBloomBoost = phaseRef.current === "flash" ? 0.24 : phaseRef.current === "boot" ? 0.14 : 0.04;
      renderer.toneMappingExposure = THREE.MathUtils.lerp(
        renderer.toneMappingExposure,
        (0.98 + introNorm * 0.3 + screenBloomBoost) * (authedState ? 1.1 : 1),
        1 - Math.exp(-6 * dt)
      );

      const isScreenFocused = mode === "zooming" || mode === "screen";
      const parallaxYawTarget = 0;
      const parallaxPitchTarget = 0;
      const introYaw = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(-25, 0, easeOutCubic(phaseB)));
      const introPitch = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(6, 0, easeOutCubic(phaseB)));
      if (isHeroMode) {
        stationRoot.rotation.y = THREE.MathUtils.lerp(
          stationRoot.rotation.y,
          introYaw + (introCompleteRef.current ? parallaxYawTarget : 0),
          1 - Math.exp(-7 * dt)
        );
        stationRoot.rotation.x = THREE.MathUtils.lerp(
          stationRoot.rotation.x,
          introPitch + (introCompleteRef.current ? parallaxPitchTarget : 0),
          1 - Math.exp(-7 * dt)
        );
      }

      const finalFov = 26.8;
      if (isHeroMode) {
        fitDistance = computeFitDistance(aspect);
        const zoomIn = easeOutCubic(phaseC);
        const framingDistance = fitDistance * THREE.MathUtils.lerp(2.1, 1.05, zoomIn);
        const lowAspectBackoff = aspect < 1.6 ? THREE.MathUtils.lerp(0.44, 0.12, aspectT) : 0;
        const heroCam = new THREE.Vector3(cameraBase.x, cameraBase.y + 0.12, framingDistance + lowAspectBackoff);
        const heroLook = new THREE.Vector3(fitCenter.x, fitCenter.y + 0.12, fitCenter.z + 0.22);
        camera.position.copy(heroCam);
        camera.lookAt(heroLook);
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
        camera.position.copy(zoomScreenCam);
        zoomSignedOffset.copy(camera.position).sub(zoomScreenCenterWorldRef.current);
        if (zoomSignedOffset.dot(zoomScreenNormalWorldRef.current) < 0.45) {
          camera.position.copy(zoomScreenCenterWorldRef.current).addScaledVector(zoomScreenNormalWorldRef.current, 0.45);
        }
        camera.lookAt(zoomLockedLookAtWorldRef.current);
        camera.fov = THREE.MathUtils.lerp(33, finalFov, push);
        if (zoomProgress >= 1) {
          zoomProgress = 1;
          zoomProgressRef.current = 1;
          zoomStartMsRef.current = null;
          viewModeRef.current = "screen";
          window.setTimeout(() => setViewMode("screen"), 0);
        }
      } else {
        if (!zoomTargetLockedRef.current) {
          lockZoomTarget();
        }
        zoomProgress = 1;
        zoomProgressRef.current = 1;
        camera.position.copy(zoomLockedCamPosWorldRef.current);
        zoomSignedOffset.copy(camera.position).sub(zoomScreenCenterWorldRef.current);
        if (zoomSignedOffset.dot(zoomScreenNormalWorldRef.current) < 0.45) {
          camera.position.copy(zoomScreenCenterWorldRef.current).addScaledVector(zoomScreenNormalWorldRef.current, 0.45);
        }
        camera.lookAt(zoomLockedLookAtWorldRef.current);
        camera.fov = finalFov;
      }
      camera.updateProjectionMatrix();
      const push = easeOutCubic(zoomProgress);
      if (peripheralRef.current) peripheralRef.current.style.opacity = `${1 - push * 0.72}`;
      const takeover = isHeroMode ? 0 : smoothStep(0.55, 1, zoomProgress);

      const leverTop = 0.54;
      const leverBottom = -0.52;
      const leverProgress = easeOutCubic(progress);
      const leverWobble = (1 - leverProgress) * 0.012 * (reducedMotionRef.current ? 0 : Math.sin(time * 0.012));
      const leverY = THREE.MathUtils.lerp(leverTop, leverBottom, leverProgress) + leverWobble;
      leverHandle.position.set(0.16, leverY, 0.15);
      leverHandle.rotation.set(0, 0, THREE.MathUtils.lerp(0.08, -0.18, leverProgress));
      const stemLength = Math.max(0.08, leverTop - leverY + 0.14);
      leverStem.scale.set(1, stemLength / 0.6, 1);
      leverStem.position.y = leverY + stemLength * 0.5 - 0.02;

      const scanTravel = authedState
        ? ((time - startedAt) * 0.0038) % 1
        : clamp01(progress * 0.9 + (reducedMotionRef.current ? 0 : 0.02 * Math.sin(time * 0.007)));
      ledScanner.position.y = 0.54 - scanTravel * 1.06;
      ledMaterial.emissiveIntensity = authedState ? 2.1 : 0.6 + progress * 1.25;
      (ledScanner.material as THREE.MeshStandardMaterial).emissiveIntensity = authedState ? 2.6 : 1.2;

      const lockedPower = introCompleteRef.current ? 0.62 : 0.06 + wakeNorm * 0.52;
      const power = phaseRef.current === "locked" ? lockedPower : phaseRef.current === "flash" ? 0.92 : phaseRef.current === "boot" ? 0.82 : 0.98;
      const flicker = reducedMotionRef.current ? 1 : 0.985 + Math.sin(time * 0.028) * 0.015;
      screenMaterial.opacity = 0.28 + power * 0.58 * flicker;
      screenMaterial.color.setHex(0xffffff);
      const screenFocusBoost = isScreenFocused ? 1.3 : 1;
      const glowFocusBoost = isScreenFocused ? 1.4 : 1;
      (screen.material as THREE.MeshStandardMaterial).emissiveIntensity = (2 + power * 0.6) * screenFocusBoost;
      keyCapMaterial.emissiveIntensity = 0.1 + power * 0.26;
      screenGlow.intensity = (0.18 + power * 0.7) * glowFocusBoost;
      glassMaterial.opacity = isScreenFocused ? 0.16 : 0.2;
      glassMaterial.clearcoat = isScreenFocused ? 0.52 : 0.38;
      glassMaterial.clearcoatRoughness = isScreenFocused ? 0.18 : 0.22;
      powerLedMaterial.emissiveIntensity = 0.22 + power * (authedState ? 1.42 : 1.08);
      renderScreenCanvas(time, elapsed, power);

      if (screenOverlayRef.current) {
        const style = screenOverlayRef.current.style;
        if (mode === "screen") {
          const overlayWidth = Math.min(mount.clientWidth * 0.92, 1200);
          const overlayHeight = Math.min(mount.clientHeight * 0.86, 820);
          style.left = "50%";
          style.top = "50%";
          style.width = `${overlayWidth}px`;
          style.height = `${overlayHeight}px`;
          style.transform = "translate(-50%, -50%)";
          style.opacity = "1";
          style.pointerEvents = "auto";
          style.filter = "saturate(1.24) contrast(1.18) brightness(1.04)";
        } else {
          const p1 = projectToDom(screenTopLeft);
          const p2 = projectToDom(screenTopRight);
          const p3 = projectToDom(screenBottomLeft);
          const p4 = projectToDom(screenBottomRight);
          const left = Math.min(p1.x, p2.x, p3.x, p4.x);
          const top = Math.min(p1.y, p2.y, p3.y, p4.y);
          const right = Math.max(p1.x, p2.x, p3.x, p4.x);
          const bottom = Math.max(p1.y, p2.y, p3.y, p4.y);
          const visible = p1.visible || p2.visible || p3.visible || p4.visible;
          style.left = `${left}px`;
          style.top = `${top}px`;
          style.width = `${Math.max(40, right - left)}px`;
          style.height = `${Math.max(40, bottom - top)}px`;
          style.transform = "none";
          style.pointerEvents = "none";
          const projectedBase = mode === "zooming" ? Math.max(0.9, 1 - takeover * 0.1) : (visible ? 1 : 0.92);
          style.opacity = `${projectedBase}`;
          style.filter = `saturate(${1 + (1 - takeover) * 0.18}) contrast(${1.08 + (1 - takeover) * 0.08})`;
        }
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
  }, [playAuthBeep, skipIntro]);

  const triggerAuth = useCallback(() => {
    if (authedRef.current) return;
    authedRef.current = true;
    authFlashStartMsRef.current = performance.now();
    setAuthed(true);
    playAuthBeep();
    startScreenZoom();
    animate(badgeY, dragMaxRef.current * 0.95, {
      type: "spring",
      stiffness: 240,
      damping: 26,
      mass: 0.8,
    });
  }, [badgeY, playAuthBeep, startScreenZoom]);

  useEffect(() => {
    triggerAuthRef.current = triggerAuth;
  }, [triggerAuth]);

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

  const typedBootLines = BOOT_LINES.slice(0, typedCount);
  const screenToneClass =
    phase === "flash" ? "chv-crt-boot-flash" : phase === "boot" ? "chv-crt-boot-warm" : "chv-crt-stable";
  const fullscreenMode = viewMode === "screen";

  return (
    <div
      ref={rootRef}
      className="relative h-[100svh] w-full overflow-hidden"
      onPointerDown={skipIntro}
    >
      <div ref={mountRef} className="absolute inset-0" />
      <div
        ref={peripheralRef}
        className="pointer-events-none absolute inset-0 z-[3] opacity-100"
        style={{
          background:
            "radial-gradient(130% 94% at 50% 46%, rgba(10,24,18,0) 58%, rgba(0,0,0,0.38) 100%)",
          mixBlendMode: "normal",
        }}
      />
      <div ref={blackoutRef} className="pointer-events-none absolute inset-0 z-[60] bg-black opacity-100" />

      <div
        ref={screenOverlayRef}
        className={`absolute z-[35] overflow-hidden transition-[filter,opacity] duration-200 ${screenToneClass}`}
        style={{ opacity: 0, pointerEvents: "none" }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(128%_94%_at_50%_54%,rgba(38,105,70,0.22),rgba(0,0,0,0.86)_74%)]" />
        <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(142,255,190,0.042)_0_1px,rgba(0,0,0,0.0)_1px_3px)]" />
        <div className="absolute inset-0 bg-[radial-gradient(82%_68%_at_50%_50%,rgba(0,0,0,0)_60%,rgba(0,0,0,0.56)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(118%_88%_at_50%_120%,rgba(0,0,0,0.44),rgba(0,0,0,0)_45%)]" />

        <div className="relative h-full w-full p-2 sm:p-4">
          <div
            className={`chv-crt-screen-clip chv-crt-warp chv-crt-premium-glow relative h-full w-full border border-emerald-200/14 bg-[#051108]/92 shadow-[0_0_80px_rgba(62,171,112,0.24)] ${
              fullscreenMode ? "scale-[1.015] sm:scale-[1.02]" : "scale-100"
            }`}
            style={{ transform: "perspective(1600px) scale(1.012,1.02)" }}
          >
            <div className="pointer-events-none absolute inset-0 chv-crt-reflect" />
            <div className="pointer-events-none absolute inset-0 chv-crt-inner-vignette" />
            <div className="pointer-events-none absolute inset-0 chv-crt-scanlines" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(72%_60%_at_50%_44%,rgba(129,255,183,0.14),rgba(0,0,0,0)_72%)] mix-blend-screen" />

            <div
              ref={dossierScrollRef}
              className="relative h-full overflow-auto px-4 py-4 font-mono text-[12px] leading-[1.45] tracking-[0.01em] text-emerald-100/84 sm:px-6 sm:py-5 sm:text-[14px] lg:text-[15px] chv-hide-scrollbar chv-crt-phosphor"
            >
              {phase === "locked" && introComplete ? (
                <div className="flex h-full items-center justify-center text-center text-[0.88rem] tracking-[0.28em] text-emerald-100/86 sm:text-[1rem]">
                  <span className="chv-clearance-blink">TOP SECRET CLEARANCE REQUIRED</span>
                </div>
              ) : null}

              {phase === "flash" ? (
                <div className="relative flex h-full flex-col items-center justify-center gap-5 text-center text-[0.86rem] tracking-[0.22em] text-emerald-100/90 sm:text-[0.96rem]">
                  <motion.div
                    className="h-[2px] w-full rounded-full bg-emerald-300/90 shadow-[0_0_24px_rgba(95,255,159,0.62)]"
                    initial={{ scaleX: 0.06, opacity: 0.88 }}
                    animate={{ scaleX: 1, opacity: 0.52 }}
                    transition={{ duration: reducedMotion ? 0.01 : 0.34, ease: "easeOut" }}
                  />
                  <span className="chv-clearance-blink">TOP SECRET CLEARANCE REQUIRED</span>
                  <span className="text-emerald-100/78">CLEARANCE ACCEPTED</span>
                </div>
              ) : null}

              {phase === "boot" || phase === "dossier" ? (
                <div className="space-y-2.5">
                  {typedBootLines.map((line) => (
                    <div key={line} className="text-emerald-100/82">
                      <span className="text-emerald-200/48">$</span> {line}
                    </div>
                  ))}
                  {typedBootLines.length < BOOT_LINES.length ? (
                    <div className="text-emerald-100/68">
                      <span className="text-emerald-200/42">$</span>
                      <span className="ml-2 inline-block h-[0.98rem] w-[0.44rem] animate-pulse bg-emerald-200/56 align-middle" />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {phase === "dossier" ? (
                <div className="mt-5 border-t border-emerald-200/18 pt-5">
                  {sanitizedSections.map((section) => (
                    <section key={section.heading} className="mb-6">
                      <h3 className="text-[11px] tracking-[0.32em] text-emerald-100/62 sm:text-[12px]">{section.heading}</h3>
                      <div className="mt-2.5 space-y-2 text-emerald-100/82">
                        {section.body.length > 0 ? (
                          section.body.map((line, index) => <div key={`${section.heading}-${index}`}>{line}</div>)
                        ) : (
                          <div>PENDING CLEARANCE ENTRY</div>
                        )}
                      </div>
                    </section>
                  ))}
                  <div className="pt-1 text-[11px] tracking-[0.2em] text-emerald-200/52 sm:text-[12px]">SESSION ACTIVE // EOF</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div ref={badgeLaneRef} className="pointer-events-none absolute z-30">
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


