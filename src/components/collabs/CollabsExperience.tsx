"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { VideoItem } from "@/lib/portalData";

import { CrtScreen } from "./CrtScreen";
import { RetroTv3D } from "./RetroTv3D";
import { RemoteControl } from "./RemoteControl";
import styles from "./CollabsExperience.module.css";
import type { BootStage, CollabChannel, LedMode } from "./types";
import { useCrtAudio } from "./useCrtAudio";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const FALLBACK_CHANNELS: Array<{
  title: string;
  brand: string;
  descriptor: CollabChannel["descriptor"];
  palette: [string, string, string];
}> = [
  { title: "AEROSTRIDE", brand: "AEROSTRIDE STUDIO", descriptor: "BRAND FILM", palette: ["#2a6cff", "#79cdff", "#c2e8ff"] },
  { title: "LUMA SKIN", brand: "LUMA LAB", descriptor: "PRODUCT HERO", palette: ["#b0712f", "#f7c98f", "#ffe5c8"] },
  { title: "PULSE SUPPLY", brand: "PULSE HOUSE", descriptor: "UGC CUTDOWN", palette: ["#be335d", "#ff86a8", "#ffd1dd"] },
  { title: "NOVA FUEL", brand: "NOVA MOTION", descriptor: "PERFORMANCE EDIT", palette: ["#1d8d66", "#66e3b0", "#b5ffe2"] },
  { title: "SOLAR DUSK", brand: "SOLAR LABS", descriptor: "BTS REEL", palette: ["#6d54c7", "#aa94ff", "#d7ccff"] },
  { title: "RUSH BEAUTY", brand: "RUSH COLLECTIVE", descriptor: "LAUNCH TEASE", palette: ["#a63070", "#f183ba", "#ffd7e8"] },
  { title: "TRACE DENIM", brand: "TRACE HOUSE", descriptor: "BRAND FILM", palette: ["#436997", "#8bb4e6", "#d0e5ff"] },
  { title: "MERCURY GOODS", brand: "MERCURY CO", descriptor: "PRODUCT HERO", palette: ["#4f7f98", "#9dc7dc", "#dff1f9"] },
];

function sanitizeField(value?: string) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function hasDevTone(text: string) {
  return /replace|placeholder|add|embed|mp4|brand name|sponsored video|tip|queue/i.test(text);
}

function normalizeVideoChannels(videos: VideoItem[]) {
  const input = Array.isArray(videos) ? videos : [];
  const targetCount = Math.min(10, Math.max(8, input.length || 0));

  return Array.from({ length: targetCount }, (_, index): CollabChannel => {
    const source = input[index];
    const fallback = FALLBACK_CHANNELS[index % FALLBACK_CHANNELS.length];
    const sourceTitle = sanitizeField(source?.title);
    const sourceBrand = sanitizeField(source?.brand);
    const title = sourceTitle && !hasDevTone(sourceTitle) ? sourceTitle.toUpperCase() : fallback.title;
    const brand = sourceBrand && !hasDevTone(sourceBrand) ? sourceBrand.toUpperCase() : fallback.brand;
    const embedUrlRaw = sanitizeField(source?.embedUrl);
    const mp4UrlRaw = sanitizeField(source?.mp4Url);

    return {
      id: sanitizeField(source?.id) || `collab-channel-${index + 1}`,
      number: index + 1,
      title,
      brand,
      descriptor: fallback.descriptor,
      embedUrl: embedUrlRaw || undefined,
      mp4Url: mp4UrlRaw || undefined,
      palette: fallback.palette,
    };
  });
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

type CollabsExperienceProps = {
  videos: VideoItem[];
};

export function CollabsExperience({ videos }: CollabsExperienceProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const reduceMotionRef = useRef(prefersReducedMotion);
  const bootTimersRef = useRef<number[]>([]);
  const pageIntroTimersRef = useRef<number[]>([]);
  const remoteEntranceTimerRef = useRef<number | null>(null);
  const glitchTimerRef = useRef<number | null>(null);
  const osdTimerRef = useRef<number | null>(null);
  const ledTimerRef = useRef<number | null>(null);
  const reloadStaticPlayedRef = useRef(false);
  const audio = useCrtAudio();

  const channels = useMemo(() => normalizeVideoChannels(videos), [videos]);

  const [remoteOn, setRemoteOn] = useState(false);
  const [tvOn, setTvOn] = useState(false);
  const [bootStage, setBootStage] = useState<BootStage>("off");
  const [pageIntroStage, setPageIntroStage] = useState<"off" | "line" | "bloom" | "settle" | "done">("off");
  const [remoteEntered, setRemoteEntered] = useState(false);
  const [channelIndex, setChannelIndex] = useState(0);
  const [volume, setVolume] = useState(42);
  const [muted, setMuted] = useState(false);
  const [glitchActive, setGlitchActive] = useState(false);
  const [glitchPulse, setGlitchPulse] = useState(0);
  const [osdVisible, setOsdVisible] = useState(false);
  const [osdPulse, setOsdPulse] = useState(0);
  const [ledPulse, setLedPulse] = useState(false);
  const [hasPressedPower, setHasPressedPower] = useState(false);

  const currentChannel = channels[channelIndex % channels.length];

  useEffect(() => {
    reduceMotionRef.current = prefersReducedMotion;
  }, [prefersReducedMotion]);

  useEffect(() => {
    const unlockAudio = () => {
      void audio.ensureUnlocked();
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true, capture: true });
    window.addEventListener("keydown", unlockAudio, { once: true, capture: true });

    return () => {
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, [audio]);

  const playReloadStaticOnce = useCallback(() => {
    if (reloadStaticPlayedRef.current) return;
    reloadStaticPlayedRef.current = true;
    void audio.ensureUnlocked();
    audio.playTvBoot();
  }, [audio]);

  useEffect(() => {
    const onFirstGesture = () => {
      playReloadStaticOnce();
    };

    window.addEventListener("pointerdown", onFirstGesture, { once: true, capture: true });
    window.addEventListener("keydown", onFirstGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture, true);
      window.removeEventListener("keydown", onFirstGesture, true);
    };
  }, [playReloadStaticOnce]);

  const clearBootTimers = useCallback(() => {
    bootTimersRef.current.forEach((id) => window.clearTimeout(id));
    bootTimersRef.current = [];
  }, []);

  const clearPageIntroTimers = useCallback(() => {
    pageIntroTimersRef.current.forEach((id) => window.clearTimeout(id));
    pageIntroTimersRef.current = [];
    if (remoteEntranceTimerRef.current) {
      window.clearTimeout(remoteEntranceTimerRef.current);
      remoteEntranceTimerRef.current = null;
    }
  }, []);

  const clearInteractionTimers = useCallback(() => {
    if (glitchTimerRef.current) {
      window.clearTimeout(glitchTimerRef.current);
      glitchTimerRef.current = null;
    }
    if (osdTimerRef.current) {
      window.clearTimeout(osdTimerRef.current);
      osdTimerRef.current = null;
    }
    if (ledTimerRef.current) {
      window.clearTimeout(ledTimerRef.current);
      ledTimerRef.current = null;
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    clearBootTimers();
    clearPageIntroTimers();
    clearInteractionTimers();
  }, [clearBootTimers, clearInteractionTimers, clearPageIntroTimers]);

  const pulseLed = useCallback((duration = 190) => {
    setLedPulse(true);
    if (ledTimerRef.current) window.clearTimeout(ledTimerRef.current);
    ledTimerRef.current = window.setTimeout(() => {
      setLedPulse(false);
    }, duration);
  }, []);

  const showOsd = useCallback(() => {
    setOsdVisible(true);
    setOsdPulse((value) => value + 1);
    if (osdTimerRef.current) window.clearTimeout(osdTimerRef.current);
    osdTimerRef.current = window.setTimeout(() => {
      setOsdVisible(false);
    }, 1200);
  }, []);

  const triggerChannelGlitch = useCallback(() => {
    setGlitchPulse((value) => value + 1);
    setGlitchActive(true);
    if (glitchTimerRef.current) window.clearTimeout(glitchTimerRef.current);
    glitchTimerRef.current = window.setTimeout(() => {
      setGlitchActive(false);
    }, reduceMotionRef.current ? 140 : 360);
  }, []);

  const powerEverythingOff = useCallback(() => {
    clearBootTimers();
    clearInteractionTimers();
    setRemoteOn(false);
    setTvOn(false);
    setBootStage("off");
    setGlitchActive(false);
    setOsdVisible(false);
    setLedPulse(false);
  }, [clearBootTimers, clearInteractionTimers]);

  const startBoot = useCallback(() => {
    clearBootTimers();
    clearInteractionTimers();
    setTvOn(false);
    setBootStage("line");

    if (reduceMotionRef.current) {
      setBootStage("on");
      setTvOn(true);
      showOsd();
      return;
    }

    const lineTimer = window.setTimeout(() => {
      setBootStage("bloom");
    }, 420);

    const bloomTimer = window.setTimeout(() => {
      setBootStage("settle");
    }, 960);

    const settleTimer = window.setTimeout(() => {
      setBootStage("on");
      setTvOn(true);
      showOsd();
    }, 1750);

    bootTimersRef.current = [lineTimer, bloomTimer, settleTimer];
  }, [clearBootTimers, clearInteractionTimers, showOsd]);

  useEffect(() => {
    clearPageIntroTimers();

    const triggerIntroLine = () => {
      setPageIntroStage("line");
    };

    if (prefersReducedMotion) {
      const toLineReduced = window.setTimeout(() => triggerIntroLine(), 0);
      const reducedTimer = window.setTimeout(() => {
        setPageIntroStage("done");
      }, 300);
      pageIntroTimersRef.current = [toLineReduced, reducedTimer];
      return;
    }

    const toLine = window.setTimeout(() => triggerIntroLine(), 200);
    const toBloom = window.setTimeout(() => setPageIntroStage("bloom"), 550);
    const toSettle = window.setTimeout(() => setPageIntroStage("settle"), 1050);
    const toDone = window.setTimeout(() => setPageIntroStage("done"), 2000);
    pageIntroTimersRef.current = [toLine, toBloom, toSettle, toDone];
  }, [clearPageIntroTimers, prefersReducedMotion]);

  useEffect(() => {
    if (pageIntroStage !== "done") return;

    if (remoteEntranceTimerRef.current) {
      window.clearTimeout(remoteEntranceTimerRef.current);
    }
    remoteEntranceTimerRef.current = window.setTimeout(() => {
      setRemoteEntered(true);
    }, 120);
  }, [pageIntroStage]);

  useEffect(() => {
    return clearAllTimers;
  }, [clearAllTimers]);

  useEffect(() => {
    audio.setVolume(volume / 100);
  }, [audio, volume]);

  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    if (tvOn) {
      audio.startHum();
      return;
    }
    audio.stopHum();
  }, [audio, tvOn]);

  const armAudio = useCallback(() => {
    void audio.ensureUnlocked();
  }, [audio]);

  const channelStep = useCallback(
    (direction: number) => {
      if (!remoteOn || !tvOn || bootStage !== "on") return;
      setChannelIndex((index) => (index + direction + channels.length) % channels.length);
      setMuted(false);
      pulseLed();
      triggerChannelGlitch();
      showOsd();
      audio.playButtonClick();
      audio.playChannelGlitch();
    },
    [audio, bootStage, channels.length, pulseLed, remoteOn, showOsd, triggerChannelGlitch, tvOn]
  );

  const adjustVolume = useCallback(
    (direction: number) => {
      if (!remoteOn || !tvOn || bootStage !== "on") return;
      setVolume((value) => {
        const next = value + direction;
        if (next < 0) return 0;
        if (next > 100) return 100;
        return next;
      });
      setMuted(false);
      audio.playButtonClick();
      pulseLed(140);
    },
    [audio, bootStage, pulseLed, remoteOn, tvOn]
  );

  const toggleMute = useCallback(() => {
    if (!remoteOn || !tvOn || bootStage !== "on") return;
    setMuted((value) => !value);
    audio.playButtonClick();
    pulseLed(140);
  }, [audio, bootStage, pulseLed, remoteOn, tvOn]);

  const togglePower = useCallback(() => {
    if (!hasPressedPower) {
      setHasPressedPower(true);
    }

    audio.playButtonClick();

    if (!remoteOn) {
      setRemoteOn(true);
      pulseLed(260);
      playReloadStaticOnce();
      startBoot();
      return;
    }

    if (tvOn || bootStage !== "off") {
      powerEverythingOff();
      return;
    }

    playReloadStaticOnce();
    startBoot();
  }, [audio, bootStage, hasPressedPower, playReloadStaticOnce, powerEverythingOff, pulseLed, remoteOn, startBoot, tvOn]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();

      if (
        key !== "arrowup" &&
        key !== "arrowdown" &&
        key !== "arrowleft" &&
        key !== "arrowright" &&
        key !== "m" &&
        key !== "p"
      ) {
        return;
      }

      event.preventDefault();
      armAudio();

      if (key === "p") {
        togglePower();
        return;
      }

      if (!remoteOn || !tvOn || bootStage !== "on") return;

      if (key === "arrowup") {
        channelStep(1);
        return;
      }
      if (key === "arrowdown") {
        channelStep(-1);
        return;
      }
      if (key === "arrowright") {
        adjustVolume(6);
        return;
      }
      if (key === "arrowleft") {
        adjustVolume(-6);
        return;
      }
      toggleMute();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [adjustVolume, armAudio, bootStage, channelStep, remoteOn, toggleMute, togglePower, tvOn]);

  const ledMode: LedMode = !remoteOn ? "off" : ledPulse ? "pulse" : "idle";

  return (
    <section className={styles.collabsStage} data-motion={prefersReducedMotion ? "reduce" : "full"}>
      <div className={styles.pageIntro} data-stage={pageIntroStage} aria-hidden>
        <div className={styles.pageIntroLine} />
      </div>

      <div className={styles.studioBackdrop} aria-hidden="true">
        <div className={styles.studioSpotlight} />
        <div className={styles.studioDepth} />
      </div>

      <div className={styles.tablePlane} aria-hidden="true" />
      <div className={styles.floorBounce} aria-hidden="true" />
      <div className={styles.sceneGrain} aria-hidden="true" />

      <div className={styles.stageObjects}>
        <div className={styles.tvHeroGlow} aria-hidden="true" />

        <div className={styles.televisionWrap}>
          {pageIntroStage === "settle" || pageIntroStage === "done" ? (
            <div className={styles.tvPromptAnchor}>
              <div className={`${styles.pressPowerPrompt} ${hasPressedPower ? styles.powerPromptDismissed : ""}`}>
                PRESS POWER TO WAKE
              </div>
            </div>
          ) : null}

          <RetroTv3D tvOn={tvOn} bootStage={bootStage} reducedMotion={prefersReducedMotion}>
            <CrtScreen
              channel={currentChannel}
              tvOn={tvOn}
              bootStage={bootStage}
              glitchActive={tvOn ? glitchActive : false}
              glitchPulse={glitchPulse}
              osdVisible={tvOn ? osdVisible : false}
              osdPulse={osdPulse}
              reducedMotion={prefersReducedMotion}
            />
          </RetroTv3D>
        </div>

        <div className={styles.remoteAreaGlow} aria-hidden="true" />

        {pageIntroStage === "done" ? (
          <div className={`${styles.remoteWrap} ${remoteEntered ? styles.remoteWrapEntered : styles.remoteWrapHidden}`}>
            <RemoteControl
              remoteOn={remoteOn}
              channelNumber={currentChannel.number}
              channelTitle={currentChannel.descriptor}
              volume={volume}
              muted={muted}
              ledMode={ledMode}
              onInteract={armAudio}
              onPower={togglePower}
              onChannelUp={() => channelStep(1)}
              onChannelDown={() => channelStep(-1)}
              onVolumeUp={() => adjustVolume(6)}
              onVolumeDown={() => adjustVolume(-6)}
              onMute={toggleMute}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
