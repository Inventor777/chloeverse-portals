"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { ReturnButton } from "@/components/ReturnButton";

import {
  GlobeRenderer,
  MEDIACARD_TUNING,
  panelToMarketId,
  type GlobeRendererHandle,
  type HoverRegion,
  type RegionSelection,
} from "./GlobeRenderer";
import { TARGETS, type PanelId } from "./focusPresets";
import { MediaCardMenu, type MediaMenuKey, type MenuJump } from "./MediaCardMenu";
import { MediaKitPanel } from "./MediaKitPanel";
import styles from "./mediacard.module.css";

export function MediaCardExperience() {
  const globeRef = useRef<GlobeRendererHandle | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [activeMenuKey, setActiveMenuKey] = useState<MediaMenuKey | null>(null);
  const [menuHoverKey, setMenuHoverKey] = useState<MediaMenuKey | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);
  const [hoverRegion, setHoverRegion] = useState<HoverRegion | null>(null);
  const [globeHoverMarketId, setGlobeHoverMarketId] = useState(0);
  const [comingSoonRegion, setComingSoonRegion] = useState<string | null>(null);
  const hoverMarketId = menuHoverKey ? panelToMarketId(menuHoverKey) : globeHoverMarketId;
  const activeMarketId = panelToMarketId(activePanel);

  useEffect(() => {
    const timer = window.setTimeout(() => setMenuVisible(true), 450);
    return () => window.clearTimeout(timer);
  }, []);

  const runFocusPipeline = (selection: RegionSelection) => {
    setActivePanel(null);
    setMenuHoverKey(null);
    if (selection.regionKey === "comingSoon") {
      setActiveMenuKey(null);
      setComingSoonRegion(selection.continentLabel ?? null);
    } else {
      setActiveMenuKey(selection.regionKey);
      setComingSoonRegion(null);
    }
    globeRef.current?.focusToLatLon({
      key: selection.regionKey,
      lat: selection.lat,
      lon: selection.lon,
      zoom: selection.zoom,
    });
  };

  const handleJump = (jump: MenuJump) => {
    const target = TARGETS[jump.panel];
    runFocusPipeline({
      regionKey: jump.panel,
      lat: target.lat,
      lon: target.lon,
      zoom: target.zoom,
    });
  };

  const handleFocusSettled = (panel: PanelId) => {
    setActivePanel(panel);
    if (panel === "audience" || panel === "metrics" || panel === "services" || panel === "collabs") {
      setActiveMenuKey(panel);
    } else {
      setActiveMenuKey(null);
    }
  };

  const handleRestSettled = () => {
    // no-op for now; close flow intentionally hides the panel immediately
  };

  const closePanel = () => {
    if (!activePanel) return;
    setActivePanel(null);
    setActiveMenuKey(null);
    setMenuHoverKey(null);
    globeRef.current?.resetFocus();
  };

  const handleGlobeHover = (region: HoverRegion | null) => {
    setHoverRegion(region);
    setGlobeHoverMarketId(region?.panelKey ? panelToMarketId(region.panelKey) : 0);
  };

  const tuneVars = {
    "--mc-menu-top-pct": `${MEDIACARD_TUNING.MENU_OFFSET_Y_PCT}%`,
    "--mc-menu-left-px": `${MEDIACARD_TUNING.MENU_OFFSET_X_PX}px`,
    "--mc-menu-width-px": `${MEDIACARD_TUNING.MENU_WIDTH_PX}px`,
    "--mc-menu-item-font-px": `${MEDIACARD_TUNING.MENU_FONT_PX}px`,
    "--mc-menu-item-pad-y": `${MEDIACARD_TUNING.MENU_PAD_Y_PX}px`,
    "--mc-menu-item-pad-x": `${MEDIACARD_TUNING.MENU_PAD_X_PX}px`,
    "--mc-card-offset-x-px": `${MEDIACARD_TUNING.CARD_OFFSET_X_PX}px`,
    "--mc-card-offset-y-px": `${MEDIACARD_TUNING.CARD_OFFSET_Y_PX}px`,
    "--mc-card-max-width-px": `${MEDIACARD_TUNING.CARD_MAX_WIDTH_PX}px`,
  } as CSSProperties;

  return (
    <main className={styles.root}>
      <section className={styles.stage} style={tuneVars}>
        <div className={styles.sceneGlow} />
        <div className={styles.scenePurpleEdge} />

        <div className={styles.globeMount}>
          <GlobeRenderer
            ref={globeRef}
            className={styles.globeCanvas}
            onFocusSettled={handleFocusSettled}
            onRestSettled={handleRestSettled}
            onSelectRegion={runFocusPipeline}
            onHoverRegion={handleGlobeHover}
            interactionLocked={activePanel !== null}
            hoverMarketId={hoverMarketId}
            activeMarketId={activeMarketId}
          />
        </div>

        <div className={styles.diagonalStreaks} />
        <div className={styles.scanlineBand} />
        <div className={styles.vignette} />
        <div className={styles.grain} />

        <header className={styles.sceneHeader}>
          <h1>MEDIA CARD</h1>
          <p>Interactive market focus map</p>
        </header>

        <div className={styles.menuDock}>
          <MediaCardMenu
            visible={menuVisible}
            activeKey={activeMenuKey}
            hoveredKey={menuHoverKey}
            onJump={handleJump}
            onHoverKey={setMenuHoverKey}
          />
        </div>

        <div className={styles.panelDock}>
          <AnimatePresence mode="wait">
            {activePanel ? (
              <MediaKitPanel
                key={`${activePanel}-${comingSoonRegion ?? "none"}`}
                panel={activePanel}
                comingSoonRegion={comingSoonRegion}
                onClose={closePanel}
              />
            ) : null}
          </AnimatePresence>
        </div>

        {hoverRegion ? (
          <div
            className={styles.hoverHint}
            style={{
              left: hoverRegion.x + 14,
              top: hoverRegion.y + 14,
            }}
          >
            <strong>{hoverRegion.label}</strong>
            <span>{hoverRegion.panelLabel}</span>
          </div>
        ) : null}
      </section>

      <ReturnButton label="Return" className="opacity-65 hover:opacity-95" />
    </main>
  );
}
