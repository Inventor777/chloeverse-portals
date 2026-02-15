"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PolaroidCameraAssembly3D, {
  type LensProjection,
  type ScreenAnchorPx,
} from "@/components/PolaroidCameraAssembly3D";
import { ReturnButton } from "@/components/ReturnButton";
import * as portalData from "@/lib/portalData";

type ScenePhase =
  | "lens_intro"
  | "lens_closeup"
  | "dolly_out"
  | "ready"
  | "capturing"
  | "ejecting"
  | "connected"
  | "retracting";

type ContactStatus = "Assembling" | "Ready" | "Capturing" | "Ejecting" | "Connected";

type ContactHeroProps = {
  onStatusChange?: (status: ContactStatus) => void;
};

type ContactRow = {
  label: string;
  value: string;
};

type ContactInfoShape = {
  title?: string;
  subtitle?: string;
  items?: Array<{ label?: string; value?: string }>;
};

const BEATS = {
  blackHoldEnd: 0.4,
  glowAppearEnd: 0.95,
  glowTravelEnd: 1.95,
  ringStart: 0.55,
  ringPeakEnd: 2.9,
  ringFadeEnd: 4.75,
  irisStart: 1.95,
  irisTightEnd: 4.25,
  overlayFadeStart: 4.25,
  overlayFadeEnd: 4.75,
  closeupEnd: 4.8,
  readyAt: 6.0,
  captureToEject: 0.22,
  ejectDone: 1.45,
} as const;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function mix(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

function hash2(a: number, b: number) {
  const n = Math.sin(a * 127.1 + b * 311.7 + 17.17) * 43758.5453123;
  return n - Math.floor(n);
}

function ringNoise(ring: number, theta: number) {
  const sector = Math.floor((theta / (Math.PI * 2)) * 96);
  const n = hash2(ring * 19.37 + 3.1, sector * 5.17 + 1.7);
  return (n - 0.5) * 2;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

export function PolaroidContactHero({ onStatusChange }: ContactHeroProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const contact = portalData.contactInfo as ContactInfoShape;

  const title = typeof contact?.title === "string" && contact.title.trim() ? contact.title.trim() : "CONTACT";
  const subtitle =
    typeof contact?.subtitle === "string" && contact.subtitle.trim()
      ? contact.subtitle.trim()
      : "Lets build something unreal.";

  const contactRows = useMemo<ContactRow[]>(() => {
    if (!Array.isArray(contact?.items)) return [];
    return contact.items.map((item, index) => ({
      label: typeof item?.label === "string" && item.label.trim() ? item.label : `CHANNEL ${index + 1}`,
      value: typeof item?.value === "string" ? item.value : "",
    }));
  }, [contact]);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const fxCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const portalDebugRef = useRef(false);

  const phaseRef = useRef<ScenePhase>("lens_intro");
  const introTRef = useRef(0);
  const clockStartRef = useRef<number | null>(null);
  const captureStartRef = useRef<number | null>(null);
  const retractStartRef = useRef<number | null>(null);
  const lensRef = useRef<LensProjection | null>(null);

  const [phase, setPhase] = useState<ScenePhase>("lens_intro");
  const [status, setStatus] = useState<ContactStatus>("Assembling");
  const [introT, setIntroT] = useState(0);
  const [flashAlpha, setFlashAlpha] = useState(0);
  const [captureNonce, setCaptureNonce] = useState(0);
  const [retractNonce, setRetractNonce] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [lensProject, setLensProject] = useState<LensProjection | null>(null);
  const [cardAnchorPx, setCardAnchorPx] = useState<ScreenAnchorPx | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    introTRef.current = introT;
  }, [introT]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    portalDebugRef.current = new URLSearchParams(window.location.search).get("portalDebug") === "1";
  }, []);

  const debugLog = useCallback((message: string) => {
    if (!portalDebugRef.current) return;
    console.log(`[contact] ${message}`);
  }, []);

  const setPhaseSafe = useCallback(
    (next: ScenePhase) => {
      const prev = phaseRef.current;
      if (prev === next) return;
      phaseRef.current = next;
      setPhase(next);
      if (next === "ready") {
        debugLog("READY");
      }
    },
    [debugLog]
  );

  const setStatusSafe = useCallback((next: ContactStatus) => {
    setStatus((prev) => (prev === next ? prev : next));
  }, []);

  const onLensProject = useCallback((next: LensProjection) => {
    lensRef.current = next;
    setLensProject(next);
  }, []);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const updateSize = () => setStageSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    updateSize();
    return () => observer.disconnect();
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }
    void audioContextRef.current.resume();
  }, []);

  const playShutterClick = useCallback(() => {
    ensureAudioContext();
    const ctx = audioContextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime + 0.002;

    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.035), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const n = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      data[i] = (n * 2 - 1) * Math.exp((-7 * i) / data.length);
    }

    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noise;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.14, now + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
    noiseSrc.connect(noiseGain).connect(ctx.destination);
    noiseSrc.start(now);
    noiseSrc.stop(now + 0.045);

    const tickOsc = ctx.createOscillator();
    tickOsc.type = "sine";
    tickOsc.frequency.setValueAtTime(1320, now);
    tickOsc.frequency.exponentialRampToValueAtTime(780, now + 0.04);
    const tickGain = ctx.createGain();
    tickGain.gain.setValueAtTime(0.0001, now);
    tickGain.gain.exponentialRampToValueAtTime(0.12, now + 0.003);
    tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    tickOsc.connect(tickGain).connect(ctx.destination);
    tickOsc.start(now);
    tickOsc.stop(now + 0.06);
  }, [ensureAudioContext]);

  const startCapture = useCallback(() => {
    if (phaseRef.current !== "ready") return;
    debugLog("CAPTURE TRIGGERED");
    playShutterClick();
    captureStartRef.current = performance.now();
    retractStartRef.current = null;
    setPhaseSafe("capturing");
    setCaptureNonce((value) => value + 1);
    setStatusSafe("Capturing");
  }, [debugLog, playShutterClick, setPhaseSafe, setStatusSafe]);

  const onPutBack = useCallback(() => {
    if (phaseRef.current !== "connected") return;
    debugLog("PUT BACK TRIGGERED");
    setRetractNonce((value) => value + 1);
    retractStartRef.current = performance.now();
    captureStartRef.current = null;
    setPhaseSafe("retracting");
    setStatusSafe("Assembling");
  }, [debugLog, setPhaseSafe, setStatusSafe]);

  const drawIntroOverlay = useCallback((nowMs: number) => {
    const canvas = fxCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderWidth = Math.round(width * dpr);
    const renderHeight = Math.round(height * dpr);

    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const fxT = introTRef.current;
    const frame = Math.floor(fxT * 60);
    const minDim = Math.min(width, height);
    const maxDim = Math.max(width, height);

    const lens = lensRef.current;
    const lensX = clamp(lens?.visible ? lens.x : width * 0.59, 0, width);
    const lensY = clamp(lens?.visible ? lens.y : height * 0.28, 0, height);
    const startX = clamp(lensX + minDim * 0.3, 0, width);
    const startY = clamp(lensY - minDim * 0.24, 0, height);
    const ctrlX = mix(startX, lensX, 0.45) - minDim * 0.06;
    const ctrlY = mix(startY, lensY, 0.45) + minDim * 0.02;

    const appearT = smoothstep(BEATS.blackHoldEnd, BEATS.glowAppearEnd, fxT);
    const travelT = smoothstep(BEATS.glowAppearEnd, BEATS.glowTravelEnd, fxT);
    const omt = 1 - travelT;
    const bezierX = omt * omt * startX + 2 * omt * travelT * ctrlX + travelT * travelT * lensX;
    const bezierY = omt * omt * startY + 2 * omt * travelT * ctrlY + travelT * travelT * lensY;
    const holdX = mix(startX, mix(startX, lensX, 0.08), appearT);
    const holdY = mix(startY, mix(startY, lensY, 0.06), appearT);
    const glowLocked = fxT >= BEATS.glowTravelEnd;
    const cx = fxT < BEATS.glowAppearEnd ? holdX : glowLocked ? lensX : bezierX;
    const cy = fxT < BEATS.glowAppearEnd ? holdY : glowLocked ? lensY : bezierY;

    const blackHold = 1 - smoothstep(0, BEATS.blackHoldEnd, fxT);
    const preIris = smoothstep(BEATS.blackHoldEnd, BEATS.glowTravelEnd, fxT);
    const irisT = smoothstep(BEATS.irisStart, BEATS.irisTightEnd, fxT);
    const introFade = 1 - smoothstep(BEATS.overlayFadeStart, BEATS.overlayFadeEnd, fxT);
    const lensRadius = lens?.visible ? lens.r : minDim * 0.065;
    const fxScale = mix(1.16, 1, smoothstep(0.55, BEATS.glowTravelEnd, fxT));
    const useFxScale = fxT >= BEATS.blackHoldEnd && fxT <= BEATS.glowTravelEnd;

    const setBaseTransform = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const setFxTransform = () => {
      if (!useFxScale) {
        setBaseTransform();
        return;
      }
      ctx.setTransform(dpr * fxScale, 0, 0, dpr * fxScale, (1 - fxScale) * cx * dpr, (1 - fxScale) * cy * dpr);
    };

    const baseDark =
      fxT < BEATS.blackHoldEnd
        ? 1
        : fxT < BEATS.glowTravelEnd
          ? mix(0.92, 0.54, preIris)
          : fxT < BEATS.irisTightEnd
            ? mix(0.54, 0.3, irisT)
            : mix(0.3, 0.08, 1 - introFade);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(1,2,6,${(baseDark * introFade).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);

    const grainAlpha = fxT < BEATS.overlayFadeEnd ? 0.02 : 0.014;
    for (let i = 0; i < 280; i += 1) {
      const x = hash2(i, frame * 7 + 3) * width;
      const y = hash2(i + 19, frame * 5 + 11) * height;
      const a = grainAlpha * (0.45 + hash2(i + 37, frame * 3 + 13) * 0.55);
      ctx.fillStyle = `rgba(236,241,252,${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const ringBoost = 1 + 0.28 * smoothstep(1.1, 1.4, fxT) * (1 - smoothstep(2.6, 2.9, fxT));
    const ringStrength =
      smoothstep(BEATS.ringStart, 1.04, fxT) *
      (1 - smoothstep(BEATS.ringPeakEnd, BEATS.ringFadeEnd, fxT)) *
      introFade *
      ringBoost;
    const bloomStrength =
      smoothstep(BEATS.blackHoldEnd, BEATS.glowAppearEnd, fxT) *
      (1 - smoothstep(3.0, BEATS.ringFadeEnd, fxT)) *
      introFade;

    if (bloomStrength > 0.001) {
      setFxTransform();
      const bloomRadius = mix(lensRadius * 0.8, maxDim * 0.62, preIris);
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, bloomRadius);
      bloom.addColorStop(0, "rgba(248,251,255,0.9)");
      bloom.addColorStop(0.22, "rgba(224,232,246,0.55)");
      bloom.addColorStop(0.48, "rgba(126,140,162,0.2)");
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.58 * bloomStrength;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, width, height);
      setBaseTransform();
    }

    if (ringStrength > 0.001) {
      setFxTransform();
      const ringCount = 10;
      const segmentCount = 108;
      const ringScale = mix(0.9, 1.18, preIris);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < ringCount; i += 1) {
        const local = i / (ringCount - 1);
        const baseR = mix(lensRadius * 1.2, lensRadius * 6.4, local) * ringScale;

        for (let step = 0; step < segmentCount; step += 1) {
          const th0 = (step / segmentCount) * Math.PI * 2;
          const th1 = ((step + 1) / segmentCount) * Math.PI * 2;
          const r0 =
            baseR *
            (1 +
              0.017 * Math.sin(th0 * (3.2 + i * 0.28) + i * 0.36) +
              0.014 * ringNoise(i, th0));
          const r1 =
            baseR *
            (1 +
              0.017 * Math.sin(th1 * (3.2 + i * 0.28) + i * 0.36) +
              0.014 * ringNoise(i, th1));

          const segVar = 0.7 + 0.3 * hash2(i * 1.7 + 9.1, step * 2.1 + 7.4);
          const alpha = (0.058 + (1 - local) * 0.054) * segVar * ringStrength;

          ctx.lineCap = "round";
          ctx.strokeStyle = `rgba(194,208,234,${(alpha * 0.66).toFixed(3)})`;
          ctx.lineWidth = mix(6.1, 2.8, local);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th0) * r0, cy + Math.sin(th0) * r0);
          ctx.lineTo(cx + Math.cos(th1) * r1, cy + Math.sin(th1) * r1);
          ctx.stroke();

          ctx.strokeStyle = `rgba(224,233,248,${alpha.toFixed(3)})`;
          ctx.lineWidth = mix(1.8, 0.9, local);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(th0) * r0, cy + Math.sin(th0) * r0);
          ctx.lineTo(cx + Math.cos(th1) * r1, cy + Math.sin(th1) * r1);
          ctx.stroke();
        }
      }
      setBaseTransform();
    }

    setFxTransform();
    const innerR = mix(0.95 * minDim, 0.22 * minDim, irisT);
    const outerR = innerR * 2.25;
    const vignette = ctx.createRadialGradient(lensX, lensY, innerR, lensX, lensY, outerR);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.44, "rgba(0,0,0,0.04)");
    vignette.addColorStop(0.7, "rgba(0,0,0,0.19)");
    vignette.addColorStop(1, "rgba(0,0,0,0.56)");
    ctx.globalCompositeOperation = "source-over";
    const ringVisibilityWindow = smoothstep(1.1, 1.4, fxT) * (1 - smoothstep(2.6, 2.9, fxT));
    const irisOpacity = (0.18 + irisT * 0.28 + blackHold * 0.24) * (1 - 0.24 * ringVisibilityWindow);
    ctx.globalAlpha = clamp01(irisOpacity * introFade);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
    setBaseTransform();

    const residual = smoothstep(BEATS.overlayFadeEnd, 5.4, fxT);
    if (residual > 0.001 || fxT > BEATS.overlayFadeEnd) {
      setFxTransform();
      const subtle = ctx.createRadialGradient(lensX, lensY, minDim * 0.12, lensX, lensY, maxDim * 0.95);
      subtle.addColorStop(0, "rgba(255,255,255,0.015)");
      subtle.addColorStop(1, "rgba(0,0,0,0.24)");
      ctx.globalAlpha = mix(0.03, 0.08, residual);
      ctx.fillStyle = subtle;
      ctx.fillRect(0, 0, width, height);
      setBaseTransform();
    }

    void nowMs;
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      clockStartRef.current = performance.now() - BEATS.readyAt * 1000;
    }

    const tick = (now: number) => {
      if (clockStartRef.current === null) {
        clockStartRef.current = now;
      }

      const currentPhase = phaseRef.current;
      const elapsedIntro = Math.max(0, (now - clockStartRef.current) / 1000);

      if (
        currentPhase === "lens_intro" ||
        currentPhase === "lens_closeup" ||
        currentPhase === "dolly_out" ||
        currentPhase === "ready"
      ) {
        const t = Math.min(BEATS.readyAt, elapsedIntro);
        setIntroT(t);

        if (t < 1.7) {
          setPhaseSafe("lens_intro");
          setStatusSafe("Assembling");
        } else if (t < BEATS.closeupEnd) {
          setPhaseSafe("lens_closeup");
          setStatusSafe("Assembling");
        } else if (t < BEATS.readyAt) {
          setPhaseSafe("dolly_out");
          setStatusSafe("Assembling");
        } else {
          setPhaseSafe("ready");
          setStatusSafe("Ready");
        }
        setFlashAlpha(0);
      } else if (currentPhase === "capturing" || currentPhase === "ejecting" || currentPhase === "connected") {
        const captureStart = captureStartRef.current ?? now;
        const captureElapsed = Math.max(0, (now - captureStart) / 1000);
        const flashRise = smoothstep(0.01, 0.05, captureElapsed);
        const flashFall = 1 - smoothstep(0.06, 0.14, captureElapsed);
        setFlashAlpha(clamp01(flashRise * flashFall * 0.88));

        if (captureElapsed < BEATS.captureToEject) {
          setStatusSafe("Capturing");
        } else if (captureElapsed < BEATS.ejectDone && currentPhase !== "connected") {
          setPhaseSafe("ejecting");
          setStatusSafe("Ejecting");
        }
        if (captureElapsed > 0.16) setFlashAlpha(0);
      } else if (currentPhase === "retracting") {
        setFlashAlpha(0);
        setStatusSafe("Assembling");
      }

      drawIntroOverlay(now);
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [drawIntroOverlay, prefersReducedMotion, setPhaseSafe, setStatusSafe]);

  const ready = phase === "ready";
  const panelVisible = phase === "connected";
  const anchorX = cardAnchorPx?.visible ? cardAnchorPx.x : lensProject?.visible ? lensProject.x : stageSize.width * 0.55;
  const anchorY = cardAnchorPx?.visible ? cardAnchorPx.y : lensProject?.visible ? lensProject.y : stageSize.height * 0.46;
  const panelWidth = stageSize.width >= 768 ? 590 : clamp(stageSize.width - 36, 300, 620);
  const panelHeight = clamp(336 + contactRows.length * 58, 400, 520);
  const panelLeft = clamp(anchorX - panelWidth * 0.18, 18, Math.max(18, stageSize.width - panelWidth - 18));
  const panelTop = clamp(anchorY - panelHeight * 0.15, 18, Math.max(18, stageSize.height - panelHeight - 18));

  const onStagePointerDown = useCallback(() => {
    ensureAudioContext();
    if (phaseRef.current === "ready") {
      startCapture();
    }
  }, [ensureAudioContext, startCapture]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.03),rgba(0,0,0,0.82)_64%)]" />

      <div
        ref={stageRef}
        className="absolute inset-0 z-[5]"
        style={{ cursor: ready ? "pointer" : "default" }}
        onPointerDown={onStagePointerDown}
      >
        <PolaroidCameraAssembly3D
          phase={phase}
          timelineT={introT}
          captureNonce={captureNonce}
          retractNonce={retractNonce}
          isInteractive={ready}
          onCaptureIntent={startCapture}
          onLensProject={onLensProject}
          onCardAnchorPx={setCardAnchorPx}
          onEjectDone={() => {
            debugLog("EJECT DONE");
            setPhaseSafe("connected");
            setStatusSafe("Connected");
            setFlashAlpha(0);
          }}
          onRetractDone={() => {
            debugLog("RETRACT DONE");
            setPhaseSafe("ready");
            setStatusSafe("Ready");
            setIntroT(BEATS.readyAt);
          }}
        />
      </div>

      <canvas ref={fxCanvasRef} className="pointer-events-none fixed inset-0 z-[14] h-[100vh] w-[100vw]" />
      <div className="pointer-events-none fixed inset-0 z-[18] bg-[#f2f6ff]" style={{ opacity: flashAlpha }} />

      <div className="pointer-events-none absolute left-5 top-6 z-[24] md:left-10 md:top-8">
        <h1 className="text-[2.2rem] font-semibold tracking-[0.14em] text-white/90 md:text-[3.6rem]">{title}</h1>
        <p className="mt-2 text-xs tracking-[0.08em] text-white/56 md:text-sm">{subtitle}</p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/48 md:text-xs">Status {status}</p>
      </div>

      <div className="absolute left-5 top-36 z-[24] md:left-10 md:top-40">
        <ReturnButton label="Return to Chloeverse" />
      </div>

      <AnimatePresence>
        {panelVisible ? (
          <motion.aside
            className="pointer-events-auto absolute z-[40] w-[600px] max-w-[620px] min-w-[560px] overflow-hidden rounded-[1.4rem] border border-white/18 bg-white/[0.08] p-6 shadow-[0_36px_90px_rgba(0,0,0,0.6)] backdrop-blur-[18px] max-md:w-[92vw] max-md:min-w-0 max-md:max-w-[92vw] md:p-7"
            style={{ width: panelWidth, left: panelLeft, top: panelTop }}
            initial={{ opacity: 0, y: 8, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 8, filter: "blur(6px)" }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04)_46%,rgba(0,0,0,0.22))]" />
            <div className="relative">
              <h2 className="text-sm uppercase tracking-[0.22em] text-white/72">CONNECTED</h2>
              <p className="mt-2 text-base tracking-tight text-white/88 md:text-lg">{subtitle}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.12em] text-white/58">Reach out anywhere below</p>

              <div className="mt-6 space-y-3">
                {contactRows.map((row, index) => (
                  <div
                    key={`${row.label}-${index}`}
                    className="grid grid-cols-[118px_1fr] items-center rounded-lg border border-white/14 bg-black/22 px-3.5 py-3"
                  >
                    <span className="text-[11px] uppercase tracking-[0.14em] text-white/56">{row.label}</span>
                    <span className="justify-self-end text-sm text-white/88">{row.value}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={onPutBack}
                className="mt-5 rounded-full border border-white/24 bg-black/34 px-4 py-1.5 text-xs uppercase tracking-[0.14em] text-white/80 transition hover:border-white/38 hover:bg-white/[0.08] hover:text-white"
              >
                Put Back
              </button>
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </main>
  );
}

export default PolaroidContactHero;
