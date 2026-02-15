"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./CollabsExperience.module.css";
import type { LedMode } from "./types";

type RemoteControlProps = {
  remoteOn: boolean;
  channelNumber: number;
  channelTitle: string;
  volume: number;
  muted: boolean;
  ledMode: LedMode;
  onInteract: () => void;
  onPower: () => void;
  onChannelUp: () => void;
  onChannelDown: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onMute: () => void;
};

type PressedControl = "power" | "channelUp" | "channelDown" | "volumeUp" | "volumeDown" | "mute";

const cosmeticRows = [
  ["INPUT", "MENU", "BACK"],
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["-", "0", "+"],
];

export function RemoteControl({
  remoteOn,
  channelNumber,
  channelTitle,
  volume,
  muted,
  ledMode,
  onInteract,
  onPower,
  onChannelUp,
  onChannelDown,
  onVolumeUp,
  onVolumeDown,
  onMute,
}: RemoteControlProps) {
  const [pressedControl, setPressedControl] = useState<PressedControl | null>(null);
  const releaseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    };
  }, []);

  const press = (control: PressedControl, action: () => void, enabled = true) => {
    onInteract();
    setPressedControl(control);
    if (enabled) action();

    if (releaseTimerRef.current) window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = window.setTimeout(() => {
      setPressedControl((current) => (current === control ? null : current));
    }, 160);
  };

  const ledClass =
    ledMode === "off" ? styles.remoteLedOff : ledMode === "pulse" ? styles.remoteLedPulse : styles.remoteLedIdle;
  const controlsEnabled = remoteOn;

  return (
    <aside className={styles.remoteObject}>
      <div className={styles.remoteShell}>
        <div className={styles.remoteSpecular} aria-hidden="true" />
        <div className={styles.remoteEdgeShade} aria-hidden="true" />
        <div className={styles.remoteEmboss}>CHLOE</div>

        <div className={styles.remoteTopRow}>
          <button
            type="button"
            className={`${styles.remoteButton} ${styles.remotePower} ${pressedControl === "power" ? styles.remoteButtonPressed : ""}`}
            onClick={() => press("power", onPower, true)}
            aria-label="Power"
          >
            POWER
          </button>

          <div className={styles.remoteLedWrap}>
            <span className={`${styles.remoteLed} ${ledClass}`} />
          </div>
        </div>

        <div className={styles.remoteInfo}>
          <div className={styles.remoteChannelLabel}>CH {String(channelNumber).padStart(2, "0")}</div>
          <div className={styles.remoteTitle}>{channelTitle}</div>
          <div className={styles.remoteVolumeTrack}>
            <span className={styles.remoteVolumeFill} style={{ width: muted ? "0%" : `${Math.max(5, volume)}%` }} />
          </div>
        </div>

        <div className={`${styles.remoteCluster} ${!controlsEnabled ? styles.remoteClusterDisabled : ""}`}>
          <div className={styles.remoteClusterName}>CHANNEL</div>
          <div className={styles.remoteRockerVertical}>
            <button
              type="button"
              className={`${styles.remoteButton} ${styles.remoteRockerButton} ${
                pressedControl === "channelUp" ? styles.remoteButtonPressed : ""
              }`}
              onClick={() => press("channelUp", onChannelUp, controlsEnabled)}
              aria-label="Channel up"
              disabled={!controlsEnabled}
            >
              CH +
            </button>
            <button
              type="button"
              className={`${styles.remoteButton} ${styles.remoteRockerButton} ${
                pressedControl === "channelDown" ? styles.remoteButtonPressed : ""
              }`}
              onClick={() => press("channelDown", onChannelDown, controlsEnabled)}
              aria-label="Channel down"
              disabled={!controlsEnabled}
            >
              CH -
            </button>
          </div>
        </div>

        <div className={`${styles.remoteCluster} ${!controlsEnabled ? styles.remoteClusterDisabled : ""}`}>
          <div className={styles.remoteClusterName}>VOLUME</div>
          <div className={styles.remoteRockerVertical}>
            <button
              type="button"
              className={`${styles.remoteButton} ${styles.remoteRockerButton} ${
                pressedControl === "volumeUp" ? styles.remoteButtonPressed : ""
              }`}
              onClick={() => press("volumeUp", onVolumeUp, controlsEnabled)}
              aria-label="Volume up"
              disabled={!controlsEnabled}
            >
              VOL +
            </button>
            <button
              type="button"
              className={`${styles.remoteButton} ${styles.remoteRockerButton} ${
                pressedControl === "volumeDown" ? styles.remoteButtonPressed : ""
              }`}
              onClick={() => press("volumeDown", onVolumeDown, controlsEnabled)}
              aria-label="Volume down"
              disabled={!controlsEnabled}
            >
              VOL -
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.remoteButton} ${styles.remoteMute} ${pressedControl === "mute" ? styles.remoteButtonPressed : ""}`}
          onClick={() => press("mute", onMute, controlsEnabled)}
          aria-label={muted ? "Unmute" : "Mute"}
          disabled={!controlsEnabled}
        >
          {muted ? "UNMUTE" : "MUTE"}
        </button>

        <div className={styles.remoteDpad} aria-hidden="true">
          <button type="button" className={styles.remoteCosmeticButton} tabIndex={-1}>
            U
          </button>
          <button type="button" className={styles.remoteCosmeticButton} tabIndex={-1}>
            L
          </button>
          <button type="button" className={`${styles.remoteCosmeticButton} ${styles.remoteOk}`} tabIndex={-1}>
            OK
          </button>
          <button type="button" className={styles.remoteCosmeticButton} tabIndex={-1}>
            R
          </button>
          <button type="button" className={styles.remoteCosmeticButton} tabIndex={-1}>
            D
          </button>
        </div>

        <div className={styles.remoteCosmeticGrid} aria-hidden="true">
          {cosmeticRows.flat().map((label, index) => (
            <button key={`${label}-${index}`} type="button" className={styles.remoteSmallButton} tabIndex={-1}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
