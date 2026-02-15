"use client";

import type { CSSProperties } from "react";

import styles from "./CollabsExperience.module.css";
import type { BootStage, CollabChannel } from "./types";

type CrtScreenProps = {
  channel: CollabChannel;
  tvOn: boolean;
  bootStage: BootStage;
  glitchActive: boolean;
  glitchPulse: number;
  osdVisible: boolean;
  osdPulse: number;
  reducedMotion: boolean;
};

function bootClass(bootStage: BootStage, reducedMotion: boolean) {
  if (bootStage === "off") return styles.bootOffStage;
  if (reducedMotion) return styles.bootReduced;
  if (bootStage === "line") return styles.bootLineStage;
  if (bootStage === "bloom") return styles.bootBloomStage;
  if (bootStage === "settle") return styles.bootSettleStage;
  return styles.bootOnStage;
}

export function CrtScreen({
  channel,
  tvOn,
  bootStage,
  glitchActive,
  glitchPulse,
  osdVisible,
  osdPulse,
  reducedMotion,
}: CrtScreenProps) {
  const hasEmbed = typeof channel.embedUrl === "string" && channel.embedUrl.trim().length > 0;
  const hasMp4 = typeof channel.mp4Url === "string" && channel.mp4Url.trim().length > 0;
  const hasMedia = hasEmbed || hasMp4;
  const showDeadGlass = !tvOn && bootStage === "off";

  const paletteStyle = {
    "--channel-primary": channel.palette[0],
    "--channel-secondary": channel.palette[1],
    "--channel-accent": channel.palette[2],
  } as CSSProperties;

  return (
    <div
      className={`${styles.screenRoot} ${glitchActive ? styles.screenGlitching : ""}`}
      data-live={tvOn && bootStage === "on" ? "on" : "off"}
      data-standby={showDeadGlass ? "true" : "false"}
      style={paletteStyle}
    >
      {showDeadGlass ? (
        <div className={styles.deadGlass}>
          <div className={styles.deadGlassSheen} aria-hidden="true" />
          <div className={styles.deadGlassStandby}>STANDBY</div>
        </div>
      ) : (
        <div className={styles.screenContent}>
          {hasEmbed ? (
            <iframe
              src={channel.embedUrl}
              className={styles.mediaFrame}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer"
              title={channel.title}
            />
          ) : hasMp4 ? (
            <video
              className={styles.mediaFrame}
              src={channel.mp4Url}
              autoPlay
              loop
              muted
              playsInline
              controls={false}
            />
          ) : (
            <div className={styles.noSignal}>
              <div className={styles.noSignalNoise} aria-hidden="true" />
              <div className={styles.noSignalText}>
                <span>CH {String(channel.number).padStart(2, "0")}</span>
                <strong>NO SIGNAL</strong>
                <small>STANDBY</small>
              </div>
            </div>
          )}

          {!hasMedia ? null : <div className={styles.phosphorTint} aria-hidden="true" />}
        </div>
      )}

      <div className={styles.screenInsetShadow} aria-hidden="true" />
      <div className={styles.scanlines} aria-hidden="true" />
      <div className={styles.noiseLayer} aria-hidden="true" />
      <div className={styles.vignetteLayer} aria-hidden="true" />
      <div className={styles.glassSpecks} aria-hidden="true" />
      <div className={styles.glassHighlight} aria-hidden="true" />

      {glitchActive ? <div key={`glitch-${glitchPulse}`} className={styles.glitchPulseLayer} aria-hidden="true" /> : null}

      {osdVisible && tvOn && bootStage === "on" ? (
        <div key={`osd-${osdPulse}`} className={styles.channelOsd}>
          <div>CH {String(channel.number).padStart(2, "0")}</div>
          <div>{channel.title}</div>
          <div>{channel.brand}</div>
        </div>
      ) : null}

      <div className={`${styles.bootOverlay} ${bootClass(bootStage, reducedMotion)}`} aria-hidden="true">
        <div className={styles.bootTrace} />
      </div>
    </div>
  );
}
