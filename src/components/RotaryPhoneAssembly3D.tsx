'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Phase = 'assembling' | 'ringing' | 'connected';

type RotaryPhoneAssembly3DProps = {
  phase?: Phase;
  onAssembled?: () => void;
  onAnswered?: () => void;
  onPickedUp?: () => void;
  onHungUp?: () => void;
  onHangUp?: () => void;
  onStatusChange?: (status: string) => void;
  onConnectedChange?: (connected: boolean) => void;
};

type PartPose = {
  p: THREE.Vector3;
  q: THREE.Quaternion;
  s: THREE.Vector3;
};

type Part = {
  name: string;
  obj: THREE.Object3D;
  target: PartPose;
  start: PartPose;
};

type CameraMode = 'reference' | 'cinematic';
type AssemblyPhaseName = 'dial' | 'body' | 'cradle';

// TUNING: HERO CAMERA + SAFE FRAMING + ASSEMBLY PHASES
const CAMERA_MODE: CameraMode = 'reference';
const CAMERA_FOV = 24;
const CAMERA_NEAR = 0.05;
const CAMERA_FAR = 55;
const CAMERA_REFERENCE_POS = new THREE.Vector3(0.28, 1.85, 8.18);
const CAMERA_REFERENCE_TARGET = new THREE.Vector3(0.08, 0.80, 0.12);
const CAMERA_REFERENCE_FOV = 24.4;
const CAMERA_RESPONSIVE_ANCHOR_ASPECT = 16 / 9;
const CAMERA_RESPONSIVE_FOV_PER_ASPECT_DELTA = 2.1;
const CAMERA_RESPONSIVE_DOLLY_PER_ASPECT_DELTA = 1.15;
const CAMERA_RESPONSIVE_LIFT_PER_ASPECT_DELTA = 0.26;
const CAMERA_SAFE_FIT_PADDING = 1.05;
const CAMERA_SAFE_EDGE_MARGIN_X = 0.06;
const CAMERA_SAFE_EDGE_MARGIN_Y = 0.08;
const CAMERA_SAFE_DISTANCE_MIN = 7.7;
const CAMERA_SAFE_DISTANCE_MAX = 11.2;
const CAMERA_COMPOSITION_BIAS = new THREE.Vector3(-0.1, 0.07, 0.02);

const ASSEMBLY_DURATION_MS = 3000;
const ASSEMBLY_PHASE_TIMINGS: Record<
  AssemblyPhaseName,
  { start: number; partDuration: number; partStagger: number; settleStart: number; settleAmp: number }
> = {
  dial: { start: 0.0, partDuration: 0.2, partStagger: 0.02, settleStart: 0.82, settleAmp: 0.022 },
  body: { start: 0.35, partDuration: 0.24, partStagger: 0.05, settleStart: 0.84, settleAmp: 0.028 },
  cradle: { start: 0.68, partDuration: 0.18, partStagger: 0.024, settleStart: 0.84, settleAmp: 0.02 },
};
const ASSEMBLY_PART_SEQUENCE: Record<string, { phase: AssemblyPhaseName; order: number }> = {
  dialSeat: { phase: 'dial', order: 0 },
  dialSeatInner: { phase: 'dial', order: 1 },
  dialBezel: { phase: 'dial', order: 2 },
  numberRing: { phase: 'dial', order: 3 },
  fingerWheel: { phase: 'dial', order: 4 },
  clearCover: { phase: 'dial', order: 5 },
  clearCoverLip: { phase: 'dial', order: 6 },
  centerCap: { phase: 'dial', order: 7 },
  fingerStop: { phase: 'dial', order: 8 },
  baseFoot: { phase: 'body', order: 0 },
  base: { phase: 'body', order: 1 },
  upperShell: { phase: 'body', order: 2 },
  seam: { phase: 'body', order: 3 },
  deck: { phase: 'body', order: 4 },
  cradleBridge: { phase: 'cradle', order: 0 },
  forkLeft: { phase: 'cradle', order: 1 },
  forkRight: { phase: 'cradle', order: 1 },
  leftPad: { phase: 'cradle', order: 2 },
  rightPad: { phase: 'cradle', order: 2 },
  plungerHousingL: { phase: 'cradle', order: 3 },
  plungerHousingR: { phase: 'cradle', order: 3 },
  plungerL: { phase: 'cradle', order: 4 },
  plungerR: { phase: 'cradle', order: 4 },
  cord: { phase: 'cradle', order: 5 },
  handset: { phase: 'cradle', order: 6 },
};

const RING_WOBBLE_ROLL = 0.05;
const RING_WOBBLE_PITCH = 0.028;
const RING_BOB = 0.014;
const RING_PLUNGER_BOUNCE = 0.03;
const RING_FREQ = 0.012;

const PHONE_ASSEMBLED_POS = new THREE.Vector3(0.24, -0.28, 0.10);
const PHONE_ASSEMBLED_ROT = new THREE.Euler(-0.22, -0.18, 0.0);
const PHONE_ASSEMBLED_SCALE = 1.02;

const NUMBER_RING_NUMBER_FONT_PX = 104;
const NUMBER_RING_LETTER_FONT_PX = 38;
const NUMBER_RING_TEXT_COLOR = 'rgba(8,8,8,1)';
const NUMBER_RING_LETTER_COLOR = 'rgba(10,10,10,0.88)';

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function roundedBoxGeometry(width: number, height: number, depth: number, segments = 10, radius = 0.2) {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.max(0.0001, Math.min(radius, hw - 0.0001, hd - 0.0001));

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

  const bevel = Math.min(r * 0.55, Math.min(width, height, depth) * 0.12);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.max(2, Math.round(segments / 2)),
    curveSegments: Math.max(8, segments * 2),
  });

  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -height / 2, 0);
  geo.computeVertexNormals();
  return geo;
}

function wedgeifyGeometry(geo: THREE.BufferGeometry, height: number, depth: number, slopeAmount: number) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const halfH = height / 2;
  const halfD = depth / 2;
  for (let i = 0; i < pos.count; i++) {
    const y0 = pos.getY(i);
    const z0 = pos.getZ(i);
    const yn = clamp01((y0 + halfH) / height);
    const zn = halfD > 0 ? z0 / halfD : 0;
    pos.setY(i, y0 + yn * zn * slopeAmount);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function poseOf(obj: THREE.Object3D): PartPose {
  return {
    p: obj.position.clone(),
    q: obj.quaternion.clone(),
    s: obj.scale.clone(),
  };
}

function applyPose(obj: THREE.Object3D, pose: PartPose) {
  obj.position.copy(pose.p);
  obj.quaternion.copy(pose.q);
  obj.scale.copy(pose.s);
}

function lerpPose(obj: THREE.Object3D, a: PartPose, b: PartPose, t: number) {
  obj.position.lerpVectors(a.p, b.p, t);
  obj.quaternion.slerpQuaternions(a.q, b.q, t);
  obj.scale.lerpVectors(a.s, b.s, t);
}

function makeNumberRingTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.translate(512, 512);

  // Draw a dedicated cream ring band so typography reads clearly as a number ring.
  ctx.beginPath();
  ctx.arc(0, 0, 482, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(242,238,230,0.95)';
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(0, 0, 294, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.strokeStyle = 'rgba(18,18,18,0.22)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 475, 0, Math.PI * 2);
  ctx.stroke();

  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 300, 0, Math.PI * 2);
  ctx.stroke();

  const labels = [
    { n: '1', l: '' },
    { n: '2', l: 'ABC' },
    { n: '3', l: 'DEF' },
    { n: '4', l: 'GHI' },
    { n: '5', l: 'JKL' },
    { n: '6', l: 'MNO' },
    { n: '7', l: 'PRS' },
    { n: '8', l: 'TUV' },
    { n: '9', l: 'WXY' },
    { n: '0', l: 'OPER' },
  ];

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < labels.length; i++) {
    const a = (i / labels.length) * Math.PI * 2 - Math.PI * 0.66;
    const r = 382;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI * 0.5);

    ctx.font = `700 ${NUMBER_RING_NUMBER_FONT_PX}px 'Times New Roman', ui-serif, serif`;
    ctx.fillStyle = NUMBER_RING_TEXT_COLOR;
    ctx.fillText(labels[i].n, 0, -34);

    ctx.font = `700 ${NUMBER_RING_LETTER_FONT_PX}px 'Times New Roman', ui-serif, serif`;
    ctx.fillStyle = NUMBER_RING_LETTER_COLOR;
    if (labels[i].l) ctx.fillText(labels[i].l, 0, 23);

    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(18,18,18,0.36)';
  ctx.lineWidth = 3.2;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = 432;
    const r1 = i % 5 === 0 ? 474 : 458;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeDialPlateGeometry(
  outerRadius: number,
  centerRadius: number,
  holeRadius: number,
  holeRingRadius: number,
  holeCount: number
) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);

  const centerHole = new THREE.Path();
  centerHole.absarc(0, 0, centerRadius, 0, Math.PI * 2, true);
  shape.holes.push(centerHole);

  for (let i = 0; i < holeCount; i++) {
    const a = (i / holeCount) * Math.PI * 2 - Math.PI * 0.64;
    const x = Math.cos(a) * holeRingRadius;
    const z = Math.sin(a) * holeRingRadius;
    const hole = new THREE.Path();
    hole.absarc(x, z, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.009,
    bevelSegments: 2,
    curveSegments: 64,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -0.0275, 0);
  geo.computeVertexNormals();
  return geo;
}

export default function RotaryPhoneAssembly3D(props: RotaryPhoneAssembly3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const phaseRef = useRef<Phase | undefined>(props.phase);
  useEffect(() => {
    phaseRef.current = props.phase;
  }, [props.phase]);

  const callbacksRef = useRef({
    onAssembled: props.onAssembled,
    onAnswered: props.onAnswered,
    onPickedUp: props.onPickedUp,
    onHungUp: props.onHungUp,
    onHangUp: props.onHangUp,
    onStatusChange: props.onStatusChange,
    onConnectedChange: props.onConnectedChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      onAssembled: props.onAssembled,
      onAnswered: props.onAnswered,
      onPickedUp: props.onPickedUp,
      onHungUp: props.onHungUp,
      onHangUp: props.onHangUp,
      onStatusChange: props.onStatusChange,
      onConnectedChange: props.onConnectedChange,
    };
  }, [
    props.onAssembled,
    props.onAnswered,
    props.onPickedUp,
    props.onHungUp,
    props.onHangUp,
    props.onStatusChange,
    props.onConnectedChange,
  ]);

  const config = useMemo(
    () => ({
      cameraMode: CAMERA_MODE,
      fov: CAMERA_FOV,
      near: CAMERA_NEAR,
      far: CAMERA_FAR,
      referencePos: CAMERA_REFERENCE_POS,
      referenceTarget: CAMERA_REFERENCE_TARGET,
      referenceFov: CAMERA_REFERENCE_FOV,
      responsiveAnchorAspect: CAMERA_RESPONSIVE_ANCHOR_ASPECT,
      responsiveFovPerAspectDelta: CAMERA_RESPONSIVE_FOV_PER_ASPECT_DELTA,
      responsiveDollyPerAspectDelta: CAMERA_RESPONSIVE_DOLLY_PER_ASPECT_DELTA,
      responsiveLiftPerAspectDelta: CAMERA_RESPONSIVE_LIFT_PER_ASPECT_DELTA,
      safeFitPadding: CAMERA_SAFE_FIT_PADDING,
      safeEdgeMarginX: CAMERA_SAFE_EDGE_MARGIN_X,
      safeEdgeMarginY: CAMERA_SAFE_EDGE_MARGIN_Y,
      safeDistanceMin: CAMERA_SAFE_DISTANCE_MIN,
      safeDistanceMax: CAMERA_SAFE_DISTANCE_MAX,
      compositionBias: CAMERA_COMPOSITION_BIAS,
      phonePos: PHONE_ASSEMBLED_POS,
      phoneRot: PHONE_ASSEMBLED_ROT,
      phoneScale: PHONE_ASSEMBLED_SCALE,
    }),
    []
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      config.fov,
      mount.clientWidth / mount.clientHeight,
      config.near,
      config.far
    );

    const ambient = new THREE.AmbientLight(0xffffff, 0.24);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(-2.7, 3.2, 2.9);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xffffff, 0.62);
    fill.position.set(3.0, 1.7, 2.6);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.95);
    rim.position.set(0.1, 2.7, -4.1);
    scene.add(rim);

    const softFill = new THREE.DirectionalLight(0xfff4e2, 0.3);
    softFill.position.set(-0.3, 1.2, 4.0);
    scene.add(softFill);

    const redPlastic = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ad1f1f'),
      roughness: 0.62,
      metalness: 0.03,
      clearcoat: 0.22,
      clearcoatRoughness: 0.34,
    });

    const redPlasticSoft = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#a8191c'),
      roughness: 0.69,
      metalness: 0.03,
      clearcoat: 0.14,
      clearcoatRoughness: 0.41,
    });

    const darkPlastic = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#111111'),
      roughness: 0.58,
      metalness: 0.02,
    });

    const offWhite = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#e8e3d7'),
      roughness: 0.42,
      metalness: 0.0,
    });

    const metal = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#c8c8c8'),
      roughness: 0.2,
      metalness: 0.9,
    });

    const clearPlastic = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#f7fbff'),
      roughness: 0.025,
      metalness: 0.0,
      transmission: 1.0,
      thickness: 0.06,
      ior: 1.47,
      transparent: true,
      opacity: 0.13,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
    });
    (clearPlastic as any).depthWrite = false;

    const clearHighlight = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffffff'),
      roughness: 0.02,
      metalness: 0.0,
      transmission: 1.0,
      thickness: 0.04,
      ior: 1.44,
      transparent: true,
      opacity: 0.11,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
    });
    (clearHighlight as any).depthWrite = false;

    const phoneGroup = new THREE.Group();
    phoneGroup.position.copy(config.phonePos);
    phoneGroup.rotation.copy(config.phoneRot);
    phoneGroup.scale.setScalar(config.phoneScale);
    scene.add(phoneGroup);
    const baseW = 3.56;
    const baseH = 1.0;
    const baseD = 2.66;

    const baseGeo = roundedBoxGeometry(baseW, baseH, baseD, 14, 0.16);
    wedgeifyGeometry(baseGeo, baseH, baseD, -0.66);
    const base = new THREE.Mesh(baseGeo, redPlastic);
    phoneGroup.add(base);

    const baseFootGeo = roundedBoxGeometry(baseW * 0.985, 0.1, baseD * 0.93, 10, 0.15);
    wedgeifyGeometry(baseFootGeo, 0.1, baseD * 0.93, -0.16);
    const baseFoot = new THREE.Mesh(baseFootGeo, darkPlastic);
    baseFoot.position.set(0, -baseH * 0.5 + 0.04, -0.03);
    phoneGroup.add(baseFoot);

    const upperShellH = 0.56;
    const upperShellGeo = roundedBoxGeometry(baseW * 0.94, upperShellH, baseD * 0.84, 12, 0.18);
    wedgeifyGeometry(upperShellGeo, upperShellH, baseD * 0.84, -0.48);
    const upperShell = new THREE.Mesh(upperShellGeo, redPlasticSoft);
    upperShell.position.set(0, baseH * 0.18 + upperShellH * 0.5, -0.06);
    phoneGroup.add(upperShell);

    const seamGeo = roundedBoxGeometry(baseW * 0.965, 0.055, baseD * 0.9, 10, 0.16);
    wedgeifyGeometry(seamGeo, 0.055, baseD * 0.9, -0.28);
    const seam = new THREE.Mesh(seamGeo, redPlasticSoft);
    seam.position.set(0, baseH * 0.23, -0.04);
    phoneGroup.add(seam);

    const deckH = 0.19;
    const deckGeo = roundedBoxGeometry(baseW * 0.84, deckH, baseD * 0.7, 12, 0.18);
    wedgeifyGeometry(deckGeo, deckH, baseD * 0.7, -0.34);
    const deck = new THREE.Mesh(deckGeo, redPlasticSoft);
    deck.position.set(0, baseH * 0.5 + deckH * 0.5 + 0.05, -0.06);
    phoneGroup.add(deck);

    const dialCenterZ = 0.56;
    const dialBaseY = baseH * 0.5 + deckH + 0.01;

    const dialSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.12, 100), darkPlastic);
    dialSeat.position.set(0, dialBaseY + 0.002, dialCenterZ);
    phoneGroup.add(dialSeat);

    const dialSeatInner = new THREE.Mesh(new THREE.CylinderGeometry(0.79, 0.79, 0.028, 100), darkPlastic);
    dialSeatInner.position.set(0, dialBaseY + 0.025, dialCenterZ);
    phoneGroup.add(dialSeatInner);

    const dialBezel = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 18, 96), darkPlastic);
    dialBezel.rotation.x = Math.PI * 0.5;
    dialBezel.position.set(0, dialBaseY + 0.048, dialCenterZ);
    phoneGroup.add(dialBezel);

    const ringTex = makeNumberRingTexture();
    const numberRing = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.76, 120),
      new THREE.MeshBasicMaterial({
        map: ringTex,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -2,
      })
    );
    numberRing.rotation.x = -Math.PI * 0.5;
    numberRing.position.set(0, dialBaseY + 0.053, dialCenterZ);
    numberRing.renderOrder = 6;
    phoneGroup.add(numberRing);

    const fingerWheel = new THREE.Mesh(
      makeDialPlateGeometry(0.62, 0.17, 0.098, 0.44, 10),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#ddd5c5'),
        roughness: 0.38,
        metalness: 0.02,
        clearcoat: 0.42,
        clearcoatRoughness: 0.22,
      })
    );
    fingerWheel.position.set(0, dialBaseY + 0.068, dialCenterZ);
    fingerWheel.renderOrder = 7;
    phoneGroup.add(fingerWheel);

    const fingerHoleRimGeo = new THREE.TorusGeometry(0.108, 0.01, 10, 32);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI * 0.64;
      const hx = Math.cos(a) * 0.44;
      const hz = Math.sin(a) * 0.44;
      const rimMesh = new THREE.Mesh(fingerHoleRimGeo, offWhite);
      rimMesh.rotation.x = Math.PI * 0.5;
      rimMesh.position.set(hx, 0.029, hz);
      fingerWheel.add(rimMesh);
    }

    const clearCover = new THREE.Mesh(new THREE.CylinderGeometry(0.77, 0.775, 0.028, 110), clearPlastic);
    clearCover.position.set(0, dialBaseY + 0.092, dialCenterZ);
    clearCover.renderOrder = 8;
    phoneGroup.add(clearCover);

    const clearCoverLip = new THREE.Mesh(new THREE.TorusGeometry(0.77, 0.012, 12, 90), clearHighlight);
    clearCoverLip.rotation.x = Math.PI * 0.5;
    clearCoverLip.position.set(0, dialBaseY + 0.106, dialCenterZ);
    clearCoverLip.renderOrder = 9;
    phoneGroup.add(clearCoverLip);

    const centerCap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.05, 48), offWhite);
    centerCap.position.set(0, dialBaseY + 0.118, dialCenterZ);
    centerCap.renderOrder = 10;
    phoneGroup.add(centerCap);

    const fingerStop = new THREE.Group();
    const stopStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 24), metal);
    stopStem.position.set(-0.04, 0.032, -0.02);
    fingerStop.add(stopStem);
    const stopBar = new THREE.Mesh(roundedBoxGeometry(0.3, 0.045, 0.09, 10, 0.03), metal);
    stopBar.position.set(0.07, 0.022, 0);
    fingerStop.add(stopBar);
    fingerStop.position.set(0.66, dialBaseY + 0.052, dialCenterZ + 0.38);
    fingerStop.rotation.y = -0.62;
    phoneGroup.add(fingerStop);

    const cradleZ = -0.66;
    const cradleBaseY = baseH * 0.5 + deckH + 0.02;
    const forkContactY = cradleBaseY + 0.22;
    const forkContactZ = cradleZ + 0.2;

    const cradleBridge = new THREE.Mesh(roundedBoxGeometry(1.6, 0.11, 0.44, 10, 0.09), redPlasticSoft);
    cradleBridge.position.set(0, cradleBaseY + 0.07, cradleZ + 0.04);
    phoneGroup.add(cradleBridge);

    const buildFork = (x: number, side: -1 | 1) => {
      const group = new THREE.Group();

      const foot = new THREE.Mesh(roundedBoxGeometry(0.58, 0.22, 0.56, 10, 0.11), redPlasticSoft);
      foot.position.set(x, cradleBaseY + 0.04, cradleZ + 0.05);
      group.add(foot);

      const postFront = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.34, 20), redPlastic);
      postFront.position.set(x + side * 0.1, cradleBaseY + 0.24, cradleZ + 0.17);
      group.add(postFront);

      const postBack = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.34, 20), redPlastic);
      postBack.position.set(x - side * 0.1, cradleBaseY + 0.24, cradleZ - 0.01);
      group.add(postBack);

      const forkArc = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.036, 12, 36, Math.PI), redPlasticSoft);
      forkArc.rotation.x = Math.PI * 0.5;
      forkArc.rotation.z = side > 0 ? Math.PI : 0;
      forkArc.position.set(x, forkContactY + 0.015, forkContactZ - 0.03);
      group.add(forkArc);

      const forkTip = new THREE.Mesh(roundedBoxGeometry(0.2, 0.07, 0.1, 8, 0.03), redPlasticSoft);
      forkTip.position.set(x + side * 0.19, forkContactY + 0.012, forkContactZ + 0.03);
      group.add(forkTip);

      return group;
    };

    const forkLeft = buildFork(-0.94, -1);
    const forkRight = buildFork(0.94, 1);
    phoneGroup.add(forkLeft, forkRight);

    const leftPad = new THREE.Mesh(roundedBoxGeometry(0.24, 0.045, 0.12, 10, 0.04), darkPlastic);
    leftPad.position.set(-1.08, forkContactY + 0.03, forkContactZ + 0.02);
    phoneGroup.add(leftPad);

    const rightPad = leftPad.clone();
    rightPad.position.x = 1.08;
    phoneGroup.add(rightPad);

    const plungerBaseY = cradleBaseY + 0.19;
    const plungerHousingL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.09, 20), redPlasticSoft);
    plungerHousingL.position.set(-0.86, cradleBaseY + 0.16, cradleZ + 0.07);
    phoneGroup.add(plungerHousingL);

    const plungerHousingR = plungerHousingL.clone();
    plungerHousingR.position.x = 0.86;
    phoneGroup.add(plungerHousingR);

    const plungerL = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.076, 20), darkPlastic);
    plungerL.position.set(-0.86, plungerBaseY, cradleZ + 0.07);
    phoneGroup.add(plungerL);

    const plungerR = plungerL.clone();
    plungerR.position.x = 0.86;
    phoneGroup.add(plungerR);

    const handsetPivotBase = new THREE.Vector3(0, forkContactY + 0.02, forkContactZ + 0.01);
    const handsetPivot = new THREE.Group();
    handsetPivot.position.copy(handsetPivotBase);
    phoneGroup.add(handsetPivot);

    const handsetGroup = new THREE.Group();
    handsetGroup.position.set(0, 0.004, -0.004);
    handsetGroup.rotation.set(0.01, 0, 0.02);
    handsetPivot.add(handsetGroup);

    const spineSegs = 13;
    for (let i = 0; i < spineSegs; i++) {
      const t = i / (spineSegs - 1);
      const x = THREE.MathUtils.lerp(-1.04, 1.04, t);
      const arch = Math.sin(t * Math.PI) * 0.13;
      const flare = Math.pow(Math.abs(t - 0.5) * 2, 0.9);
      const shellW = 0.31 + flare * 0.07;
      const segH = 0.14 + flare * 0.05;
      const segD = 0.26 + flare * 0.08;
      const sweepZ = Math.sin((t - 0.5) * Math.PI) * 0.03;

      const shellSeg = new THREE.Mesh(roundedBoxGeometry(shellW, segH, segD, 10, 0.07), redPlastic);
      shellSeg.position.set(x, arch, sweepZ);
      handsetGroup.add(shellSeg);

      if (i > 1 && i < spineSegs - 2) {
        const crestSeg = new THREE.Mesh(roundedBoxGeometry(0.24, 0.065, 0.18, 8, 0.045), redPlasticSoft);
        crestSeg.position.set(x, arch + 0.075, 0);
        handsetGroup.add(crestSeg);
      }
    }

    const handsetUnderside = new THREE.Mesh(roundedBoxGeometry(1.86, 0.08, 0.24, 10, 0.06), redPlasticSoft);
    handsetUnderside.position.set(0, -0.058, 0);
    handsetGroup.add(handsetUnderside);

    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const x = THREE.MathUtils.lerp(-0.78, 0.78, t);
      const mid = 1 - Math.abs(t - 0.5) * 2;
      const contour = new THREE.Mesh(
        roundedBoxGeometry(0.18, 0.032 + mid * 0.012, 0.1 + mid * 0.04, 8, 0.03),
        redPlasticSoft
      );
      contour.position.set(x, -0.1 - mid * 0.012, 0.0);
      handsetGroup.add(contour);
    }

    const makeReceiverEnd = (x: number, side: -1 | 1) => {
      const g = new THREE.Group();

      const flareShell = new THREE.Mesh(roundedBoxGeometry(0.54, 0.24, 0.42, 12, 0.12), redPlastic);
      flareShell.rotation.y = side * 0.05;
      g.add(flareShell);

      const neck = new THREE.Mesh(roundedBoxGeometry(0.18, 0.13, 0.3, 10, 0.06), redPlasticSoft);
      neck.position.set(-side * 0.18, 0.0, 0);
      g.add(neck);

      const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.022, 12, 36), darkPlastic);
      capRim.rotation.x = Math.PI * 0.5;
      capRim.position.set(side * 0.11, 0.015, 0);
      g.add(capRim);

      const capDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.036, 30), darkPlastic);
      capDisc.rotation.z = Math.PI * 0.5;
      capDisc.position.set(side * 0.135, 0.015, 0);
      g.add(capDisc);

      for (let i = 0; i < 6; i++) {
        const gy = -0.04 + i * 0.016;
        const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 8), offWhite);
        grille.rotation.z = Math.PI * 0.5;
        grille.position.set(side * 0.145, gy, 0);
        g.add(grille);
      }

      g.position.set(x, 0.018, 0);
      return g;
    };

    handsetGroup.add(makeReceiverEnd(-1.15, -1));
    handsetGroup.add(makeReceiverEnd(1.15, 1));

    const coilPts: THREE.Vector3[] = [];
    const coils = 11;
    const coilLen = 1.85;
    for (let i = 0; i <= 260; i++) {
      const t = i / 260;
      const x = -1.6 - t * coilLen;
      const a = t * Math.PI * 2 * coils;
      const y = baseH * 0.46 - t * 0.14 + Math.sin(a) * 0.1;
      const z = 0.05 + Math.cos(a) * 0.1;
      coilPts.push(new THREE.Vector3(x, y, z));
    }
    const coilCurve = new THREE.CatmullRomCurve3(coilPts);
    const cord = new THREE.Mesh(new THREE.TubeGeometry(coilCurve, 560, 0.03, 12, false), darkPlastic);
    phoneGroup.add(cord);

    const parts: Part[] = [];
    const pushPart = (name: string, obj: THREE.Object3D) => {
      parts.push({ name, obj, target: poseOf(obj), start: poseOf(obj) });
    };

    pushPart('base', base);
    pushPart('baseFoot', baseFoot);
    pushPart('upperShell', upperShell);
    pushPart('seam', seam);
    pushPart('deck', deck);
    pushPart('dialSeat', dialSeat);
    pushPart('dialSeatInner', dialSeatInner);
    pushPart('dialBezel', dialBezel);
    pushPart('numberRing', numberRing);
    pushPart('fingerWheel', fingerWheel);
    pushPart('clearCover', clearCover);
    pushPart('clearCoverLip', clearCoverLip);
    pushPart('centerCap', centerCap);
    pushPart('fingerStop', fingerStop);
    pushPart('cradleBridge', cradleBridge);
    pushPart('forkLeft', forkLeft);
    pushPart('forkRight', forkRight);
    pushPart('leftPad', leftPad);
    pushPart('rightPad', rightPad);
    pushPart('plungerHousingL', plungerHousingL);
    pushPart('plungerHousingR', plungerHousingR);
    pushPart('plungerL', plungerL);
    pushPart('plungerR', plungerR);
    pushPart('handset', handsetPivot);
    pushPart('cord', cord);

    for (const p of parts) {
      const tPose = p.target;
      const sPose: PartPose = { p: tPose.p.clone(), q: tPose.q.clone(), s: tPose.s.clone() };
      const n = p.name;

      const spread = new THREE.Vector3(0.0, 0.9, 0.0);
      if (n === 'base') spread.set(0, -1.22, -0.18);
      if (n === 'baseFoot') spread.set(0, -1.05, -0.15);
      if (n === 'upperShell') spread.set(0, 0.64, -0.24);
      if (n === 'seam') spread.set(0, 0.78, -0.18);
      if (n === 'deck') spread.set(0, 0.92, -0.02);
      if (n === 'dialSeat') spread.set(0, 1.28, 0.84);
      if (n === 'dialSeatInner') spread.set(0, 1.4, 0.92);
      if (n === 'dialBezel') spread.set(0, 1.5, 1.0);
      if (n === 'numberRing') spread.set(0, 1.66, 1.07);
      if (n === 'fingerWheel') spread.set(0, 1.78, 1.16);
      if (n === 'clearCover') spread.set(0, 1.9, 1.22);
      if (n === 'clearCoverLip') spread.set(0, 1.98, 1.27);
      if (n === 'centerCap') spread.set(0, 2.05, 1.3);
      if (n === 'fingerStop') spread.set(0.96, 1.68, 1.42);
      if (n === 'cradleBridge') spread.set(0, 1.05, -1.05);
      if (n === 'forkLeft') spread.set(-1.05, 1.18, -1.16);
      if (n === 'forkRight') spread.set(1.05, 1.18, -1.16);
      if (n === 'leftPad') spread.set(-0.72, 1.29, -0.92);
      if (n === 'rightPad') spread.set(0.72, 1.29, -0.92);
      if (n === 'plungerHousingL') spread.set(-0.9, 1.34, -0.86);
      if (n === 'plungerHousingR') spread.set(0.9, 1.34, -0.86);
      if (n === 'plungerL') spread.set(-0.9, 1.42, -0.8);
      if (n === 'plungerR') spread.set(0.9, 1.42, -0.8);
      if (n === 'handset') spread.set(0, 2.34, -0.22);
      if (n === 'cord') spread.set(-2.05, 1.18, 0.44);
      sPose.p.add(spread);

      let rot = new THREE.Euler(0, 0, 0);
      if (n === 'base') rot = new THREE.Euler(-0.08, 0.02, 0.01);
      if (n === 'baseFoot') rot = new THREE.Euler(-0.12, 0.0, 0.0);
      if (n === 'upperShell' || n === 'seam' || n === 'deck') rot = new THREE.Euler(0.14, -0.05, 0.02);
      if (n === 'dialSeat' || n === 'dialSeatInner' || n === 'dialBezel') rot = new THREE.Euler(0.32, 0.12, 0.05);
      if (n === 'numberRing') rot = new THREE.Euler(0.38, 0.06, 0.03);
      if (n === 'fingerWheel') rot = new THREE.Euler(0.44, -0.06, -0.08);
      if (n === 'clearCover' || n === 'clearCoverLip') rot = new THREE.Euler(0.46, 0.02, 0.06);
      if (n === 'centerCap') rot = new THREE.Euler(0.48, 0.0, 0.1);
      if (n === 'fingerStop') rot = new THREE.Euler(0.2, 0.56, 0.16);
      if (n === 'forkLeft' || n === 'forkRight') rot = new THREE.Euler(0.18, 0.0, 0.0);
      if (n === 'handset') rot = new THREE.Euler(0.42, -0.18, 0.24);
      if (n === 'cord') rot = new THREE.Euler(0.08, 0.22, -0.1);
      const q = new THREE.Quaternion().setFromEuler(rot);
      sPose.q.multiply(q);

      p.start = sPose;
    }

    for (const p of parts) applyPose(p.obj, p.start);

    const tmpPoses = parts.map((p) => poseOf(p.obj));
    for (const p of parts) applyPose(p.obj, p.target);
    const assembledBox = new THREE.Box3().setFromObject(phoneGroup);
    const assembledSize = new THREE.Vector3();
    assembledBox.getSize(assembledSize);
    const assembledCenter = new THREE.Vector3();
    assembledBox.getCenter(assembledCenter);
    parts.forEach((p, i) => applyPose(p.obj, tmpPoses[i]));

    const applyCamera = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      if (config.cameraMode === 'reference') {
        const aspectDelta = Math.max(0, config.responsiveAnchorAspect - camera.aspect);
        camera.fov = THREE.MathUtils.clamp(
          config.referenceFov + aspectDelta * config.responsiveFovPerAspectDelta,
          config.referenceFov,
          config.referenceFov + 3.2
        );
        camera.updateProjectionMatrix();

        const lookAt = assembledCenter.clone().add(config.compositionBias);
        const refPos = config.referencePos.clone();
        refPos.y += aspectDelta * config.responsiveLiftPerAspectDelta;
        refPos.z += aspectDelta * config.responsiveDollyPerAspectDelta;
        const camDir = refPos.clone().sub(config.referenceTarget).normalize();
        let dist = refPos.distanceTo(config.referenceTarget);

        const fovRad = THREE.MathUtils.degToRad(camera.fov);
        const safeScaleX = Math.max(0.2, 1 - config.safeEdgeMarginX * 2);
        const safeScaleY = Math.max(0.2, 1 - config.safeEdgeMarginY * 2);
        const distV = (assembledSize.y * 0.5) / (Math.tan(fovRad / 2) * safeScaleY);
        const distH = (assembledSize.x * 0.5) / (Math.tan(fovRad / 2) * camera.aspect * safeScaleX);
        const distD = assembledSize.z * 0.96;
        const fitDist = Math.max(distV, distH, distD) * config.safeFitPadding;
        dist = THREE.MathUtils.clamp(Math.max(dist, fitDist), config.safeDistanceMin, config.safeDistanceMax);

        camera.position.copy(lookAt).add(camDir.multiplyScalar(dist));
        camera.lookAt(lookAt);
        return;
      }
      camera.updateProjectionMatrix();

      const fovRad = (camera.fov * Math.PI) / 180;
      const distV = (assembledSize.y * 0.5) / Math.tan(fovRad / 2);
      const distH = (assembledSize.x * 0.5) / (Math.tan(fovRad / 2) * camera.aspect);
      const distD = assembledSize.z * 0.95;
      const camDir = config.referencePos.clone().sub(config.referenceTarget).normalize();
      const dist = THREE.MathUtils.clamp(
        Math.max(distV, distH, distD) * config.safeFitPadding,
        config.safeDistanceMin,
        config.safeDistanceMax
      );
      const lookAt = assembledCenter.clone().add(config.compositionBias);
      camera.position.copy(lookAt).add(camDir.multiplyScalar(dist));
      camera.lookAt(lookAt);
    };

    applyCamera();

    const pointer = new THREE.Vector2(999, 999);
    const raycaster = new THREE.Raycaster();
    const handsetPickables: THREE.Object3D[] = [handsetPivot];

    const internal = {
      phase: 'assembling' as Phase,
      assembleStart: performance.now(),
      assembledFired: false,
      connected: false,
      hover: false,
    };

    const setStatus = (s: string) => callbacksRef.current.onStatusChange?.(s);

    const syncFromPropPhase = (phaseProp?: Phase) => {
      if (!phaseProp) return;
      if (phaseProp === 'assembling') {
        internal.phase = 'assembling';
        internal.connected = false;
        internal.assembledFired = false;
        internal.assembleStart = performance.now();
        setStatus('Assembling');
        for (const p of parts) applyPose(p.obj, p.start);
      } else if (phaseProp === 'ringing') {
        internal.phase = 'ringing';
        internal.connected = false;
        setStatus('Ringing');
        for (const p of parts) applyPose(p.obj, p.target);
      } else if (phaseProp === 'connected') {
        internal.phase = 'connected';
        internal.connected = true;
        setStatus('Connected');
        for (const p of parts) applyPose(p.obj, p.target);
      }
      callbacksRef.current.onConnectedChange?.(internal.connected);
    };

    syncFromPropPhase(props.phase);
    (internal as any).lastExternalPhase = props.phase;

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    };

    const onPointerLeave = () => {
      pointer.set(999, 999);
      if (internal.hover) {
        internal.hover = false;
        renderer.domElement.style.cursor = 'default';
      }
    };

    const onClick = () => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(handsetPickables, true);
      if (hits.length === 0) return;

      if (internal.phase === 'ringing') {
        internal.phase = 'connected';
        internal.connected = true;
        setStatus('Connected');
        callbacksRef.current.onConnectedChange?.(true);
        callbacksRef.current.onAnswered?.();
        callbacksRef.current.onPickedUp?.();
      } else if (internal.phase === 'connected') {
        internal.phase = 'ringing';
        internal.connected = false;
        setStatus('Ringing');
        callbacksRef.current.onConnectedChange?.(false);
        callbacksRef.current.onHungUp?.();
        callbacksRef.current.onHangUp?.();
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('click', onClick);

    const onResize = () => {
      applyCamera();
    };
    window.addEventListener('resize', onResize);

    let raf = 0;

    const tick = () => {
      const now = performance.now();

      const phaseProp = phaseRef.current;
      if (phaseProp && phaseProp !== (internal as any).lastExternalPhase) {
        (internal as any).lastExternalPhase = phaseProp;
        syncFromPropPhase(phaseProp);
      }

      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(handsetPickables, true);
      const hovering = hits.length > 0 && (internal.phase === 'ringing' || internal.phase === 'connected');
      if (hovering !== internal.hover) {
        internal.hover = hovering;
        renderer.domElement.style.cursor = hovering ? 'pointer' : 'default';
      }

      if (internal.phase === 'assembling') {
        const t = clamp01((now - internal.assembleStart) / ASSEMBLY_DURATION_MS);
        for (const p of parts) {
          const sequence = ASSEMBLY_PART_SEQUENCE[p.name] ?? { phase: 'body' as AssemblyPhaseName, order: 0 };
          const phaseTiming = ASSEMBLY_PHASE_TIMINGS[sequence.phase];
          const start = phaseTiming.start + sequence.order * phaseTiming.partStagger;
          const local = clamp01((t - start) / phaseTiming.partDuration);
          lerpPose(p.obj, p.start, p.target, easeInOutCubic(local));

          if (local > phaseTiming.settleStart) {
            const u = clamp01((local - phaseTiming.settleStart) / (1 - phaseTiming.settleStart));
            const settle = -Math.sin(u * Math.PI) * (1 - u) * phaseTiming.settleAmp;
            p.obj.position.y += settle;
          }
        }

        if (t >= 1 && !internal.assembledFired) {
          internal.assembledFired = true;
          internal.phase = 'ringing';
          internal.connected = false;
          setStatus('Ringing');
          callbacksRef.current.onConnectedChange?.(false);
          callbacksRef.current.onAssembled?.();
        }
      } else {
        for (const p of parts) applyPose(p.obj, p.target);

        if (internal.phase === 'ringing') {
          const s = Math.sin(now * RING_FREQ);
          const s2 = Math.sin(now * (RING_FREQ * 0.7) + 0.8);

          handsetPivot.position.set(
            handsetPivotBase.x,
            handsetPivotBase.y + Math.max(0, s) * RING_BOB,
            handsetPivotBase.z + s2 * 0.008
          );
          handsetPivot.rotation.x = s2 * RING_WOBBLE_PITCH;
          handsetPivot.rotation.z = s * RING_WOBBLE_ROLL;

          plungerL.position.y = plungerBaseY + Math.max(0, s) * RING_PLUNGER_BOUNCE;
          plungerR.position.y = plungerBaseY + Math.max(0, -s) * RING_PLUNGER_BOUNCE;
        } else if (internal.phase === 'connected') {
          handsetPivot.position.set(handsetPivotBase.x, handsetPivotBase.y + 0.18, handsetPivotBase.z + 0.09);
          handsetPivot.rotation.x = 0.28;
          handsetPivot.rotation.z = 0.2;
          plungerL.position.y = plungerBaseY - 0.02;
          plungerR.position.y = plungerBaseY - 0.02;
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };

    setStatus(
      props.phase
        ? props.phase === 'assembling'
          ? 'Assembling'
          : props.phase === 'ringing'
            ? 'Ringing'
            : 'Connected'
        : 'Assembling'
    );

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('click', onClick);

      ringTex.dispose();

      scene.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.());
          else o.material.dispose?.();
        }
      });

      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // no-op: phase sync is done in render loop to avoid scene reinitialization.
  }, [props.phase]);

  return <div ref={mountRef} className='w-full h-full' />;
}
