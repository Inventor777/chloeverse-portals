"use client";

import { useCallback } from "react";

type AudioRig = {
  ctx: AudioContext;
  masterGain: GainNode;
  volumeGain: GainNode;
  humGain: GainNode;
  humLow: OscillatorNode;
  humHigh: OscillatorNode;
  humNoise: AudioBufferSourceNode;
};

type NoiseBurstOptions = {
  startAt: number;
  duration: number;
  peak: number;
  attack: number;
  sustain: number;
  release: number;
  filterType: BiquadFilterType;
  frequency: number;
  q?: number;
  frequencySweepTo?: number;
  sweepAt?: number;
};

const UNLOCK_EVENTS = ["pointerdown", "mousedown", "touchstart", "keydown", "wheel"] as const;

let rigSingleton: AudioRig | null = null;
let noiseBufferSingleton: AudioBuffer | null = null;
let volumeSingleton = 0.8;
let mutedSingleton = false;
let pendingPageStinger = false;
let pendingTvBoot = false;
let unlockListenersRegistered = false;
let unlockGestureHandled = false;

function createNoiseBuffer(ctx: AudioContext, durationSeconds: number) {
  const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSeconds));
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const output = buffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i += 1) {
    output[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

export function useCrtAudio() {
  const applyMasterLevel = useCallback((rig: AudioRig) => {
    const now = rig.ctx.currentTime;
    const target = mutedSingleton ? 0.0001 : Math.max(0.0001, 0.08 + volumeSingleton * 0.32);
    rig.masterGain.gain.cancelScheduledValues(now);
    rig.masterGain.gain.setValueAtTime(rig.masterGain.gain.value, now);
    rig.masterGain.gain.linearRampToValueAtTime(target, now + 0.06);
  }, []);

  const ensureRig = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (rigSingleton) return rigSingleton;

    const browserWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const ContextCtor = browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
    if (!ContextCtor) return null;

    const ctx = new ContextCtor();
    const masterGain = ctx.createGain();
    masterGain.gain.value = mutedSingleton ? 0.0001 : Math.max(0.0001, 0.08 + volumeSingleton * 0.32);
    masterGain.connect(ctx.destination);

    const volumeGain = ctx.createGain();
    volumeGain.gain.value = 1;
    volumeGain.connect(masterGain);

    const humGain = ctx.createGain();
    humGain.gain.value = 0.0001;
    humGain.connect(volumeGain);

    const humLow = ctx.createOscillator();
    humLow.type = "sine";
    humLow.frequency.value = 59.8;
    humLow.connect(humGain);

    const humHigh = ctx.createOscillator();
    humHigh.type = "sine";
    humHigh.frequency.value = 119.6;
    humHigh.connect(humGain);

    const noiseBuffer = createNoiseBuffer(ctx, 12);
    noiseBufferSingleton = noiseBuffer;

    const humNoise = ctx.createBufferSource();
    humNoise.buffer = noiseBuffer;
    humNoise.loop = true;

    const humNoiseFilter = ctx.createBiquadFilter();
    humNoiseFilter.type = "lowpass";
    humNoiseFilter.frequency.value = 240;

    const humNoiseGain = ctx.createGain();
    humNoiseGain.gain.value = 0.0001;

    humNoise.connect(humNoiseFilter);
    humNoiseFilter.connect(humNoiseGain);
    humNoiseGain.connect(humGain);

    humLow.start();
    humHigh.start();
    humNoise.start();

    rigSingleton = { ctx, masterGain, volumeGain, humGain, humLow, humHigh, humNoise };
    return rigSingleton;
  }, []);

  const playClickAt = useCallback((ctx: AudioContext, destination: AudioNode, startAt: number, level = 0.045) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(940, startAt);
    osc.frequency.exponentialRampToValueAtTime(420, startAt + 0.013);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(level, startAt + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.015);

    osc.connect(gain);
    gain.connect(destination);
    osc.start(startAt);
    osc.stop(startAt + 0.02);
  }, []);

  const playNoiseBurst = useCallback((ctx: AudioContext, destination: AudioNode, options: NoiseBurstOptions) => {
    if (!noiseBufferSingleton) return;

    const source = ctx.createBufferSource();
    source.buffer = noiseBufferSingleton;
    source.loop = false;

    const filter = ctx.createBiquadFilter();
    filter.type = options.filterType;
    filter.frequency.setValueAtTime(options.frequency, options.startAt);
    filter.Q.value = options.q ?? 0.9;

    if (typeof options.frequencySweepTo === "number" && typeof options.sweepAt === "number") {
      filter.frequency.exponentialRampToValueAtTime(options.frequencySweepTo, options.startAt + options.sweepAt);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, options.startAt);
    gain.gain.linearRampToValueAtTime(options.peak, options.startAt + options.attack);
    gain.gain.linearRampToValueAtTime(options.sustain, options.startAt + options.release);
    gain.gain.exponentialRampToValueAtTime(0.0001, options.startAt + options.duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    const startOffset = Math.random() * Math.max(0.01, noiseBufferSingleton.duration - options.duration);
    source.start(options.startAt, startOffset, Math.max(0.04, options.duration));
    source.stop(options.startAt + options.duration + 0.04);
  }, []);

  const schedulePageStinger = useCallback(
    (rig: AudioRig) => {
      const now = rig.ctx.currentTime + 0.004;
      playClickAt(rig.ctx, rig.volumeGain, now, 0.058);

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 0.04,
        duration: 1.96,
        peak: 0.28,
        attack: 0.22,
        sustain: 0.054,
        release: 0.92,
        filterType: "highpass",
        frequency: 320,
      });

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 0.72,
        duration: 0.42,
        peak: 0.2,
        attack: 0.05,
        sustain: 0.04,
        release: 0.22,
        filterType: "bandpass",
        frequency: 820,
        q: 6.5,
        frequencySweepTo: 2600,
        sweepAt: 0.18,
      });

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 1.04,
        duration: 0.52,
        peak: 0.14,
        attack: 0.04,
        sustain: 0.032,
        release: 0.3,
        filterType: "highpass",
        frequency: 1400,
      });
    },
    [playClickAt, playNoiseBurst]
  );

  const scheduleTvBoot = useCallback(
    (rig: AudioRig) => {
      const now = rig.ctx.currentTime + 0.004;
      playClickAt(rig.ctx, rig.volumeGain, now, 0.078);

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 0.012,
        duration: 0.48,
        peak: 0.34,
        attack: 0.016,
        sustain: 0.092,
        release: 0.21,
        filterType: "bandpass",
        frequency: 1180,
        q: 1.2,
        frequencySweepTo: 4100,
        sweepAt: 0.16,
      });

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 0.07,
        duration: 0.34,
        peak: 0.19,
        attack: 0.014,
        sustain: 0.05,
        release: 0.18,
        filterType: "highpass",
        frequency: 560,
      });

      playNoiseBurst(rig.ctx, rig.volumeGain, {
        startAt: now + 0.16,
        duration: 0.26,
        peak: 0.17,
        attack: 0.016,
        sustain: 0.036,
        release: 0.12,
        filterType: "bandpass",
        frequency: 1650,
        q: 4.8,
        frequencySweepTo: 2860,
        sweepAt: 0.1,
      });
    },
    [playClickAt, playNoiseBurst]
  );

  const playPageStingerNow = useCallback(
    (rig: AudioRig) => {
      schedulePageStinger(rig);
    },
    [schedulePageStinger]
  );

  const flushPendingAudio = useCallback(
    (rig: AudioRig) => {
      applyMasterLevel(rig);

      if (pendingPageStinger) {
        pendingPageStinger = false;
        playPageStingerNow(rig);
      }

      if (pendingTvBoot) {
        pendingTvBoot = false;
        scheduleTvBoot(rig);
      }
    },
    [applyMasterLevel, playPageStingerNow, scheduleTvBoot]
  );

  const resumeAndFlush = useCallback(async () => {
    const rig = ensureRig();
    if (!rig) return false;

    if (rig.ctx.state !== "running") {
      try {
        await rig.ctx.resume();
      } catch {
        // Autoplay can still block until a real gesture.
      }
    }

    if (rig.ctx.state !== "running") return false;
    flushPendingAudio(rig);
    return true;
  }, [ensureRig, flushPendingAudio]);

  const registerUnlockListeners = useCallback(() => {
    if (typeof window === "undefined" || unlockListenersRegistered) return;
    unlockListenersRegistered = true;

    const onFirstGesture = () => {
      if (unlockGestureHandled) return;
      unlockGestureHandled = true;
      UNLOCK_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onFirstGesture, true);
      });
      void resumeAndFlush();
    };

    UNLOCK_EVENTS.forEach((eventName) => {
      if (eventName === "touchstart" || eventName === "wheel") {
        window.addEventListener(eventName, onFirstGesture, { capture: true, once: true, passive: true });
        return;
      }
      window.addEventListener(eventName, onFirstGesture, { capture: true, once: true });
    });
  }, [resumeAndFlush]);

  const ensureUnlocked = useCallback(async () => {
    registerUnlockListeners();
    return resumeAndFlush();
  }, [registerUnlockListeners, resumeAndFlush]);

  const playPageStinger = useCallback(() => {
    const rig = ensureRig();
    if (!rig) return;
    if (rig.ctx.state !== "running") {
      pendingPageStinger = true;
      void ensureUnlocked();
      return;
    }
    applyMasterLevel(rig);
    playPageStingerNow(rig);
  }, [applyMasterLevel, ensureRig, ensureUnlocked, playPageStingerNow]);

  const playTvBoot = useCallback(() => {
    const rig = ensureRig();
    if (!rig) return;
    if (rig.ctx.state !== "running") {
      pendingTvBoot = true;
      void ensureUnlocked();
      return;
    }
    applyMasterLevel(rig);
    scheduleTvBoot(rig);
  }, [applyMasterLevel, ensureRig, ensureUnlocked, scheduleTvBoot]);

  const setMuted = useCallback(
    (muted: boolean) => {
      mutedSingleton = muted;
      const rig = rigSingleton;
      if (!rig) return;
      applyMasterLevel(rig);
    },
    [applyMasterLevel]
  );

  const setVolume = useCallback(
    (volumeRatio: number) => {
      volumeSingleton = Math.min(1, Math.max(0, volumeRatio));
      const rig = rigSingleton;
      if (!rig) return;
      applyMasterLevel(rig);
    },
    [applyMasterLevel]
  );

  const startHum = useCallback(() => {
    const rig = rigSingleton ?? ensureRig();
    if (!rig || rig.ctx.state !== "running") return;
    const now = rig.ctx.currentTime;
    rig.humGain.gain.cancelScheduledValues(now);
    rig.humGain.gain.setValueAtTime(rig.humGain.gain.value, now);
    rig.humGain.gain.linearRampToValueAtTime(0.03, now + 0.24);
  }, [ensureRig]);

  const stopHum = useCallback(() => {
    const rig = rigSingleton;
    if (!rig) return;
    const now = rig.ctx.currentTime;
    rig.humGain.gain.cancelScheduledValues(now);
    rig.humGain.gain.setValueAtTime(rig.humGain.gain.value, now);
    rig.humGain.gain.linearRampToValueAtTime(0.0001, now + 0.22);
  }, []);

  const playButtonClick = useCallback(() => {
    const rig = rigSingleton ?? ensureRig();
    if (!rig || rig.ctx.state !== "running") return;
    playClickAt(rig.ctx, rig.volumeGain, rig.ctx.currentTime + 0.002, 0.03);
  }, [ensureRig, playClickAt]);

  const playChannelGlitch = useCallback(() => {
    const rig = rigSingleton ?? ensureRig();
    if (!rig || rig.ctx.state !== "running") return;
    playNoiseBurst(rig.ctx, rig.volumeGain, {
      startAt: rig.ctx.currentTime + 0.003,
      duration: 0.19,
      peak: 0.08,
      attack: 0.012,
      sustain: 0.026,
      release: 0.08,
      filterType: "highpass",
      frequency: 980,
    });
  }, [ensureRig, playNoiseBurst]);

  return {
    ensureUnlocked,
    playPageStinger,
    playTvBoot,
    setMuted,
    setVolume,
    startHum,
    stopHum,
    playButtonClick,
    playChannelGlitch,
  };
}
