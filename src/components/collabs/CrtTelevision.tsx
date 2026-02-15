"use client";

import { useCallback, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

import { CrtScreen } from "./CrtScreen";
import styles from "./CollabsExperience.module.css";
import type { BootStage, CollabChannel } from "./types";

type CrtTelevisionProps = {
  channel: CollabChannel;
  tvOn: boolean;
  bootStage: BootStage;
  glitchActive: boolean;
  glitchPulse: number;
  osdVisible: boolean;
  osdPulse: number;
  reducedMotion: boolean;
};

export function CrtTelevision({
  channel,
  tvOn,
  bootStage,
  glitchActive,
  glitchPulse,
  osdVisible,
  osdPulse,
  reducedMotion,
}: CrtTelevisionProps) {
  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (reducedMotion) return;

      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const pointerX = (event.clientX - rect.left) / rect.width;
      const pointerY = (event.clientY - rect.top) / rect.height;

      const normalizedX = (pointerX - 0.5) * 2;
      const normalizedY = (pointerY - 0.5) * 2;

      const maxTiltDeg = 0.72;
      const nextTiltY = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, normalizedX * maxTiltDeg));
      const nextTiltX = Math.max(-maxTiltDeg, Math.min(maxTiltDeg, -normalizedY * maxTiltDeg * 0.82));

      setTiltX(nextTiltX);
      setTiltY(nextTiltY);
    },
    [reducedMotion]
  );

  const onPointerLeave = useCallback(() => {
    setTiltX(0);
    setTiltY(0);
  }, []);

  const tiltStyle = {
    "--tv-tilt-x": `${(reducedMotion ? 0 : tiltX).toFixed(3)}deg`,
    "--tv-tilt-y": `${(reducedMotion ? 0 : tiltY).toFixed(3)}deg`,
  } as CSSProperties;

  return (
    <div className={styles.tvSceneObject} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave}>
      <div className={styles.tvDropShadow} aria-hidden="true" />

      <article className={styles.tvBody} data-power={tvOn ? "on" : "off"} data-boot={bootStage} style={tiltStyle}>
        <div className={styles.tvSideWall} aria-hidden="true" />
        <div className={styles.tvBottomLip} aria-hidden="true" />
        <div className={styles.tvShellHighlight} aria-hidden="true" />
        <div className={styles.tvSurfaceNoise} aria-hidden="true" />

        <div className={styles.tvFace}>
          <div className={styles.tvBezel}>
            <CrtScreen
              channel={channel}
              tvOn={tvOn}
              bootStage={bootStage}
              glitchActive={glitchActive}
              glitchPulse={glitchPulse}
              osdVisible={osdVisible}
              osdPulse={osdPulse}
              reducedMotion={reducedMotion}
            />
            <div className={styles.tvScreenInsetShadow} aria-hidden="true" />
          </div>

          <aside className={styles.tvControls}>
            <div className={styles.speakerGrill} aria-hidden="true" />

            <div className={styles.knobGroup} aria-hidden="true">
              <div className={styles.knob}>
                <span>VOL</span>
              </div>
              <div className={styles.knob}>
                <span>TUNE</span>
              </div>
            </div>
          </aside>
        </div>

        <div className={styles.tvNameplate}>CHLOE BROADCAST</div>
      </article>

      <div className={styles.tvFeet} aria-hidden="true">
        <span />
        <span />
      </div>

      <div className={styles.tvReflection} aria-hidden="true" />
      <div className={styles.tvGroundContact} aria-hidden="true" />
      <div className={styles.tvReadyLamp} data-power={tvOn ? "on" : "off"} aria-hidden="true" />
    </div>
  );
}
