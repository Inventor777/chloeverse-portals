"use client";

import type { CSSProperties, MouseEvent, PointerEvent as ReactPointerEvent, SyntheticEvent } from "react";
import { motion } from "framer-motion";

import type { PanelId } from "./focusPresets";
import styles from "./mediacard.module.css";

export type MediaPanelKey = PanelId;

type MetricDatum = {
  label: string;
  value: string;
  descriptor?: string;
};

type PartnerDatum = {
  name: string;
  pngSrc: string;
  svgSrc: string;
  accent: string;
  logoHeight?: string;
  logoFilter?: string;
};

function MetricCard({ label, value, descriptor }: MetricDatum) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricCardLabel}>{label}</div>
      <div className={styles.metricCardValue}>{value}</div>
      {descriptor ? <div className={styles.metricCardDesc}>{descriptor}</div> : null}
    </div>
  );
}

function handleBrandLogoError(event: SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget;
  const fallbackSrc = img.dataset.fallbackSrc;
  if (!fallbackSrc) return;
  if (img.dataset.fallbackApplied === "true") return;
  img.dataset.fallbackApplied = "true";
  img.src = fallbackSrc;
}

function AudiencePanel() {
  const countries = ["United States", "Canada", "Australia", "South Korea"];
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Audience</h2>
        <p className={styles.panelSubtitle}>Core viewer markets</p>
      </header>
      <div className={styles.audienceGrid}>
        {countries.map((country) => (
          <div key={country} className={styles.audienceTile}>
            <span className={styles.tileLabel}>Market</span>
            <strong>{country}</strong>
          </div>
        ))}
      </div>
    </>
  );
}

function MetricsPanel() {
  const metrics: MetricDatum[] = [
    { label: "Instagram", value: "160K" },
    { label: "TikTok", value: "160K" },
    { label: "Views", value: "12M monthly" },
    { label: "Engagement", value: "12%" },
  ];
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Metrics</h2>
        <p className={styles.panelSubtitle}>Current platform footprint</p>
      </header>
      <div className={styles.metricsGrid}>
        {metrics.map((metric) => (
          <MetricCard key={`${metric.label}-${metric.value}`} {...metric} />
        ))}
      </div>
    </>
  );
}

function ServicesPanel() {
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Services &amp; Rates</h2>
        <p className={styles.panelSubtitle}>Commercial partnership options</p>
      </header>

      <section className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Brand Partnerships</h3>
        <ul className={styles.sectionList}>
          <li>Per Video (Posted on one platform): $3,000</li>
          <li>Cross posted across platforms: $4,000</li>
          <li>Link in bio per every 7 days: Additional $100</li>
          <li>Whitelisting (per 15 days): Additional $100</li>
          <li>Usage rights (per 30 days): Additional $200</li>
        </ul>
      </section>

      <section className={styles.sectionBlock}>
        <h3 className={styles.sectionTitle}>Dining Partnerships</h3>
        <ul className={styles.sectionList}>
          <li>Cross Posted across platforms with Instagram story coverage included</li>
          <li>Per Cross Posted Video: Hosted dining experience for desired party size</li>
        </ul>
      </section>
    </>
  );
}

function CollabsPanel() {
  const partners: PartnerDatum[] = [
    { name: "Adobe", pngSrc: "/mediacard/logos/adobe.png", svgSrc: "/mediacard/logos/adobe.svg", accent: "255 0 0" },
    { name: "Adidas", pngSrc: "/mediacard/logos/adidas.png", svgSrc: "/mediacard/logos/adidas.svg", accent: "125 249 255" },
    {
      name: "Armani",
      pngSrc: "/mediacard/logos/armani.svg",
      svgSrc: "/mediacard/logos/armani.svg",
      accent: "245 232 220",
      logoHeight: "54px",
    },
    {
      name: "BTS",
      pngSrc: "/mediacard/logos/bts.png",
      svgSrc: "/mediacard/logos/bts.svg",
      accent: "185 154 247",
      logoHeight: "58px",
    },
    {
      name: "Estee Lauder",
      pngSrc: "/mediacard/logos/esteelauder.png",
      svgSrc: "/mediacard/logos/esteelauder.svg",
      accent: "185 154 247",
    },
    { name: "OpenAI", pngSrc: "/mediacard/logos/openai.png", svgSrc: "/mediacard/logos/openai.svg", accent: "125 249 255" },
  ];
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Noteworthy Collaborations</h2>
        <p className={styles.panelSubtitle}>Featured brand collaborators</p>
      </header>
      <div className={styles.logoGrid}>
        {partners.map((partner) => (
          <div
            key={partner.name}
            className={styles.logoTile}
            style={
              {
                "--logo-accent": partner.accent,
                "--logo-height": partner.logoHeight,
                "--logo-filter": partner.logoFilter,
              } as CSSProperties
            }
          >
            <img
              className={styles.brandLogoImg}
              src={partner.pngSrc}
              data-fallback-src={partner.svgSrc}
              onError={handleBrandLogoError}
              alt={partner.name}
              loading="lazy"
            />
            <span className={styles.logoWordmark}>{partner.name}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function ComingSoonPanel({ region }: { region?: string | null }) {
  const regionLabel = region ? `${region} regional card is in progress` : "Regional card is in progress";
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Coming Soon</h2>
        <p className={styles.panelSubtitle}>{regionLabel}</p>
      </header>
      <div className={styles.comingSoonBody}>
        More market-specific media kit details for {region ?? "this region"} will appear here soon.
      </div>
    </>
  );
}

function PanelBody({ panel, comingSoonRegion }: { panel: MediaPanelKey; comingSoonRegion?: string | null }) {
  if (panel === "audience") return <AudiencePanel />;
  if (panel === "metrics") return <MetricsPanel />;
  if (panel === "services") return <ServicesPanel />;
  if (panel === "collabs") return <CollabsPanel />;
  return <ComingSoonPanel region={comingSoonRegion} />;
}

export function MediaKitPanel({
  panel,
  comingSoonRegion,
  onClose,
}: {
  panel: MediaPanelKey;
  comingSoonRegion?: string | null;
  onClose: () => void;
}) {
  const handleCloseClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const stopPanelPointerEvent = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const stopPanelPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleClosePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <motion.aside
      className={styles.panel}
      onPointerDown={stopPanelPointerDown}
      onClick={stopPanelPointerEvent}
      initial={{ opacity: 0, y: 22, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.985 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        className={styles.closeButton}
        onPointerDown={handleClosePointerDown}
        onClick={handleCloseClick}
        aria-label="Close panel"
      >
        Close
      </button>
      <PanelBody panel={panel} comingSoonRegion={comingSoonRegion} />
    </motion.aside>
  );
}
