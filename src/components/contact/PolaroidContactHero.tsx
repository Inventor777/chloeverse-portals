"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import PolaroidCameraAssembly3D, {
  type LensProjection,
  type PolaroidCameraAssembly3DHandle,
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

type InteractionState = "boot" | "ready" | "flashing" | "ejecting" | "connected" | "retracting";

type ContactStatus = "Assembling" | "Ready" | "Capturing" | "Ejecting" | "Connected" | "Retracting";

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

type Contact3DDebug = {
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
};

const INTRO_SLOW = 1.1;
const SHOW_DEBUG = false;

const BEATS = {
  blackHoldEnd: 0.45 * INTRO_SLOW,
  glowAppearEnd: 1.1 * INTRO_SLOW,
  glowTravelEnd: 2.25 * INTRO_SLOW,
  irisStart: 2.25 * INTRO_SLOW,
  irisTightEnd: 3.95 * INTRO_SLOW,
  overlayFadeStart: 3.95 * INTRO_SLOW,
  overlayFadeEnd: 4.8 * INTRO_SLOW,
  closeupEnd: 3.95 * INTRO_SLOW,
  readyAt: 4.8 * INTRO_SLOW,
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

  const assemblyRef = useRef<PolaroidCameraAssembly3DHandle | null>(null);
  const sequenceRef = useRef(0);
  const captureSeqRef = useRef<number | null>(null);
  const retractSeqRef = useRef<number | null>(null);
  const timerRefs = useRef<number[]>([]);
  const flashStartRef = useRef<number | null>(null);

  const phaseRef = useRef<ScenePhase>("lens_intro");
  const introTRef = useRef(0);
  const clockStartRef = useRef<number | null>(null);
  const lensRef = useRef<LensProjection | null>(null);
  const interactionRef = useRef<InteractionState>("boot");

  const [phase, setPhase] = useState<ScenePhase>("lens_intro");
  const [interactionState, setInteractionState] = useState<InteractionState>("boot");
  const [status, setStatus] = useState<ContactStatus>("Assembling");
  const [introT, setIntroT] = useState(0);
  const [flashAlpha, setFlashAlpha] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [seqId, setSeqId] = useState(0);
  const [cardAnchorPx, setCardAnchorPx] = useState<ScreenAnchorPx | null>(null);
  const [glbStatus, setGlbStatus] = useState<{ status: string; url: string; message?: string }>({
    status: "loading",
    url: "/models/polaroid_texture.glb",
  });
  const [debugData, setDebugData] = useState<Contact3DDebug>({
    glbStatus: "loading",
    url: "/models/polaroid_texture.glb",
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
  });
  const [debugOverlayEnabled] = useState(() => {
    const queryDebug =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
    const devMode = process.env.NODE_ENV !== "production";
    return queryDebug || (devMode && SHOW_DEBUG);
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    interactionRef.current = interactionState;
  }, [interactionState]);

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
      if (phaseRef.current === next) return;
      phaseRef.current = next;
      setPhase(next);
      if (next === "ready") debugLog("READY");
    },
    [debugLog]
  );

  const setInteractionSafe = useCallback((next: InteractionState) => {
    setInteractionState((prev) => {
      if (prev === next) return prev;
      interactionRef.current = next;
      return next;
    });
  }, []);

  const setStatusSafe = useCallback((next: ContactStatus) => {
    setStatus((prev) => (prev === next ? prev : next));
  }, []);

  const clearTimers = useCallback(() => {
    while (timerRefs.current.length > 0) {
      const id = timerRefs.current.pop();
      if (typeof id === "number") {
        window.clearTimeout(id);
      }
    }
  }, []);

  const onLensProject = useCallback((next: LensProjection) => {
    lensRef.current = next;
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
    if (interactionRef.current !== "ready") return;

    debugLog("CAPTURE TRIGGERED");
    playShutterClick();
    clearTimers();

    const seq = sequenceRef.current + 1;
    sequenceRef.current = seq;
    setSeqId(seq);
    captureSeqRef.current = seq;
    retractSeqRef.current = null;

    flashStartRef.current = performance.now();
    setInteractionSafe("flashing");
    setPhaseSafe("capturing");
    setStatusSafe("Capturing");
    assemblyRef.current?.triggerFlashOnly?.();

    const didStart = assemblyRef.current?.trigger() ?? false;
    if (!didStart) {
      setInteractionSafe("ready");
      setPhaseSafe("ready");
      setStatusSafe("Ready");
      flashStartRef.current = null;
      return;
    }

    setInteractionSafe("ejecting");
    setPhaseSafe("ejecting");
    setStatusSafe("Ejecting");
  }, [clearTimers, debugLog, playShutterClick, setInteractionSafe, setPhaseSafe, setStatusSafe]);

  const finalizeRetract = useCallback(
    (seq: number) => {
      if (sequenceRef.current !== seq) return;
      debugLog("RETRACT DONE");
      setInteractionSafe("ready");
      setPhaseSafe("ready");
      setStatusSafe("Ready");
      setIntroT(BEATS.readyAt);
      flashStartRef.current = null;
      retractSeqRef.current = null;
    },
    [debugLog, setInteractionSafe, setPhaseSafe, setStatusSafe]
  );

  const onPutBack = useCallback(async () => {
    if (interactionRef.current !== "connected") return;

    debugLog("PUT BACK TRIGGERED");
    clearTimers();

    const seq = sequenceRef.current + 1;
    sequenceRef.current = seq;
    setSeqId(seq);
    retractSeqRef.current = seq;
    captureSeqRef.current = null;

    setInteractionSafe("retracting");
    setPhaseSafe("retracting");
    setStatusSafe("Retracting");
    flashStartRef.current = null;
    setFlashAlpha(0);

    await (assemblyRef.current?.putBack() ?? Promise.resolve());
    if (sequenceRef.current !== seq) return;
    finalizeRetract(seq);
  }, [clearTimers, debugLog, finalizeRetract, setInteractionSafe, setPhaseSafe, setStatusSafe]);


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
    const lens = lensRef.current;
    const lensX = clamp(lens?.visible ? lens.x : width * 0.58, 0, width);
    const lensY = clamp(lens?.visible ? lens.y : height * 0.31, 0, height);
    const sourceX = clamp(lensX + minDim * 0.3, 0, width);
    const sourceY = clamp(lensY - minDim * 0.24, 0, height);

    const appearT = smoothstep(BEATS.blackHoldEnd, BEATS.glowAppearEnd, fxT);
    const travelT = smoothstep(BEATS.glowAppearEnd, BEATS.glowTravelEnd, fxT);
    const cx = mix(sourceX, lensX, travelT);
    const cy = mix(sourceY, lensY, travelT);

    const blackHold = 1 - smoothstep(0, BEATS.blackHoldEnd, fxT);
    const irisT = smoothstep(BEATS.irisStart, BEATS.irisTightEnd, fxT);
    const introFade = 1 - smoothstep(BEATS.overlayFadeStart, BEATS.overlayFadeEnd, fxT);
    const baseDark =
      fxT < BEATS.blackHoldEnd
        ? 1
        : fxT < BEATS.glowAppearEnd
          ? mix(0.92, 0.78, appearT)
          : fxT < BEATS.glowTravelEnd
            ? mix(0.76, 0.48, travelT)
            : fxT < BEATS.irisTightEnd
              ? mix(0.46, 0.22, irisT)
              : mix(0.16, 0.04, 1 - introFade);

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(1,2,6,${(baseDark * introFade).toFixed(3)})`;
    ctx.fillRect(0, 0, width, height);

    const grainAlpha = fxT < BEATS.overlayFadeEnd ? 0.018 : 0.006;
    for (let i = 0; i < 280; i += 1) {
      const x = hash2(i, frame * 7 + 3) * width;
      const y = hash2(i + 19, frame * 5 + 11) * height;
      const a = grainAlpha * (0.45 + hash2(i + 37, frame * 3 + 13) * 0.55);
      ctx.fillStyle = `rgba(236,241,252,${a.toFixed(3)})`;
      ctx.fillRect(x, y, 1, 1);
    }

    const offAxisGlow = appearT * (1 - smoothstep(2.05 * INTRO_SLOW, 2.3 * INTRO_SLOW, fxT)) * introFade;
    if (offAxisGlow > 0.001) {
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
      bloom.addColorStop(0, "rgba(248,251,255,0.9)");
      bloom.addColorStop(0.24, "rgba(224,232,246,0.48)");
      bloom.addColorStop(0.5, "rgba(126,140,162,0.16)");
      bloom.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.22 * offAxisGlow;
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, width, height);
    }

    const innerR = mix(0.95 * minDim, 0.27 * minDim, irisT);
    const outerR = innerR * 2.2;
    const vignette = ctx.createRadialGradient(lensX, lensY, innerR, lensX, lensY, outerR);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.46, "rgba(0,0,0,0.035)");
    vignette.addColorStop(0.72, "rgba(0,0,0,0.14)");
    vignette.addColorStop(1, "rgba(0,0,0,0.34)");
    ctx.globalCompositeOperation = "source-over";
    const irisOpacity = 0.1 + irisT * 0.18 + blackHold * 0.16;
    ctx.globalAlpha = clamp01(irisOpacity * introFade);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

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

      const elapsedIntro = Math.max(0, (now - clockStartRef.current) / 1000);
      const interaction = interactionRef.current;

      if (interaction === "boot" || interaction === "ready") {
        const t = Math.min(BEATS.readyAt, elapsedIntro);
        setIntroT(t);

        if (t < BEATS.glowAppearEnd) {
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
          if (interaction === "boot") {
            setInteractionSafe("ready");
          }
        }
        setFlashAlpha(0);
      } else if (interaction === "flashing" || interaction === "ejecting") {
        const flashStart = flashStartRef.current ?? now;
        const captureElapsed = Math.max(0, (now - flashStart) / 1000);
        const flashRise = smoothstep(0, 0.03, captureElapsed);
        const flashFall = 1 - smoothstep(0.045, 0.12, captureElapsed);
        setFlashAlpha(clamp01(flashRise * flashFall * 0.9));
        if (captureElapsed > 0.12) setFlashAlpha(0);
        setStatusSafe(interaction === "flashing" ? "Capturing" : "Ejecting");
      } else if (interaction === "connected") {
        setFlashAlpha(0);
        setStatusSafe("Connected");
      } else if (interaction === "retracting") {
        setFlashAlpha(0);
        setStatusSafe("Retracting");
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
      clearTimers();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [
    clearTimers,
    drawIntroOverlay,
    prefersReducedMotion,
    setInteractionSafe,
    setPhaseSafe,
    setStatusSafe,
  ]);

  useEffect(() => {
    assemblyRef.current?.setInteractionEnabled(interactionState === "ready");
  }, [interactionState]);

  const panelWidth =
    stageSize.width >= 768
      ? clamp(stageSize.width * 0.46, 520, 620)
      : clamp(stageSize.width - 40, 280, Math.max(280, stageSize.width - 32));
  const panelHeight = clamp(336 + contactRows.length * 58, 400, 520);

  const rawAnchorX = cardAnchorPx?.x ?? 0;
  const rawAnchorY = cardAnchorPx?.y ?? 0;

  const minX = 24 + panelWidth * 0.5;
  const maxX = stageSize.width - 24 - panelWidth * 0.5;
  const minY = 24 + panelHeight * 0.44;
  const maxY = stageSize.height - 24 - panelHeight * 0.56;

  const panelX = maxX > minX ? clamp(rawAnchorX, minX, maxX) : stageSize.width * 0.5;
  const panelY = maxY > minY ? clamp(rawAnchorY, minY, maxY) : stageSize.height * 0.5;

  const panelVisible = interactionState === "connected" && !!cardAnchorPx?.visible;
  const stageVignetteOpacity = interactionState === "ready" || interactionState === "connected" ? 0 : 1;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white">
      <div
        className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,0.045),rgba(0,0,0,0.66)_64%)]"
        style={{ opacity: stageVignetteOpacity }}
      />

      <div ref={stageRef} className="absolute inset-0 z-[5]">
        <PolaroidCameraAssembly3D
          ref={assemblyRef}
          phase={phase}
          timelineT={introT}
          isInteractive={interactionState === "ready"}
          onCaptureIntent={startCapture}
          onLensProject={onLensProject}
          onCardAnchorPx={setCardAnchorPx}
          onGlbStatus={setGlbStatus}
          onDebug={setDebugData}
          onEjectDone={() => {
            const captureSeq = captureSeqRef.current;
            if (captureSeq === null || captureSeq !== sequenceRef.current) return;
            debugLog("EJECT DONE");
            setInteractionSafe("connected");
            setPhaseSafe("connected");
            setStatusSafe("Connected");
            setFlashAlpha(0);
          }}
        />
      </div>

      <canvas ref={fxCanvasRef} className="pointer-events-none fixed inset-0 z-[14] h-[100vh] w-[100vw]" />
      <div className="pointer-events-none fixed inset-0 z-[18] bg-[#f2f6ff]" style={{ opacity: flashAlpha }} />

      <div className="pointer-events-none absolute left-5 top-6 z-[24] md:left-10 md:top-8">
        <h1 className="text-[2.2rem] font-semibold tracking-[0.14em] text-white/90 md:text-[3.6rem]">{title}</h1>
        <p className="mt-2 text-xs tracking-[0.08em] text-white/56 md:text-sm">{subtitle}</p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.22em] text-white/48 md:text-xs">Status {status}</p>
        {debugOverlayEnabled ? (
          <div className="mt-2 inline-block max-w-[min(92vw,620px)] rounded border border-white/20 bg-black/55 px-2 py-1 font-mono text-[10px] leading-tight text-white/85">
            <div>{`GLB: ${glbStatus.status}`}</div>
            <div className="break-all text-white/70">{glbStatus.url}</div>
            {glbStatus.status === "error" && glbStatus.message ? (
              <div className="break-all text-[#ffb4b4]">{glbStatus.message}</div>
            ) : null}
          </div>
        ) : null}
        {debugOverlayEnabled ? (
          <div className="mt-2 inline-block max-w-[min(92vw,620px)] rounded border border-white/20 bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white/85">
            <div>{`state: ${interactionState}`}</div>
            <div>{`seqId: ${seqId}`}</div>
            <div>{`glbStatus: ${debugData.glbStatus}`}</div>
            <div>{`meshes: ${debugData.totalMeshes}/${debugData.visibleMeshes}/${debugData.hiddenMeshes}`}</div>
            <div>{`pinkOverrideApplied: ${debugData.pinkOverrideApplied ? "yes" : "no"}`}</div>
            <div>{`propHideApplied: ${debugData.propHideApplied ? "yes" : "no"}`}</div>
            <div>{`componentCount: ${debugData.componentCount}`}</div>
            <div>{`keptTris: ${debugData.keptTris}/${debugData.totalTris} (${(debugData.keptRatio * 100).toFixed(1)}%)`}</div>
            <div>{`isolateApplied: ${debugData.isolateApplied ? "yes" : "no"}`}</div>
            <div>{`proceduralParts: ${debugData.createdParts ? "created" : "missing"}`}</div>
            <div>{`lensFound: ${debugData.lensFound ? "yes" : "no"}`}</div>
            <div>{`slotCreated: ${debugData.slotCreated ? "yes" : "no"}`}</div>
            <div>{`photoCreated: ${debugData.photoCreated ? "yes" : "no"}`}</div>
            <div>{`ejectState: ${debugData.ejectState ?? "n/a"} (${((debugData.ejectT ?? 0) * 100).toFixed(0)}%)`}</div>
            <div>
              {`lensCenter: ${
                debugData.lensCenter
                  ? `${debugData.lensCenter.map((v) => v.toFixed(3)).join(",")}`
                  : "n/a"
              }`}
            </div>
            <div>{`lensRadius: ${typeof debugData.lensRadius === "number" ? debugData.lensRadius.toFixed(3) : "n/a"}`}</div>
            <div>
              {`flashCenter: ${
                debugData.flashCenter
                  ? `${debugData.flashCenter.map((v) => v.toFixed(3)).join(",")}`
                  : "n/a"
              }`}
            </div>
            <div>
              {`viewCenter: ${
                debugData.viewCenter
                  ? `${debugData.viewCenter.map((v) => v.toFixed(3)).join(",")}`
                  : "n/a"
              }`}
            </div>
            <div>
              {`faceBasis: ${
                debugData.faceN && debugData.faceRight && debugData.faceUp
                  ? `N(${debugData.faceN.map((v) => v.toFixed(2)).join(",")}) R(${debugData.faceRight.map((v) => v.toFixed(2)).join(",")}) U(${debugData.faceUp.map((v) => v.toFixed(2)).join(",")})`
                  : "n/a"
              }`}
            </div>
            <div>
              {`partSizes: ${
                debugData.partSizes
                  ? `lensR ${debugData.partSizes.lensR.toFixed(3)} flash ${debugData.partSizes.flashW.toFixed(3)}x${debugData.partSizes.flashH.toFixed(3)} view ${debugData.partSizes.viewW.toFixed(3)}x${debugData.partSizes.viewH.toFixed(3)}`
                  : "n/a"
              }`}
            </div>
            <div>{`bodyMaxDim: ${typeof debugData.bodyMaxDim === "number" ? debugData.bodyMaxDim.toFixed(3) : "n/a"}`}</div>
            <div>{`partCount: ${typeof debugData.partCount === "number" ? debugData.partCount : "n/a"}`}</div>
            <div>{`tune: ${debugData.tune ?? "n/a"}`}</div>
            <div>{`cardAnchorProjected: ${debugData.cardAnchorProjected ? "yes" : "no"}`}</div>
            <div>
              {`anchorPx: ${
                debugData.anchorPx
                  ? `${Math.round(debugData.anchorPx.x)},${Math.round(debugData.anchorPx.y)},${debugData.anchorPx.visible ? "visible" : "hidden"}`
                  : "none"
              }`}
            </div>
            {debugData.message ? <div className="text-[#ffb4b4]">{debugData.message}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="absolute left-5 top-36 z-[24] md:left-10 md:top-40">
        <ReturnButton label="Return to Chloeverse" />
      </div>

      <AnimatePresence>
        {panelVisible ? (
          <motion.aside
            className="pointer-events-auto fixed z-[40] w-[600px] max-w-[640px] min-w-[560px] overflow-hidden rounded-[1.4rem] border border-white/18 bg-white/[0.08] p-6 shadow-[0_36px_90px_rgba(0,0,0,0.6)] backdrop-blur-[18px] max-md:w-[92vw] max-md:min-w-0 max-md:max-w-[92vw] md:p-7"
            style={{
              width: panelWidth,
              left: 0,
              top: 0,
              transform: `translate3d(${panelX}px, ${panelY}px, 0) translate(-50%, -50%)`,
            }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
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
