"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject, RefObject } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Environment } from "@react-three/drei";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { ProjectsPhase, ScreenPoint } from "./types";

type ScreenRect = { left: number; top: number; width: number; height: number; radius: number };
type OverlayRect = { left: number; top: number; width: number; height: number; radius: number };

type Props = {
  phase?: ProjectsPhase;
  className?: string;
  debug?: boolean;
  screenOverlayRef?: RefObject<HTMLDivElement | null>;
  screenBezelRef?: RefObject<HTMLDivElement | null>;
  onScreenRect?: (rect: ScreenRect) => void;
  onHeroCenter?: (point: ScreenPoint) => void;
};

type Tune = {
  side: 1 | -1;
  wFrac: number;
  hFrac: number;
  xFrac: number;
  yFrac: number;
  inset: number;
};

type CalibratorState = Tune & {
  radiusMul: number;
  showWireframe: boolean;
  scrollEnabled: boolean;
};

type ScreenInfo = {
  mesh: THREE.Mesh;
  cornersLocal: THREE.Vector3[];
  normalLocal: THREE.Vector3;
} | null;

type BoundsInfo = {
  center: THREE.Vector3;
  size: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
  widthAxis: 0 | 1 | 2;
  heightAxis: 0 | 1 | 2;
  depthAxis: 0 | 1 | 2;
  width: number;
  height: number;
  minDepth: number;
  maxDepth: number;
  radius: number;
};

const DEFAULT_TUNE: Tune = {
  side: 1,
  wFrac: 0.87,
  hFrac: 0.92,
  xFrac: 0,
  yFrac: 0.003,
  inset: 0.056,
};

const CAMERA_FOV = 30;
const OFFSCREEN = -10000;
const FIT_FACTOR = 0.72;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_RADIUS_MUL = 0.135;

const fin = Number.isFinite;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const validVec = (v: THREE.Vector3) => fin(v.x) && fin(v.y) && fin(v.z);
const validQuat = (q: THREE.Quaternion) => fin(q.x) && fin(q.y) && fin(q.z) && fin(q.w);
const safeNorm = (v: THREE.Vector3, fb: THREE.Vector3) => (validVec(v) && v.lengthSq() > 1e-6 ? v.normalize() : fb.clone().normalize());

function axisVec(axis: 0 | 1 | 2) {
  return axis === 0 ? new THREE.Vector3(1, 0, 0) : axis === 1 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

function pointsToRect(points: Array<{ x: number; y: number }>) {
  if (points.length !== 4) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (!fin(p.x) || !fin(p.y)) return null;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const width = maxX - minX;
  const height = maxY - minY;
  if (!fin(width) || !fin(height) || width <= 0 || height <= 0) return null;
  return { left: minX, top: minY, width, height };
}

function hideOverlay(overlay: HTMLDivElement | null, bezel: HTMLDivElement | null) {
  if (overlay) {
    overlay.style.left = `${OFFSCREEN}px`;
    overlay.style.top = `${OFFSCREEN}px`;
    overlay.style.width = "1px";
    overlay.style.height = "1px";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transform = "none";
  }
  if (bezel) {
    bezel.style.left = `${OFFSCREEN}px`;
    bezel.style.top = `${OFFSCREEN}px`;
    bezel.style.width = "1px";
    bezel.style.height = "1px";
    bezel.style.opacity = "0";
    bezel.style.transform = "none";
  }
}

function resetOverlayBaseline(overlay: HTMLDivElement | null, bezel: HTMLDivElement | null) {
  if (overlay) {
    overlay.style.left = "0px";
    overlay.style.top = "0px";
    overlay.style.width = "0px";
    overlay.style.height = "0px";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.borderRadius = "0px";
    overlay.style.transform = "none";
  }
  if (bezel) {
    bezel.style.left = "0px";
    bezel.style.top = "0px";
    bezel.style.width = "0px";
    bezel.style.height = "0px";
    bezel.style.opacity = "0";
    bezel.style.borderRadius = "0px";
    bezel.style.transform = "none";
  }
}

function applyOverlayStyles(overlay: HTMLDivElement, bezel: HTMLDivElement | null, rect: OverlayRect) {
  overlay.style.left = `${rect.left}px`;
  overlay.style.top = `${rect.top}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.borderRadius = `${rect.radius}px`;
  overlay.style.opacity = "1";
  overlay.style.pointerEvents = "auto";
  overlay.style.overflow = "hidden";
  overlay.style.overflowY = "auto";
  overlay.style.overflowX = "hidden";
  overlay.style.transform = "none";

  if (!bezel) return;
  const inset = clamp(rect.width * 0.012, 6, 10);
  bezel.style.left = `${rect.left - inset}px`;
  bezel.style.top = `${rect.top - inset}px`;
  bezel.style.width = `${rect.width + 2 * inset}px`;
  bezel.style.height = `${rect.height + 2 * inset}px`;
  bezel.style.borderRadius = `${rect.radius + inset}px`;
  bezel.style.opacity = "0.3";
  bezel.style.transform = "none";
}

function ScreenCalibratorPanel({
  values,
  onValuesChange,
  onCopy,
  onReset,
}: {
  values: CalibratorState;
  onValuesChange: (next: CalibratorState) => void;
  onCopy: () => Promise<void> | void;
  onReset: () => void;
}) {
  const update = (patch: Partial<CalibratorState>) => {
    onValuesChange({ ...values, ...patch });
  };

  const labelStyle: CSSProperties = { display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" };

  return (
    <div style={{ pointerEvents: "none", position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
      <div
        style={{
          pointerEvents: "auto",
          width: 280,
          padding: 12,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "#fff",
          fontSize: 12,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: "0.08em", opacity: 0.9, marginBottom: 8 }}>SCREEN CALIBRATOR</div>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={labelStyle}>
            <span>wFrac {values.wFrac.toFixed(3)}</span>
            <input type="range" min={0.7} max={1.1} step={0.005} value={values.wFrac} onChange={(e) => update({ wFrac: clamp(Number(e.currentTarget.value), 0.7, 1.1) })} />
          </label>
          <label style={labelStyle}>
            <span>hFrac {values.hFrac.toFixed(3)}</span>
            <input type="range" min={0.7} max={1.2} step={0.005} value={values.hFrac} onChange={(e) => update({ hFrac: clamp(Number(e.currentTarget.value), 0.7, 1.2) })} />
          </label>
          <label style={labelStyle}>
            <span>xFrac {values.xFrac.toFixed(3)}</span>
            <input type="range" min={-0.25} max={0.25} step={0.005} value={values.xFrac} onChange={(e) => update({ xFrac: clamp(Number(e.currentTarget.value), -0.25, 0.25) })} />
          </label>
          <label style={labelStyle}>
            <span>yFrac {values.yFrac.toFixed(3)}</span>
            <input type="range" min={-0.25} max={0.25} step={0.005} value={values.yFrac} onChange={(e) => update({ yFrac: clamp(Number(e.currentTarget.value), -0.25, 0.25) })} />
          </label>
          <label style={labelStyle}>
            <span>inset {values.inset.toFixed(3)}</span>
            <input type="range" min={0} max={0.05} step={0.001} value={values.inset} onChange={(e) => update({ inset: clamp(Number(e.currentTarget.value), 0, 0.05) })} />
          </label>
          <label style={labelStyle}>
            <span>radius {values.radiusMul.toFixed(3)}</span>
            <input type="range" min={0.1} max={0.18} step={0.005} value={values.radiusMul} onChange={(e) => update({ radiusMul: clamp(Number(e.currentTarget.value), 0.1, 0.18) })} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={values.showWireframe}
              onChange={(e) => {
                update({ showWireframe: e.currentTarget.checked });
              }}
            />
            <span>Show Wireframe</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={values.scrollEnabled}
              onChange={(e) => {
                update({ scrollEnabled: e.currentTarget.checked });
              }}
            />
            <span>Enable Scroll</span>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => void onCopy()}
            style={{ flex: 1, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "6px 8px" }}
          >
            Copy JSON
          </button>
          <button
            type="button"
            onClick={onReset}
            style={{ flex: 1, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.06)", color: "#fff", padding: "6px 8px" }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function IphoneScene({
  debugEnabled,
  screenOverlayRef,
  onScreenRect,
  onHeroCenter,
  tuneRef,
  hasGltfRef,
  hasRigRef,
  screenInfoRef,
  lastRectRef,
  lastErrorRef,
  onDebugLine,
  radiusMulRef,
  showWireframeRef,
  scrollEnabledRef,
}: {
  debugEnabled: boolean;
  screenOverlayRef?: RefObject<HTMLDivElement | null>;
  onScreenRect?: (rect: ScreenRect) => void;
  onHeroCenter?: (point: ScreenPoint) => void;
  tuneRef: MutableRefObject<Tune>;
  hasGltfRef: MutableRefObject<boolean>;
  hasRigRef: MutableRefObject<boolean>;
  screenInfoRef: MutableRefObject<ScreenInfo>;
  lastRectRef: MutableRefObject<OverlayRect | null>;
  lastErrorRef: MutableRefObject<string>;
  onDebugLine: (line: string) => void;
  radiusMulRef: MutableRefObject<number>;
  showWireframeRef: MutableRefObject<boolean>;
  scrollEnabledRef: MutableRefObject<boolean>;
}) {
  const gltf = useLoader(GLTFLoader, "/models/iphone.glb") as unknown as { scene: THREE.Object3D };
  const model = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  const { camera, gl, size } = useThree();
  const pCam = camera as THREE.PerspectiveCamera;

  const phoneRig = useRef<THREE.Group | null>(null);
  const phoneFacing = useRef<THREE.Group | null>(null);
  const screenAnchor = useRef<THREE.Group | null>(null);
  const screenPlaneMesh = useRef<THREE.Mesh | null>(null);

  const boundsRef = useRef<BoundsInfo | null>(null);
  const modelReadyRef = useRef(false);
  const targetPosRef = useRef(new THREE.Vector3(0, 0.1, 0));
  const targetScaleRef = useRef(1);
  const fitScaleRef = useRef(1);
  const scaledHeightRef = useRef(1);
  const lastLogMsRef = useRef(0);
  const lastUiMsRef = useRef(0);
  const didInitRef = useRef(false);
  const whiteMatRef = useRef<THREE.MeshPhysicalMaterial | null>(null);

  const alignScratch = useRef({
    rigPos: new THREE.Vector3(),
    rigQ: new THREE.Quaternion(),
    invRigQ: new THREE.Quaternion(),
    toCamW: new THREE.Vector3(),
    toCamR: new THREE.Vector3(),
    qAlign: new THREE.Quaternion(),
    qTwist: new THREE.Quaternion(),
    qTarget: new THREE.Quaternion(),
    curUp: new THREE.Vector3(),
    upRig: new THREE.Vector3(),
    pCurUp: new THREE.Vector3(),
    pUpRig: new THREE.Vector3(),
    cross: new THREE.Vector3(),
  });

  const updateLayoutRef = useRef(() => {});

  useEffect(() => {
    hasGltfRef.current = true;
    if (!whiteMatRef.current) {
      whiteMatRef.current = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color("#fbfbfb"),
        roughness: 0.28,
        metalness: 0.06,
        clearcoat: 0.9,
        clearcoatRoughness: 0.14,
        ior: 1.45,
        reflectivity: 0.55,
        specularIntensity: 0.9,
        specularColor: new THREE.Color("#ffffff"),
      });
      whiteMatRef.current.envMapIntensity = 0.85;
    }
    const whiteMat = whiteMatRef.current;
    model.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.material = whiteMat;
      if (obj.material instanceof THREE.MeshPhysicalMaterial || obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.envMapIntensity = 0.85;
      }
      obj.castShadow = false;
      obj.receiveShadow = false;
    });

    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model);
    const centerWorld = box.getCenter(new THREE.Vector3());
    if (validVec(centerWorld)) model.position.sub(centerWorld);

    model.updateWorldMatrix(true, true);
    const centeredBox = new THREE.Box3().setFromObject(model);
    const c = centeredBox.getCenter(new THREE.Vector3());
    const s = centeredBox.getSize(new THREE.Vector3());
    if (!validVec(c) || !validVec(s)) {
      lastErrorRef.current = "Invalid model bounds";
      return;
    }

    let heightAxis: 0 | 1 | 2 = 0;
    if (s.y > s.x && s.y >= s.z) heightAxis = 1;
    else if (s.z > s.x && s.z > s.y) heightAxis = 2;

    let depthAxis: 0 | 1 | 2 = 0;
    if (s.y < s.x && s.y <= s.z) depthAxis = 1;
    else if (s.z < s.x && s.z < s.y) depthAxis = 2;

    const widthAxis = ([0, 1, 2] as const).find((a) => a !== heightAxis && a !== depthAxis) ?? 0;

    const min = centeredBox.min.clone();
    const max = centeredBox.max.clone();

    boundsRef.current = {
      center: c,
      size: s,
      min,
      max,
      widthAxis,
      heightAxis,
      depthAxis,
      width: s[["x", "y", "z"][widthAxis] as "x" | "y" | "z"],
      height: s[["x", "y", "z"][heightAxis] as "x" | "y" | "z"],
      minDepth: min[["x", "y", "z"][depthAxis] as "x" | "y" | "z"],
      maxDepth: max[["x", "y", "z"][depthAxis] as "x" | "y" | "z"],
      radius: centeredBox.getBoundingSphere(new THREE.Sphere()).radius,
    };

    modelReadyRef.current = true;
    didInitRef.current = true;

    targetPosRef.current.set(0, Math.max(0.1, scaledHeightRef.current * 0.08), 0);
    targetScaleRef.current = 1;

    updateLayoutRef.current();
  }, [model, hasGltfRef, lastErrorRef]);

  useEffect(() => {
    return () => {
      whiteMatRef.current?.dispose();
      whiteMatRef.current = null;
    };
  }, []);

  useEffect(() => {
    updateLayoutRef.current = () => {
      const bounds = boundsRef.current;
      if (!bounds) return;
      if (size.width <= 0 || size.height <= 0) return;

      pCam.fov = CAMERA_FOV;
      const dist = (Math.max(1e-6, bounds.radius) / Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV * 0.5))) * 1.28;
      if (!fin(dist)) return;

      pCam.position.set(bounds.size.x * 0.02, bounds.radius * 0.12, dist);
      pCam.lookAt(0, bounds.size.y * 0.03, 0);

      const fov = THREE.MathUtils.degToRad(pCam.fov * 0.5);
      const viewH = 2 * Math.tan(fov) * Math.max(0.001, Math.abs(pCam.position.z));
      const viewW = viewH * pCam.aspect;
      const raw = Math.min((viewH * FIT_FACTOR) / Math.max(bounds.size.y, 1e-6), (viewW * FIT_FACTOR) / Math.max(bounds.size.x, 1e-6));
      if (fin(raw) && raw > 1e-6) {
        fitScaleRef.current = clamp(raw, 0.05, 6);
        scaledHeightRef.current = bounds.size.y * fitScaleRef.current;
      }
      targetPosRef.current.set(0, Math.max(0.1, scaledHeightRef.current * 0.08), 0);
      targetScaleRef.current = 1;

      pCam.near = Math.max(0.01, pCam.position.z * 0.02);
      pCam.far = Math.max(80, pCam.position.z * 10 + scaledHeightRef.current * 4);
      pCam.updateProjectionMatrix();
    };

    updateLayoutRef.current();
  }, [size.width, size.height, pCam]);

  useFrame((state, dt) => {
    try {
      const rig = phoneRig.current;
      const facing = phoneFacing.current;
      const anchor = screenAnchor.current;
      const plane = screenPlaneMesh.current;
      const bounds = boundsRef.current;
      if (!rig || !facing || !anchor || !plane || !bounds || !modelReadyRef.current || !didInitRef.current) return;

      hasRigRef.current = true;

      const alpha = 1 - Math.exp(-Math.max(0, dt) * 8);
      rig.position.lerp(targetPosRef.current, alpha);

      const curScale = rig.scale.x;
      const nextScale = THREE.MathUtils.lerp(curScale, clamp(targetScaleRef.current, 0.05, 6), alpha);
      if (fin(nextScale) && nextScale > 1e-6) rig.scale.setScalar(clamp(nextScale, 0.05, 6));

      const tune = tuneRef.current;
      const side = tune.side >= 0 ? 1 : -1;

      const widthVec = axisVec(bounds.widthAxis);
      const heightVec = axisVec(bounds.heightAxis);
      const depthVec = axisVec(bounds.depthAxis);

      const w = bounds.width * clamp(tune.wFrac, 0.1, 1.2);
      const h = bounds.height * clamp(tune.hFrac, 0.1, 1.2);
      const depthPos = (side > 0 ? bounds.maxDepth : bounds.minDepth) - side * clamp(tune.inset, -0.2, 0.2);

      const center = bounds.center
        .clone()
        .addScaledVector(widthVec, clamp(tune.xFrac, -1, 1) * bounds.width)
        .addScaledVector(heightVec, clamp(tune.yFrac, -1, 1) * bounds.height)
        .addScaledVector(depthVec, depthPos);

      anchor.position.copy(center);

      const basis = new THREE.Matrix4().makeBasis(widthVec.clone(), heightVec.clone(), depthVec.clone());
      const q = new THREE.Quaternion().setFromRotationMatrix(basis);
      if (side < 0) {
        const qFlip = new THREE.Quaternion().setFromAxisAngle(heightVec.clone().normalize(), Math.PI);
        q.multiply(qFlip);
      }
      anchor.quaternion.copy(q);
      plane.scale.set(w, h, 1);
      plane.visible = debugEnabled && showWireframeRef.current;

      const nFacing = safeNorm(new THREE.Vector3(0, 0, 1).applyQuaternion(anchor.quaternion), new THREE.Vector3(0, 0, 1));

      const s = alignScratch.current;
      rig.getWorldPosition(s.rigPos);
      rig.getWorldQuaternion(s.rigQ);
      if (validVec(s.rigPos) && validQuat(s.rigQ)) {
        s.toCamW.copy(pCam.position).sub(s.rigPos);
        s.toCamW.copy(safeNorm(s.toCamW, new THREE.Vector3(0, 0, 1)));
        s.invRigQ.copy(s.rigQ).invert();
        if (validQuat(s.invRigQ)) {
          s.toCamR.copy(s.toCamW).applyQuaternion(s.invRigQ);
          s.toCamR.copy(safeNorm(s.toCamR, new THREE.Vector3(0, 0, 1)));
          s.qAlign.setFromUnitVectors(nFacing.clone(), s.toCamR);

          s.upRig.copy(WORLD_UP).applyQuaternion(s.invRigQ).normalize();
          s.curUp.set(0, 1, 0).applyQuaternion(s.qAlign);
          s.pCurUp.copy(s.curUp).addScaledVector(s.toCamR, -s.curUp.dot(s.toCamR));
          s.pUpRig.copy(s.upRig).addScaledVector(s.toCamR, -s.upRig.dot(s.toCamR));

          if (s.pCurUp.lengthSq() > 1e-8 && s.pUpRig.lengthSq() > 1e-8) {
            s.pCurUp.normalize();
            s.pUpRig.normalize();
            s.cross.copy(s.pCurUp).cross(s.pUpRig);
            const angle = Math.atan2(s.cross.dot(s.toCamR), clamp(s.pCurUp.dot(s.pUpRig), -1, 1));
            s.qTwist.setFromAxisAngle(s.toCamR, angle);
          } else {
            s.qTwist.identity();
          }

          s.qTarget.copy(s.qTwist).multiply(s.qAlign);
          if (validQuat(s.qTarget)) {
            facing.quaternion.slerp(s.qTarget, 1 - Math.exp(-Math.max(0, dt) * clamp(14, 12, 16)));
            if (!validQuat(facing.quaternion)) facing.quaternion.identity();
          }
        }
      }

      const overlay = typeof document !== "undefined" ? (document.getElementById("projects-screen-overlay") as HTMLDivElement | null) : null;
      const bezel = typeof document !== "undefined" ? (document.getElementById("projects-screen-bezel") as HTMLDivElement | null) : null;

      const cornersLocal = [
        new THREE.Vector3(-w * 0.5, -h * 0.5, 0),
        new THREE.Vector3(w * 0.5, -h * 0.5, 0),
        new THREE.Vector3(w * 0.5, h * 0.5, 0),
        new THREE.Vector3(-w * 0.5, h * 0.5, 0),
      ];

      screenInfoRef.current = {
        mesh: plane,
        cornersLocal,
        normalLocal: nFacing.clone(),
      };

      if (overlay) {
        const parent = (overlay.offsetParent as HTMLElement | null) ?? overlay.parentElement;
        const parentRect = parent?.getBoundingClientRect() ?? gl.domElement.getBoundingClientRect();
        const canvasRect = gl.domElement.getBoundingClientRect();

        const points: Array<{ x: number; y: number }> = [];
        let projectionOk = true;
        for (const corner of cornersLocal) {
          const world = anchor.localToWorld(corner.clone());
          world.project(pCam);
          if (![world.x, world.y, world.z].every(fin)) {
            projectionOk = false;
            break;
          }
          const x = canvasRect.left - parentRect.left + (world.x * 0.5 + 0.5) * canvasRect.width;
          const y = canvasRect.top - parentRect.top + (-world.y * 0.5 + 0.5) * canvasRect.height;
          if (!fin(x) || !fin(y)) {
            projectionOk = false;
            break;
          }
          points.push({ x, y });
        }

        let rect = projectionOk ? pointsToRect(points) : null;
        if (!rect || rect.width <= 2 || rect.height <= 2 || ![rect.left, rect.top, rect.width, rect.height].every(fin)) {
          rect = lastRectRef.current;
        }

        if (rect) {
          const out: OverlayRect = {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            radius: clamp(Math.min(rect.width, rect.height) * radiusMulRef.current, 16, 96),
          };
          lastRectRef.current = out;
          applyOverlayStyles(overlay, bezel ?? null, out);
          if (debugEnabled && !scrollEnabledRef.current) {
            overlay.style.pointerEvents = "none";
          }
          onScreenRect?.(out);
        } else {
          overlay.style.opacity = "0";
          overlay.style.pointerEvents = "none";
          if (bezel) bezel.style.opacity = "0";
        }
      } else {
        hideOverlay(overlay, bezel ?? null);
      }

      if (onHeroCenter) {
        const center = new THREE.Vector3(0, 0, 0).applyMatrix4(facing.matrixWorld).project(pCam);
        if (fin(center.x) && fin(center.y)) {
          const overlayNode = screenOverlayRef?.current;
          const parent = (overlayNode?.offsetParent as HTMLElement | null) ?? overlayNode?.parentElement ?? gl.domElement;
          const parentRect = parent.getBoundingClientRect();
          const canvasRect = gl.domElement.getBoundingClientRect();
          onHeroCenter({
            x: canvasRect.left - parentRect.left + (center.x * 0.5 + 0.5) * canvasRect.width,
            y: canvasRect.top - parentRect.top + (-center.y * 0.5 + 0.5) * canvasRect.height,
          });
        }
      }

      if (debugEnabled && typeof window !== "undefined") {
        (window as Window & { __projectsScreenTune?: unknown }).__projectsScreenTune = tuneRef.current;
        (window as Window & { __projectsScreenRadiusMul?: number }).__projectsScreenRadiusMul = radiusMulRef.current;
        (window as Window & { __projectsIphoneLastError?: string }).__projectsIphoneLastError = lastErrorRef.current;
        if (state.clock.elapsedTime * 1000 - lastUiMsRef.current > 120) {
          lastUiMsRef.current = state.clock.elapsedTime * 1000;
          onDebugLine(`gltf: ${hasGltfRef.current ? "yes" : "no"} | rig: ${hasRigRef.current ? "yes" : "no"} | scale: ${rig.scale.x.toFixed(3)}`);
        }
      }
    } catch (err) {
      lastErrorRef.current = err instanceof Error ? err.message : String(err);
      const now = performance.now();
      if (now - lastLogMsRef.current > 1000) {
        lastLogMsRef.current = now;
        console.error("[projects] frame update failed", err);
      }
      return;
    }
  });

  return (
    <>
      <Environment preset="studio" />
      <ambientLight intensity={0.45} />
      <directionalLight position={[2.5, 3.2, 4.2]} intensity={1.25} color="#fff2dc" />
      <directionalLight position={[-3.2, 2.0, -4.5]} intensity={1.05} color="#dfe9ff" />
      <pointLight position={[0.0, 1.6, 2.2]} intensity={0.35} distance={6} />
      <group ref={phoneRig}>
        <group ref={phoneFacing}>
          <primitive object={model} />
          <group ref={screenAnchor}>
            <mesh ref={screenPlaneMesh} visible={debugEnabled}>
              <planeGeometry args={[1, 1]} />
              <meshBasicMaterial color="#8bd0ff" wireframe transparent opacity={0.65} depthTest={false} />
            </mesh>
          </group>
        </group>
      </group>
    </>
  );
}

export function IphoneHeroGLB({ phase, className, debug = false, screenOverlayRef, screenBezelRef, onScreenRect, onHeroCenter }: Props) {
  const [mounted, setMounted] = useState(false);
  const [debugLine, setDebugLine] = useState("");
  const [calibratorState, setCalibratorState] = useState<CalibratorState>({
    ...DEFAULT_TUNE,
    radiusMul: DEFAULT_RADIUS_MUL,
    showWireframe: true,
    scrollEnabled: true,
  });
  void screenBezelRef;
  void debug;

  const tuneRef = useRef<Tune>({ ...DEFAULT_TUNE });
  const radiusMulRef = useRef(DEFAULT_RADIUS_MUL);
  const showWireframeRef = useRef(true);
  const scrollEnabledRef = useRef(true);
  const hasGltfRef = useRef(false);
  const hasRigRef = useRef(false);
  const screenInfoRef = useRef<ScreenInfo>(null);
  const lastRectRef = useRef<OverlayRect | null>(null);
  const lastErrorRef = useRef("");

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const debugEnabled = mounted && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";

  useEffect(() => {
    tuneRef.current = {
      side: calibratorState.side,
      wFrac: calibratorState.wFrac,
      hFrac: calibratorState.hFrac,
      xFrac: calibratorState.xFrac,
      yFrac: calibratorState.yFrac,
      inset: calibratorState.inset,
    };
    radiusMulRef.current = calibratorState.radiusMul;
    showWireframeRef.current = calibratorState.showWireframe;
    scrollEnabledRef.current = calibratorState.scrollEnabled;
  }, [calibratorState]);

  useEffect(() => {
    const overlayNode =
      screenOverlayRef?.current ??
      (typeof document !== "undefined" ? (document.getElementById("projects-screen-overlay") as HTMLDivElement | null) : null);
    const bezelNode =
      screenBezelRef?.current ??
      (typeof document !== "undefined" ? (document.getElementById("projects-screen-bezel") as HTMLDivElement | null) : null);
    return () => {
      const overlay = overlayNode ?? (typeof document !== "undefined" ? (document.getElementById("projects-screen-overlay") as HTMLDivElement | null) : null);
      const bezel = bezelNode ?? (typeof document !== "undefined" ? (document.getElementById("projects-screen-bezel") as HTMLDivElement | null) : null);
      resetOverlayBaseline(overlay, bezel);
    };
  }, [screenOverlayRef, screenBezelRef]);

  useEffect(() => {
    if (!debugEnabled) return;

    const resetTune = () => {
      tuneRef.current = { ...DEFAULT_TUNE };
      radiusMulRef.current = DEFAULT_RADIUS_MUL;
      showWireframeRef.current = true;
      scrollEnabledRef.current = true;
      setCalibratorState({
        ...DEFAULT_TUNE,
        radiusMul: DEFAULT_RADIUS_MUL,
        showWireframe: true,
        scrollEnabled: true,
      });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const t = tuneRef.current;
      let handled = true;
      if (event.key === "ArrowLeft") t.xFrac -= 0.005;
      else if (event.key === "ArrowRight") t.xFrac += 0.005;
      else if (event.key === "ArrowUp") t.yFrac += 0.005;
      else if (event.key === "ArrowDown") t.yFrac -= 0.005;
      else if (event.key === "[") t.inset -= 0.002;
      else if (event.key === "]") t.inset += 0.002;
      else if (event.key === "-" || event.key === "_" || event.key === "=" || event.key === "+") {
        const delta = event.key === "-" || event.key === "_" ? -0.01 : 0.01;
        if (event.shiftKey && !event.altKey) {
          t.hFrac += delta;
        } else if (event.altKey && !event.shiftKey) {
          t.wFrac += delta;
        } else {
          t.wFrac += delta;
          t.hFrac += delta;
        }
      } else if (event.key.toLowerCase() === "f") t.side = t.side === 1 ? -1 : 1;
      else if (event.key.toLowerCase() === "c") {
        console.log("SCREEN_TUNE", JSON.stringify(t));
      } else if (event.key.toLowerCase() === "r") {
        resetTune();
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        t.wFrac = clamp(t.wFrac, 0.7, 1.1);
        t.hFrac = clamp(t.hFrac, 0.7, 1.2);
        t.xFrac = clamp(t.xFrac, -1, 1);
        t.yFrac = clamp(t.yFrac, -1, 1);
        t.inset = clamp(t.inset, -0.2, 0.2);
        (window as Window & { __projectsScreenTune?: unknown }).__projectsScreenTune = t;
        (window as Window & { __projectsScreenRadiusMul?: number }).__projectsScreenRadiusMul = radiusMulRef.current;
        setCalibratorState((prev) => ({
          ...prev,
          side: t.side,
          wFrac: t.wFrac,
          hFrac: t.hFrac,
          xFrac: t.xFrac,
          yFrac: t.yFrac,
          inset: t.inset,
          radiusMul: radiusMulRef.current,
          showWireframe: showWireframeRef.current,
          scrollEnabled: scrollEnabledRef.current,
        }));
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    (window as Window & { __projectsScreenTune?: unknown }).__projectsScreenTune = tuneRef.current;
    (window as Window & { __projectsScreenRadiusMul?: number }).__projectsScreenRadiusMul = radiusMulRef.current;
    (window as Window & { __projectsIphoneLastError?: string }).__projectsIphoneLastError = lastErrorRef.current;

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [debugEnabled]);

  return (
    <>
      <div className={`absolute inset-0 ${className ?? ""}`.trim()} aria-hidden="true">
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
          camera={{ fov: CAMERA_FOV, position: [0, 0, 8], near: 0.01, far: 120 }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.08;
          }}
        >
          <IphoneScene
            debugEnabled={debugEnabled}
            screenOverlayRef={screenOverlayRef}
            onScreenRect={onScreenRect}
            onHeroCenter={onHeroCenter}
            tuneRef={tuneRef}
            hasGltfRef={hasGltfRef}
            hasRigRef={hasRigRef}
            screenInfoRef={screenInfoRef}
            lastRectRef={lastRectRef}
            lastErrorRef={lastErrorRef}
            onDebugLine={setDebugLine}
            radiusMulRef={radiusMulRef}
            showWireframeRef={showWireframeRef}
            scrollEnabledRef={scrollEnabledRef}
          />
        </Canvas>
      </div>
      {debugEnabled ? (
        <ScreenCalibratorPanel
          values={calibratorState}
          onValuesChange={setCalibratorState}
          onCopy={async () => {
            const json = JSON.stringify(tuneRef.current);
            console.log("SCREEN_TUNE", json);
            if (navigator.clipboard?.writeText) {
              try {
                await navigator.clipboard.writeText(json);
              } catch {
                // no-op
              }
            }
          }}
          onReset={() =>
            setCalibratorState({
              ...DEFAULT_TUNE,
              radiusMul: DEFAULT_RADIUS_MUL,
              showWireframe: true,
              scrollEnabled: true,
            })
          }
        />
      ) : null}
      {debugEnabled ? (
        <div className="pointer-events-none fixed bottom-3 right-3 z-[90] rounded-full border border-white/20 bg-black/65 px-3 py-1 text-[10px] tracking-[0.08em] text-white/90">
          {debugLine || `Phase: ${phase ?? "live"}`}
        </div>
      ) : null}
    </>
  );
}

export default IphoneHeroGLB;
