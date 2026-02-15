"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type ProjectsFieldWebGLProps = {
  className?: string;
};

const PROJECTS_FIELD_SEED = 811279;

function createSeededRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRunwayBumpTexture(rng: () => number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 32000; i++) {
    const x = rng() * c.width;
    const y = rng() * c.height;
    const shade = 110 + Math.floor(rng() * 46);
    const alpha = 0.015 + rng() * 0.03;
    const size = 0.6 + rng() * 1.2;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    ctx.fillRect(x, y, size, size);
  }

  for (let i = 0; i < 7000; i++) {
    const x = rng() * c.width;
    const y = rng() * c.height;
    const len = 2 + rng() * 8;
    const angle = rng() * Math.PI * 2;
    const shade = 98 + Math.floor(rng() * 34);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.03 + rng() * 0.04})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(26, 220);
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function makeCenterRibbonTexture(rng: () => number) {
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 2048;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const gy = ctx.createLinearGradient(0, 0, 0, c.height);
  gy.addColorStop(0, "rgba(205,221,248,0)");
  gy.addColorStop(0.25, "rgba(206,224,252,0.05)");
  gy.addColorStop(0.7, "rgba(220,236,255,0.17)");
  gy.addColorStop(1, "rgba(242,248,255,0.25)");
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.globalCompositeOperation = "destination-in";
  const gx = ctx.createLinearGradient(0, 0, c.width, 0);
  gx.addColorStop(0, "rgba(255,255,255,0)");
  gx.addColorStop(0.35, "rgba(255,255,255,0.14)");
  gx.addColorStop(0.5, "rgba(255,255,255,1)");
  gx.addColorStop(0.65, "rgba(255,255,255,0.14)");
  gx.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < 1500; i++) {
    const x = c.width * 0.5 + (rng() - 0.5) * 60;
    const y = rng() * c.height;
    const alpha = 0.015 + rng() * 0.03;
    ctx.fillStyle = `rgba(232,242,255,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeEdgeSpillTexture(fromLeft: boolean) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 2048;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  const gx = ctx.createLinearGradient(0, 0, c.width, 0);
  if (fromLeft) {
    gx.addColorStop(0, "rgba(226,236,255,0.36)");
    gx.addColorStop(0.42, "rgba(214,228,252,0.11)");
    gx.addColorStop(1, "rgba(210,226,251,0)");
  } else {
    gx.addColorStop(0, "rgba(210,226,251,0)");
    gx.addColorStop(0.58, "rgba(214,228,252,0.11)");
    gx.addColorStop(1, "rgba(226,236,255,0.36)");
  }
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.globalCompositeOperation = "destination-in";
  const gy = ctx.createLinearGradient(0, 0, 0, c.height);
  gy.addColorStop(0, "rgba(255,255,255,0.18)");
  gy.addColorStop(0.34, "rgba(255,255,255,0.42)");
  gy.addColorStop(1, "rgba(255,255,255,0.72)");
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, c.width, c.height);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function makeHazeTexture(rng: () => number) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, c.width, c.height);

  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "rgba(178,198,232,0)");
  g.addColorStop(0.5, "rgba(166,188,224,0.07)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  for (let i = 0; i < 3600; i++) {
    const x = rng() * c.width;
    const y = rng() * c.height;
    const alpha = 0.008 + rng() * 0.026;
    ctx.fillStyle = `rgba(224,236,255,${alpha})`;
    ctx.fillRect(x, y, 1, 1);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1.2, 1);
  tex.needsUpdate = true;
  return tex;
}

export function ProjectsFieldWebGL({ className }: ProjectsFieldWebGLProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const rng = createSeededRng(PROJECTS_FIELD_SEED);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020308);
    scene.fog = new THREE.FogExp2(0x020308, 0.0175);

    const camera = new THREE.PerspectiveCamera(49, 1, 0.1, 420);
    const cameraTarget = new THREE.Vector3(0, -1.25, -150);
    camera.position.set(0, 2.24, 15.8);
    camera.lookAt(cameraTarget);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(1.6, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.17;
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x435068, 0.22);
    scene.add(ambient);

    const moon = new THREE.DirectionalLight(0xb7ccf7, 0.85);
    moon.position.set(9, 12, 4);
    scene.add(moon);

    const softbox = new THREE.DirectionalLight(0xf4f8ff, 0.44);
    softbox.position.set(0, 5.2, 18);
    scene.add(softbox);

    const fill = new THREE.DirectionalLight(0x647599, 0.2);
    fill.position.set(-8, 3, -7);
    scene.add(fill);

    const runwayY = -1.72;
    const runwayWidth = 15.2;
    const runwayLength = 340;
    const runwayCenterZ = -150;

    const worldGeo = new THREE.PlaneGeometry(300, 460);
    worldGeo.rotateX(-Math.PI / 2);
    const worldMat = new THREE.MeshStandardMaterial({
      color: 0x02040a,
      roughness: 0.98,
      metalness: 0.02,
    });
    const world = new THREE.Mesh(worldGeo, worldMat);
    world.position.set(0, runwayY - 0.05, runwayCenterZ - 14);
    scene.add(world);

    const bumpTex = makeRunwayBumpTexture(rng);
    const runwayGeo = new THREE.PlaneGeometry(runwayWidth, runwayLength, 8, 340);
    runwayGeo.rotateX(-Math.PI / 2);
    const runwayMat = new THREE.MeshPhysicalMaterial({
      color: 0x070b12,
      roughness: 0.23,
      metalness: 0.1,
      clearcoat: 0.72,
      clearcoatRoughness: 0.33,
      reflectivity: 0.68,
      emissive: 0x03060b,
      emissiveIntensity: 0.19,
      bumpMap: bumpTex || undefined,
      bumpScale: 0.02,
    });
    const runway = new THREE.Mesh(runwayGeo, runwayMat);
    runway.position.set(0, runwayY, runwayCenterZ);
    scene.add(runway);

    const edgeCasingGeo = new THREE.BoxGeometry(0.22, 0.04, runwayLength * 0.985);
    const edgeCasingMat = new THREE.MeshStandardMaterial({
      color: 0x0d121b,
      roughness: 0.56,
      metalness: 0.12,
    });
    const edgeOffset = runwayWidth * 0.5 - 0.25;
    const edgeCaseLeft = new THREE.Mesh(edgeCasingGeo, edgeCasingMat);
    edgeCaseLeft.position.set(-edgeOffset, runwayY + 0.02, runwayCenterZ);
    scene.add(edgeCaseLeft);
    const edgeCaseRight = new THREE.Mesh(edgeCasingGeo, edgeCasingMat);
    edgeCaseRight.position.set(edgeOffset, runwayY + 0.02, runwayCenterZ);
    scene.add(edgeCaseRight);

    const edgeGlowGeo = new THREE.PlaneGeometry(0.12, runwayLength * 0.98);
    edgeGlowGeo.rotateX(-Math.PI / 2);
    const edgeGlowMat = new THREE.MeshStandardMaterial({
      color: 0x1d2636,
      emissive: 0xeaf2ff,
      emissiveIntensity: 1.28,
      roughness: 0.34,
      metalness: 0.06,
    });
    const edgeLeft = new THREE.Mesh(edgeGlowGeo, edgeGlowMat);
    edgeLeft.position.set(-edgeOffset, runwayY + 0.041, runwayCenterZ);
    scene.add(edgeLeft);
    const edgeRight = new THREE.Mesh(edgeGlowGeo, edgeGlowMat);
    edgeRight.position.set(edgeOffset, runwayY + 0.041, runwayCenterZ);
    scene.add(edgeRight);

    const spillLeftTex = makeEdgeSpillTexture(true);
    const spillRightTex = makeEdgeSpillTexture(false);
    const spillGeo = new THREE.PlaneGeometry(3, runwayLength * 0.96, 1, 1);
    spillGeo.rotateX(-Math.PI / 2);
    const spillLeftMat = new THREE.MeshBasicMaterial({
      map: spillLeftTex || undefined,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const spillLeft = new THREE.Mesh(spillGeo, spillLeftMat);
    spillLeft.position.set(-edgeOffset + 1.52, runwayY + 0.018, runwayCenterZ);
    scene.add(spillLeft);

    const spillRightMat = new THREE.MeshBasicMaterial({
      map: spillRightTex || undefined,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const spillRight = new THREE.Mesh(spillGeo, spillRightMat);
    spillRight.position.set(edgeOffset - 1.52, runwayY + 0.018, runwayCenterZ);
    scene.add(spillRight);

    const fixtureBaseGeo = new THREE.BoxGeometry(0.34, 0.055, 0.9);
    const fixtureBaseMat = new THREE.MeshStandardMaterial({
      color: 0x0f1520,
      roughness: 0.64,
      metalness: 0.08,
    });
    const fixtureLensGeo = new THREE.BoxGeometry(0.19, 0.018, 0.56);
    const fixtureLensMat = new THREE.MeshStandardMaterial({
      color: 0x232e42,
      emissive: 0xeef5ff,
      emissiveIntensity: 2.15,
      roughness: 0.42,
      metalness: 0.06,
    });
    const fixtureLights: THREE.PointLight[] = [];
    const fixtureCount = 16;
    const fixtureStartZ = 12;
    const fixtureStep = 19.5;
    for (let i = 0; i < fixtureCount; i++) {
      const z = fixtureStartZ - i * fixtureStep;
      const sideX = edgeOffset - 0.04;
      const leftBase = new THREE.Mesh(fixtureBaseGeo, fixtureBaseMat);
      leftBase.position.set(-sideX, runwayY + 0.027, z);
      scene.add(leftBase);
      const leftLens = new THREE.Mesh(fixtureLensGeo, fixtureLensMat);
      leftLens.position.set(-sideX, runwayY + 0.054, z);
      scene.add(leftLens);
      const leftLight = new THREE.PointLight(0xe9f1ff, 0.22, 3.3, 2);
      leftLight.position.set(-sideX + 0.32, runwayY + 0.2, z);
      scene.add(leftLight);
      fixtureLights.push(leftLight);

      const rightBase = new THREE.Mesh(fixtureBaseGeo, fixtureBaseMat);
      rightBase.position.set(sideX, runwayY + 0.027, z);
      scene.add(rightBase);
      const rightLens = new THREE.Mesh(fixtureLensGeo, fixtureLensMat);
      rightLens.position.set(sideX, runwayY + 0.054, z);
      scene.add(rightLens);
      const rightLight = new THREE.PointLight(0xe9f1ff, 0.22, 3.3, 2);
      rightLight.position.set(sideX - 0.32, runwayY + 0.2, z);
      scene.add(rightLight);
      fixtureLights.push(rightLight);
    }

    const ribbonTex = makeCenterRibbonTexture(rng);
    const ribbonGeo = new THREE.PlaneGeometry(3.3, runwayLength * 0.95, 1, 1);
    ribbonGeo.rotateX(-Math.PI / 2);
    const ribbonMat = new THREE.MeshBasicMaterial({
      map: ribbonTex || undefined,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.position.set(0, runwayY + 0.015, runwayCenterZ - 2);
    scene.add(ribbon);

    const hazeTex = makeHazeTexture(rng);
    const nearHazeMat = new THREE.MeshBasicMaterial({
      map: hazeTex || undefined,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const nearHaze = new THREE.Mesh(new THREE.PlaneGeometry(120, 14), nearHazeMat);
    nearHaze.position.set(0, -0.26, -70);
    scene.add(nearHaze);

    const farHazeMat = new THREE.MeshBasicMaterial({
      map: hazeTex || undefined,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const farHaze = new THREE.Mesh(new THREE.PlaneGeometry(176, 28), farHazeMat);
    farHaze.position.set(0, 1.06, -182);
    scene.add(farHaze);

    const starCount = 3600;
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(starCount * 3);
    const starSize = new Float32Array(starCount);
    const starPhase = new Float32Array(starCount);
    const starSpeed = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
      const depth = 40 + Math.pow(rng(), 0.43) * 226;
      const spread = 90 + depth * 0.19;
      starPos[i * 3 + 0] = (rng() - 0.5) * spread;
      starPos[i * 3 + 1] = 10 + Math.pow(rng(), 0.24) * 96;
      starPos[i * 3 + 2] = -depth;
      const heroStar = rng() > 0.955;
      starSize[i] = heroStar ? 1.75 + rng() * 1.9 : 0.62 + rng() * 1.02;
      starPhase[i] = rng() * Math.PI * 2;
      starSpeed[i] = 0.74 + rng() * 0.74;
    }

    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute("aSize", new THREE.BufferAttribute(starSize, 1));
    starGeo.setAttribute("aPhase", new THREE.BufferAttribute(starPhase, 1));
    starGeo.setAttribute("aSpeed", new THREE.BufferAttribute(starSpeed, 1));

    const starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 1.18 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        varying float vPhase;
        varying float vSpeed;
        varying float vDepth;
        void main() {
          vPhase = aPhase;
          vSpeed = aSpeed;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vDepth = clamp((-mvPosition.z - 12.0) / 220.0, 0.0, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * (240.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying float vPhase;
        varying float vSpeed;
        varying float vDepth;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          float disc = smoothstep(0.5, 0.0, d);
          float core = smoothstep(0.24, 0.0, d);
          float twinkle = 0.9 + 0.1 * sin(uTime * (0.84 + vSpeed * 0.62) + vPhase);
          float alpha = disc * twinkle * mix(0.56, 1.0, vDepth) * uOpacity;
          if (alpha < 0.01) discard;
          vec3 color = mix(vec3(0.78, 0.86, 1.0), vec3(1.0), core);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);

    let raf = 0;
    let lastT = performance.now();

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const tt = t * 0.001;

      if (hazeTex) {
        hazeTex.offset.x = (hazeTex.offset.x + dt * 0.0009) % 1;
      }
      nearHaze.position.y = -0.26 + Math.sin(tt * 0.1) * 0.012;
      farHaze.position.y = 1.06 + Math.sin(tt * 0.08) * 0.018;

      const starUniforms = starMaterial.uniforms as { uTime: { value: number } };
      starUniforms.uTime.value = tt;

      camera.position.x = Math.sin(tt * 0.024) * 0.02;
      camera.position.y = 2.24 + Math.sin(tt * 0.018) * 0.008;
      camera.lookAt(cameraTarget);

      renderer.render(scene, camera);
      if (!prefersReduced) {
        raf = requestAnimationFrame(tick);
      }
    };

    renderer.render(scene, camera);
    if (!prefersReduced) {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();

      starGeo.dispose();
      starMaterial.dispose();

      worldGeo.dispose();
      worldMat.dispose();

      runwayGeo.dispose();
      runwayMat.dispose();
      if (bumpTex) bumpTex.dispose();

      edgeCasingGeo.dispose();
      edgeCasingMat.dispose();
      edgeGlowGeo.dispose();
      edgeGlowMat.dispose();

      fixtureBaseGeo.dispose();
      fixtureBaseMat.dispose();
      fixtureLensGeo.dispose();
      fixtureLensMat.dispose();
      for (const fixtureLight of fixtureLights) {
        fixtureLight.dispose();
      }

      spillGeo.dispose();
      spillLeftMat.dispose();
      spillRightMat.dispose();
      if (spillLeftTex) spillLeftTex.dispose();
      if (spillRightTex) spillRightTex.dispose();

      ribbonGeo.dispose();
      ribbonMat.dispose();
      if (ribbonTex) ribbonTex.dispose();

      nearHaze.geometry.dispose();
      nearHazeMat.dispose();
      farHaze.geometry.dispose();
      farHazeMat.dispose();
      if (hazeTex) hazeTex.dispose();

      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={"pointer-events-none absolute inset-0 z-0 overflow-hidden " + (className ? className : "")}
      aria-hidden="true"
    />
  );
}

export default ProjectsFieldWebGL;
