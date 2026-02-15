"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import { ReturnButton } from "@/components/ReturnButton";
import { contactInfo } from "@/lib/portalData";

type Phase =
  | "intro_black"
  | "intro_glow"
  | "intro_reveal_lens"
  | "intro_reveal_body"
  | "ready"
  | "flash"
  | "eject"
  | "connected";

type CoreLabel = "Email" | "TikTok" | "Instagram" | "YouTube";

type ContactRow = {
  label: CoreLabel;
  value: string;
  href?: string;
};

const TIMELINE = {
  blackEndMs: 500,
  glowEndMs: 3500,
  lensEndMs: 4500,
  revealEndMs: 6500,
  tabEndMs: 7000,
  flashStartMs: 7060,
  cardStartMs: 7800,
  endMs: 8600,
} as const;

const FLASH = {
  burstMs: 110,
  decayMs: 320,
} as const;

const CORE_LABELS: CoreLabel[] = ["Email", "TikTok", "Instagram", "YouTube"];

const FALLBACK_VALUE: Record<CoreLabel, string> = {
  Email: "Available on request",
  TikTok: "Transmission queued",
  Instagram: "Link pending",
  YouTube: "Link pending",
};

const IMMERSIVE_COPY = new Set(
  Object.values(FALLBACK_VALUE).map((value) => value.toLowerCase())
);

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(value: number) {
  const t = clamp01(value);
  return t * t * t;
}

function roundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius = 0.16,
  segments = 8
) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const r = Math.min(radius, halfWidth - 0.01, halfDepth - 0.01);

  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + r, -halfDepth);
  shape.lineTo(halfWidth - r, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + r);
  shape.lineTo(halfWidth, halfDepth - r);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - r, halfDepth);
  shape.lineTo(-halfWidth + r, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - r);
  shape.lineTo(-halfWidth, -halfDepth + r);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + r, -halfDepth);

  const bevel = Math.min(r * 0.6, Math.min(width, height, depth) * 0.18);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: Math.max(4, Math.round(segments * 0.5)),
    curveSegments: Math.max(6, segments),
  });

  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0, -height * 0.5, 0);
  geometry.computeVertexNormals();

  return geometry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
  return "";
}

function normalizeLabel(value: string): CoreLabel | null {
  const lower = value.toLowerCase().trim();
  if (!lower) return null;
  if (lower.includes("mail")) return "Email";
  if (lower.includes("tiktok")) return "TikTok";
  if (lower.includes("instagram") || lower.includes("insta")) return "Instagram";
  if (lower.includes("youtube") || lower === "yt") return "YouTube";
  return null;
}

function isPlaceholderLike(label: CoreLabel, value: string) {
  const lower = value.toLowerCase().trim();
  if (!lower) return true;

  if (
    lower === "you@example.com" ||
    lower === "@yourhandle" ||
    lower === "yourhandle" ||
    lower === "placeholder" ||
    lower === "replace me" ||
    lower === "coming soon" ||
    lower === "tbd" ||
    lower === "n/a"
  ) {
    return true;
  }

  if (lower.includes("yourhandle") || lower.includes("replace") || lower.includes("placeholder")) {
    return true;
  }

  if (label === "Email") {
    if (/^[^\s@]+@example\.com$/i.test(lower)) return true;
    if (lower.startsWith("you@")) return true;
  }

  if (label !== "Email" && /^@?your[\w-]*$/i.test(lower)) {
    return true;
  }

  return false;
}

function isImmersiveFallback(value: string) {
  return IMMERSIVE_COPY.has(value.toLowerCase().trim());
}

function sanitizeValue(label: CoreLabel, value: string) {
  const trimmed = value.trim();
  if (isPlaceholderLike(label, trimmed)) return FALLBACK_VALUE[label];

  if (label === "Email") return trimmed.replace(/^mailto:/i, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  return trimmed.startsWith("@") ? trimmed : `@${trimmed.replace(/^@+/, "")}`;
}

function normalizeHandle(value: string) {
  return value
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^tiktok\.com\/@/i, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^youtube\.com\/@/i, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .trim();
}

function inferHref(label: CoreLabel, value: string): string | undefined {
  const cleaned = value.trim();
  if (!cleaned || isImmersiveFallback(cleaned)) return undefined;

  if (/^mailto:/i.test(cleaned) || /^https?:\/\//i.test(cleaned)) return cleaned;

  if (label === "Email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(cleaned)) {
    return `mailto:${cleaned}`;
  }

  if (label === "TikTok") return `https://www.tiktok.com/@${normalizeHandle(cleaned)}`;
  if (label === "Instagram") return `https://www.instagram.com/${normalizeHandle(cleaned)}`;
  if (label === "YouTube") return `https://www.youtube.com/@${normalizeHandle(cleaned)}`;

  return undefined;
}

function buildContactRows(source: unknown): ContactRow[] {
  const rowsByLabel = new Map<CoreLabel, ContactRow>();
  const rawItems: unknown[] = [];

  if (Array.isArray(source)) {
    rawItems.push(...source);
  } else if (isRecord(source)) {
    if (Array.isArray(source.items)) {
      rawItems.push(...source.items);
    } else {
      for (const [label, value] of Object.entries(source)) {
        rawItems.push({ label, value });
      }
    }
  }

  for (const item of rawItems) {
    if (!isRecord(item)) continue;

    const label = normalizeLabel(readText(item.label ?? item.platform ?? item.name ?? item.type));
    if (!label) continue;

    const sourceValue = readText(item.value ?? item.handle ?? item.username ?? item.href ?? item.url);
    const value = sanitizeValue(label, sourceValue);

    const explicitHref = readText(item.href ?? item.url);
    const href = explicitHref || inferHref(label, value);

    rowsByLabel.set(label, {
      label,
      value,
      href: isImmersiveFallback(value) ? undefined : href,
    });
  }

  return CORE_LABELS.map((label) => {
    const row = rowsByLabel.get(label);
    if (row) return row;
    return { label, value: FALLBACK_VALUE[label] };
  });
}

function setOpacity(material: THREE.Material, value: number) {
  const typed = material as THREE.Material & {
    opacity: number;
    transparent: boolean;
    needsUpdate: boolean;
  };

  typed.opacity = clamp01(value);
  typed.transparent = typed.opacity < 0.999;
  typed.needsUpdate = true;
}

function resolvePhase(elapsed: number): Phase {
  const flashEnd = TIMELINE.flashStartMs + FLASH.burstMs + FLASH.decayMs;

  if (elapsed < TIMELINE.blackEndMs) return "intro_black";
  if (elapsed < TIMELINE.glowEndMs) return "intro_glow";
  if (elapsed < TIMELINE.lensEndMs) return "intro_reveal_lens";
  if (elapsed < TIMELINE.revealEndMs) return "intro_reveal_body";
  if (elapsed < TIMELINE.flashStartMs) return "ready";
  if (elapsed < flashEnd) return "flash";
  if (elapsed < TIMELINE.cardStartMs) return "eject";
  return "connected";
}

export default function PolaroidContactHeroCanonical() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneLayerRef = useRef<HTMLDivElement | null>(null);
  const blackOverlayRef = useRef<HTMLDivElement | null>(null);
  const lensFieldRef = useRef<HTMLDivElement | null>(null);
  const lensRingsRef = useRef<HTMLDivElement | null>(null);
  const lensOuterRingRef = useRef<HTMLDivElement | null>(null);
  const lensBloomRef = useRef<HTMLDivElement | null>(null);
  const flashOverlayRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<Phase>("intro_black");
  const startMsRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("intro_black");

  const rows = useMemo(() => buildContactRows(contactInfo), []);

  useEffect(() => {
    const mount = mountRef.current;
    const sceneLayer = sceneLayerRef.current;
    const blackOverlay = blackOverlayRef.current;
    const lensField = lensFieldRef.current;
    const lensRings = lensRingsRef.current;
    const lensOuterRing = lensOuterRingRef.current;
    const lensBloom = lensBloomRef.current;
    const flashOverlay = flashOverlayRef.current;

    if (
      !mount ||
      !sceneLayer ||
      !blackOverlay ||
      !lensField ||
      !lensRings ||
      !lensOuterRing ||
      !lensBloom ||
      !flashOverlay
    ) {
      return;
    }

    startMsRef.current = performance.now();
    phaseRef.current = "intro_black";

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    mount.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0.14, 6.85);
    camera.lookAt(0, 0.06, 0);

    const resize = () => {
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();

    const keyLight = new THREE.DirectionalLight(0xffedd7, 0.95);
    keyLight.position.set(-2.8, 3.0, 3.2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xccdcff, 0.16);
    fillLight.position.set(2.4, 1.2, 1.7);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xb8d0ff, 0.58);
    rimLight.position.set(2.2, 2.4, -3.9);
    scene.add(rimLight);

    const flashLight = new THREE.PointLight(0xffffff, 0, 10, 1.65);
    flashLight.position.set(0.05, 0.14, 1.48);
    scene.add(flashLight);

    const pedestalMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#151a24"),
      roughness: 0.78,
      metalness: 0.16,
    });
    const pedestalTopMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#1f2633"),
      roughness: 0.74,
      metalness: 0.18,
    });

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#ede4d6"),
      roughness: 0.86,
      metalness: 0.03,
    });
    const bodyFaceMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f3ebe0"),
      roughness: 0.82,
      metalness: 0.02,
    });
    const topPlateMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#161b24"),
      roughness: 0.62,
      metalness: 0.24,
    });
    const darkMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0f131a"),
      roughness: 0.84,
      metalness: 0.16,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#c5ccd7"),
      roughness: 0.36,
      metalness: 0.72,
    });

    const lensBarrelMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#141923"),
      roughness: 0.56,
      metalness: 0.36,
    });
    const lensIvoryMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#f1e9dc"),
      roughness: 0.72,
      metalness: 0.03,
    });
    const lensRingMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#8a97ab"),
      roughness: 0.32,
      metalness: 0.78,
    });
    const lensCoreMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#05080f"),
      roughness: 0.44,
      metalness: 0.16,
      emissive: new THREE.Color("#294f7f"),
      emissiveIntensity: 0.06,
    });
    const lensGlassMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#8cb0db"),
      roughness: 0.03,
      metalness: 0.06,
      transmission: 1,
      thickness: 0.1,
      ior: 1.45,
      transparent: true,
      opacity: 0.52,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });

    const photoMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#fbf6eb"),
      roughness: 0.58,
      metalness: 0.02,
      clearcoat: 0.1,
      clearcoatRoughness: 0.5,
    });
    const imageMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#0b111b"),
      roughness: 0.93,
      metalness: 0,
    });

    const root = new THREE.Group();
    scene.add(root);

    const pedestalGroup = new THREE.Group();
    root.add(pedestalGroup);

    const pedestalBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.55, 0.52, 72), pedestalMaterial);
    pedestalBase.position.set(0, -2.08, 0);
    pedestalGroup.add(pedestalBase);

    const pedestalTop = new THREE.Mesh(new THREE.CylinderGeometry(1.92, 2.1, 0.12, 72), pedestalTopMaterial);
    pedestalTop.position.set(0, -1.73, 0);
    pedestalGroup.add(pedestalTop);

    const cameraGroup = new THREE.Group();
    cameraGroup.position.set(0, -0.08, 0.1);
    root.add(cameraGroup);

    const body = new THREE.Mesh(roundedBoxGeometry(4.38, 2.84, 1.92, 0.28, 10), bodyMaterial);
    cameraGroup.add(body);

    const frontPanel = new THREE.Mesh(roundedBoxGeometry(4.04, 2.32, 0.5, 0.16, 8), bodyFaceMaterial);
    frontPanel.position.set(0, -0.08, 0.82);
    cameraGroup.add(frontPanel);

    const topLeft = new THREE.Mesh(roundedBoxGeometry(1.28, 0.24, 1.3, 0.09, 8), topPlateMaterial);
    topLeft.position.set(-1.1, 1.3, 0.21);
    cameraGroup.add(topLeft);

    const topRight = new THREE.Mesh(roundedBoxGeometry(1.28, 0.24, 1.3, 0.09, 8), topPlateMaterial);
    topRight.position.set(1.1, 1.3, 0.21);
    cameraGroup.add(topRight);

    const topRear = new THREE.Mesh(roundedBoxGeometry(1.92, 0.2, 0.48, 0.08, 8), topPlateMaterial);
    topRear.position.set(0, 1.28, -0.22);
    cameraGroup.add(topRear);

    const slotCavity = new THREE.Mesh(roundedBoxGeometry(1.54, 0.22, 0.34, 0.05, 8), darkMaterial);
    slotCavity.position.set(0, 1.21, 0.33);
    cameraGroup.add(slotCavity);

    const slotLipFront = new THREE.Mesh(roundedBoxGeometry(1.58, 0.06, 0.08, 0.03, 8), topPlateMaterial);
    slotLipFront.position.set(0, 1.24, 0.53);
    slotLipFront.renderOrder = 8;
    cameraGroup.add(slotLipFront);

    const slotLipBack = new THREE.Mesh(roundedBoxGeometry(1.58, 0.06, 0.08, 0.03, 8), topPlateMaterial);
    slotLipBack.position.set(0, 1.24, 0.14);
    slotLipBack.renderOrder = 8;
    cameraGroup.add(slotLipBack);

    const shutterButton = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.11, 28), metalMaterial);
    shutterButton.rotation.x = Math.PI * 0.5;
    shutterButton.position.set(1.44, 1.37, 0.52);
    cameraGroup.add(shutterButton);

    const finder = new THREE.Mesh(roundedBoxGeometry(0.72, 0.32, 0.16, 0.05, 6), darkMaterial);
    finder.position.set(-1.38, 0.75, 1.03);
    cameraGroup.add(finder);

    const lensGroup = new THREE.Group();
    lensGroup.position.set(0.03, 0.15, 1.08);
    cameraGroup.add(lensGroup);

    const lensIvory = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.13, 96), lensIvoryMaterial);
    lensIvory.rotation.x = Math.PI * 0.5;
    lensIvory.position.z = 0.01;
    lensGroup.add(lensIvory);

    const lensBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, 0.44, 96), lensBarrelMaterial);
    lensBarrel.rotation.x = Math.PI * 0.5;
    lensGroup.add(lensBarrel);

    const lensRing = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 0.08, 96), lensRingMaterial);
    lensRing.rotation.x = Math.PI * 0.5;
    lensRing.position.z = 0.22;
    lensGroup.add(lensRing);

    const lensCore = new THREE.Mesh(new THREE.CircleGeometry(0.49, 96), lensCoreMaterial);
    lensCore.position.z = 0.23;
    lensGroup.add(lensCore);

    const lensGlass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 96), lensGlassMaterial);
    lensGlass.position.z = 0.26;
    lensGroup.add(lensGlass);

    const lensSpec = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 18, 18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color("#d7e6ff"), transparent: true, opacity: 0.34 })
    );
    lensSpec.position.set(0.17, 0.16, 0.3);
    lensGroup.add(lensSpec);

    const photoWidth = 1.76;
    const photoHeight = 2.2;

    const photo = new THREE.Mesh(new THREE.BoxGeometry(photoWidth, photoHeight, 0.03), photoMaterial);
    const photoStartY = 0.44;
    const photoEndY = 1.84;
    photo.position.set(0, photoStartY, 0.34);
    photo.renderOrder = 6;
    photo.visible = false;
    cameraGroup.add(photo);

    const photoWindow = new THREE.Mesh(new THREE.PlaneGeometry(photoWidth * 0.82, photoHeight * 0.58), imageMaterial);
    photoWindow.position.set(0, 0.22, 0.017);
    photo.add(photoWindow);

    const photoShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.64, 0.82),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })
    );
    photoShadow.rotation.x = -Math.PI * 0.5;
    photoShadow.position.set(0, 1.195, 0.34);
    photoShadow.renderOrder = 7;
    cameraGroup.add(photoShadow);

    const bodyMaterials = [bodyMaterial, bodyFaceMaterial, topPlateMaterial, darkMaterial, metalMaterial];
    const lensMaterials = [lensIvoryMaterial, lensBarrelMaterial, lensRingMaterial, lensCoreMaterial, lensGlassMaterial];
    const pedestalMaterials = [pedestalMaterial, pedestalTopMaterial];

    let rafId = 0;

    const flashEndMs = TIMELINE.flashStartMs + FLASH.burstMs + FLASH.decayMs;

    const animate = (now: number) => {
      const elapsed = Math.min(now - startMsRef.current, TIMELINE.endMs + 1000);
      const nextPhase = resolvePhase(elapsed);
      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }

      const glowProgress = smoothstep((elapsed - TIMELINE.blackEndMs) / (TIMELINE.glowEndMs - TIMELINE.blackEndMs));
      const lensProgress = smoothstep((elapsed - TIMELINE.glowEndMs) / (TIMELINE.lensEndMs - TIMELINE.glowEndMs));
      const revealProgress = smoothstep((elapsed - TIMELINE.lensEndMs) / (TIMELINE.revealEndMs - TIMELINE.lensEndMs));
      const tabProgress = smoothstep((elapsed - TIMELINE.revealEndMs) / (TIMELINE.tabEndMs - TIMELINE.revealEndMs));

      let flashStrength = 0;
      if (elapsed >= TIMELINE.flashStartMs && elapsed < flashEndMs) {
        const local = elapsed - TIMELINE.flashStartMs;
        if (local <= FLASH.burstMs) {
          flashStrength = clamp01(local / FLASH.burstMs);
        } else {
          flashStrength = clamp01(1 - (local - FLASH.burstMs) / FLASH.decayMs);
        }
      }

      let sceneOpacity = 0;
      let blackOpacity = 1;
      let lensFieldOpacity = 0;
      let lensRingsOpacity = 0;
      let lensOuterOpacity = 0;
      let lensOverlayScale = 1.16;
      let lensBloomOpacity = 0;
      let lensBloomScale = 0.9;

      let bodyAlpha = 0;
      let pedestalAlpha = 0;
      let lensAlpha = 0;
      let lensIvoryAlpha = 0;
      let fov = 13;
      let heroScale = 1.08;

      if (elapsed < TIMELINE.blackEndMs) {
        sceneOpacity = 0;
      } else if (elapsed < TIMELINE.glowEndMs) {
        sceneOpacity = 0.14 + glowProgress * 0.08;
        blackOpacity = 0;
        lensFieldOpacity = 0.84;
        lensRingsOpacity = 0.18 + glowProgress * 0.24;
        lensOverlayScale = 1.16 - glowProgress * 0.07;
        lensBloomOpacity = 0.14 + glowProgress * 0.15;
        lensBloomScale = 0.9 + glowProgress * 0.08;

        bodyAlpha = 0.04 + glowProgress * 0.06;
        pedestalAlpha = 0;
        lensAlpha = 0.26 + glowProgress * 0.2;
        lensIvoryAlpha = 0;
        fov = 13;
        heroScale = 1.08 - glowProgress * 0.02;
      } else if (elapsed < TIMELINE.lensEndMs) {
        sceneOpacity = 0.24 + lensProgress * 0.36;
        blackOpacity = 0;
        lensFieldOpacity = 0.86;
        lensRingsOpacity = 0.44 + lensProgress * 0.26;
        lensOuterOpacity = 0.14 + lensProgress * 0.7;
        lensOverlayScale = 1.09 - lensProgress * 0.04;
        lensBloomOpacity = 0.24 + lensProgress * 0.12;
        lensBloomScale = 0.98 + lensProgress * 0.08;

        bodyAlpha = 0.09 + lensProgress * 0.12;
        pedestalAlpha = 0.03 * lensProgress;
        lensAlpha = 0.58 + lensProgress * 0.42;
        lensIvoryAlpha = 0.24 + lensProgress * 0.76;
        fov = 12.2;
        heroScale = 1.06 - lensProgress * 0.02;
      } else if (elapsed < TIMELINE.revealEndMs) {
        sceneOpacity = 0.62 + revealProgress * 0.38;
        blackOpacity = 0;
        lensFieldOpacity = 0.84 * (1 - revealProgress);
        lensRingsOpacity = 0.62 * (1 - revealProgress);
        lensOuterOpacity = 0.82 * (1 - revealProgress);
        lensOverlayScale = 1.05 + revealProgress * 0.52;
        lensBloomOpacity = 0.34 * (1 - revealProgress);
        lensBloomScale = 1.08 + revealProgress * 0.26;

        bodyAlpha = 0.2 + revealProgress * 0.8;
        pedestalAlpha = 0.2 + revealProgress * 0.8;
        lensAlpha = 1;
        lensIvoryAlpha = 1;
        fov = 13 + easeOutCubic(revealProgress) * 19;
        heroScale = 1.04 - revealProgress * 0.04;
      } else {
        sceneOpacity = 1;
        blackOpacity = 0;
        lensFieldOpacity = 0;
        lensRingsOpacity = 0;
        lensOuterOpacity = 0;
        lensBloomOpacity = 0;

        bodyAlpha = 1;
        pedestalAlpha = 1;
        lensAlpha = 1;
        lensIvoryAlpha = 1;
        fov = 32;
        heroScale = 1;
      }

      let photoProgress = 0;
      if (elapsed < TIMELINE.revealEndMs) {
        photoProgress = 0;
      } else if (elapsed < TIMELINE.tabEndMs) {
        photoProgress = 0.16 * tabProgress;
      } else if (elapsed < TIMELINE.cardStartMs) {
        const ejectT = clamp01((elapsed - TIMELINE.tabEndMs) / (TIMELINE.cardStartMs - TIMELINE.tabEndMs));
        if (ejectT < 0.82) {
          photoProgress = 0.16 + 0.92 * easeInCubic(ejectT / 0.82);
        } else {
          photoProgress = THREE.MathUtils.lerp(1.08, 1, easeOutCubic((ejectT - 0.82) / 0.18));
        }
      } else {
        photoProgress = 1;
      }

      for (const material of bodyMaterials) setOpacity(material, bodyAlpha);
      for (const material of pedestalMaterials) setOpacity(material, pedestalAlpha);
      for (const material of lensMaterials) setOpacity(material, lensAlpha);
      setOpacity(lensIvoryMaterial, lensIvoryAlpha);

      lensCoreMaterial.emissiveIntensity = 0.06 + glowProgress * 0.2 + flashStrength * 1.15;
      (lensSpec.material as THREE.MeshBasicMaterial).opacity = 0.34 + glowProgress * 0.22 + flashStrength * 0.32;

      flashLight.intensity = flashStrength * 6.2;
      renderer.toneMappingExposure = 0.72 + flashStrength * 0.21;

      const showPhoto = elapsed >= TIMELINE.revealEndMs;
      photo.visible = showPhoto;
      photoWindow.visible = showPhoto;

      photo.position.y = THREE.MathUtils.lerp(photoStartY, photoEndY, photoProgress);
      photo.rotation.z = THREE.MathUtils.degToRad(-0.9 + Math.min(photoProgress, 1) * 1.2);
      photo.rotation.x = THREE.MathUtils.degToRad(-1.4 + Math.min(photoProgress, 1) * 1.1);

      const shadowMaterial = photoShadow.material as THREE.MeshBasicMaterial;
      shadowMaterial.opacity = showPhoto ? 0.08 + Math.min(photoProgress, 1) * 0.25 : 0;
      photoShadow.scale.set(0.88 + Math.min(photoProgress, 1) * 0.36, 1, 0.88 + Math.min(photoProgress, 1) * 0.22);

      camera.fov = fov;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0.06, 0);
      root.scale.setScalar(heroScale);

      sceneLayer.style.opacity = `${sceneOpacity}`;
      blackOverlay.style.opacity = `${blackOpacity}`;

      lensField.style.opacity = `${lensFieldOpacity}`;
      lensRings.style.opacity = `${lensRingsOpacity}`;
      lensOuterRing.style.opacity = `${lensOuterOpacity}`;
      lensField.style.transform = `translate(-50%, -50%) scale(${lensOverlayScale})`;
      lensRings.style.transform = `translate(-50%, -50%) scale(${lensOverlayScale * 1.02})`;
      lensOuterRing.style.transform = `translate(-50%, -50%) scale(${lensOverlayScale * 0.996})`;

      lensBloom.style.opacity = `${clamp01(lensBloomOpacity + flashStrength * 0.7)}`;
      lensBloom.style.transform = `translate(-50%, -50%) scale(${lensBloomScale + flashStrength * 0.22})`;

      flashOverlay.style.opacity = `${flashStrength * 0.9}`;

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    window.addEventListener("resize", resize);

    sceneLayer.style.opacity = "0";
    blackOverlay.style.opacity = "1";
    lensField.style.opacity = "0";
    lensRings.style.opacity = "0";
    lensOuterRing.style.opacity = "0";
    lensBloom.style.opacity = "0";
    flashOverlay.style.opacity = "0";

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);

      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();

      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;

        if (mesh.geometry) geometries.add(mesh.geometry);
        if (Array.isArray(mesh.material)) {
          for (const material of mesh.material) materials.add(material);
        } else if (mesh.material) {
          materials.add(mesh.material);
        }
      });

      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());

      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <ReturnButton label="Return to Chloeverse" />

      <div className="pointer-events-none absolute inset-0 bg-black" />
      <div
        className="pointer-events-none absolute inset-0 opacity-26"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 18% 24%, rgba(255,255,255,0.24), transparent 65%), radial-gradient(1px 1px at 75% 18%, rgba(255,255,255,0.18), transparent 65%), radial-gradient(1px 1px at 38% 71%, rgba(255,255,255,0.16), transparent 65%), radial-gradient(1px 1px at 68% 56%, rgba(255,255,255,0.14), transparent 65%), radial-gradient(1px 1px at 86% 78%, rgba(255,255,255,0.16), transparent 65%)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_56%_at_50%_7%,rgba(74,98,138,0.08),rgba(0,0,0,0)_42%,rgba(0,0,0,1)_100%)]" />
      <div className="pointer-events-none absolute inset-0 chv-vignette opacity-100" />
      <div className="pointer-events-none absolute inset-0 chv-filmgrain opacity-72" />

      <header className="pointer-events-none absolute left-6 top-7 z-40 max-w-sm md:left-10 md:top-10">
        <h1 className="text-2xl font-semibold tracking-tight text-white/92 md:text-4xl">CONTACT</h1>
        <p className="mt-2 text-xs text-white/52 md:text-sm">Private line. Quiet signal.</p>
      </header>

      <section className="absolute inset-0 z-20">
        <div ref={sceneLayerRef} className="h-full w-full opacity-0 transition-opacity duration-200">
          <div ref={mountRef} className="h-full w-full" />
        </div>
      </section>

      <div
        ref={blackOverlayRef}
        className="pointer-events-none absolute inset-0 z-30 bg-black"
        style={{ opacity: 1 }}
      />

      <div
        ref={lensFieldRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-31 h-[152vmax] w-[152vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at 63% 35%, rgba(220,238,255,0.2) 0.5%, rgba(220,238,255,0.04) 2.1%, rgba(10,14,22,0.92) 19%, rgba(2,3,7,0.98) 47%, rgba(0,0,0,1) 76%), radial-gradient(circle at 48% 50%, rgba(122,154,205,0.2) 0%, rgba(8,12,20,0.95) 36%, rgba(0,0,0,1) 76%)",
        }}
      />

      <div
        ref={lensRingsRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-32 h-[152vmax] w-[152vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          opacity: 0,
          background:
            "repeating-radial-gradient(circle at 50% 50%, rgba(188,212,245,0.18) 0%, rgba(188,212,245,0.18) 0.65%, rgba(75,102,145,0.0) 1.3%, rgba(75,102,145,0.0) 3.3%), radial-gradient(circle at 50% 50%, rgba(220,236,255,0.14) 0%, rgba(0,0,0,0) 54%)",
        }}
      />

      <div
        ref={lensOuterRingRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-33 h-[152vmax] w-[152vmax] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 11.8%, rgba(240,231,217,0.82) 13.3%, rgba(36,31,26,0.68) 16.6%, rgba(0,0,0,0) 19.5%, rgba(0,0,0,0) 100%)",
        }}
      />

      <div
        ref={lensBloomRef}
        className="pointer-events-none absolute left-1/2 top-1/2 z-34 h-[34vmin] w-[34vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at center, rgba(220,238,255,0.45) 0%, rgba(150,190,243,0.16) 34%, rgba(0,0,0,0) 72%)",
        }}
      />

      <div
        ref={flashOverlayRef}
        className="pointer-events-none absolute inset-0 z-35 mix-blend-screen"
        style={{
          opacity: 0,
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.34) 18%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0) 72%)",
        }}
      />

      <AnimatePresence>
        {phase === "connected" ? (
          <motion.aside
            className="absolute bottom-20 left-1/2 z-40 w-[min(90vw,390px)] -translate-x-1/2 rounded-[1.35rem] border border-white/18 bg-white/10 p-5 shadow-[0_35px_95px_rgba(0,0,0,0.72)] backdrop-blur-2xl md:bottom-auto md:left-1/2 md:top-[56%] md:w-[370px] md:-translate-y-1/2 md:-translate-x-1/2 md:p-6"
            initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            transition={{ duration: 0.42, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute inset-0 rounded-[1.35rem] bg-[linear-gradient(160deg,rgba(255,255,255,0.15),rgba(255,255,255,0.03)_38%,rgba(0,0,0,0.22)_100%)]" />

            <div className="relative">
              <p className="text-[10px] tracking-[0.34em] text-white/56">CONTACT</p>

              <div className="mt-4 space-y-2.5">
                {rows.map((row) => {
                  if (row.href) {
                    const isExternal = /^https?:\/\//i.test(row.href);
                    return (
                      <a
                        key={row.label}
                        href={row.href}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noreferrer" : undefined}
                        className="flex items-center justify-between rounded-xl border border-white/14 bg-black/28 px-3.5 py-3 transition hover:border-white/30 hover:bg-white/12"
                      >
                        <span className="text-xs uppercase tracking-[0.16em] text-white/62">{row.label}</span>
                        <span className="text-sm text-white/90">{row.value}</span>
                      </a>
                    );
                  }

                  return (
                    <div
                      key={row.label}
                      className="flex items-center justify-between rounded-xl border border-white/14 bg-black/28 px-3.5 py-3"
                    >
                      <span className="text-xs uppercase tracking-[0.16em] text-white/62">{row.label}</span>
                      <span className="text-sm text-white/86">{row.value}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
