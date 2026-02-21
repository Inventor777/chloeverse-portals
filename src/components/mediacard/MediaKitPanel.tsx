"use client";

import { motion } from "framer-motion";

import type { PanelId } from "./focusPresets";
import styles from "./mediacard.module.css";

export type MediaPanelKey = PanelId;

const CONTACT_INFO = [
  "LA, NYC, USA",
  "ugcbychloekang@gmail.com",
  "www.singleoriginstudios.com",
  "@imchloekang",
];

function ContactHeader() {
  return (
    <div className={styles.contactHeader}>
      {CONTACT_INFO.map((item) => (
        <span key={item}>{item}</span>
      ))}
    </div>
  );
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
  const metrics = [
    "147K Instagram Followers",
    "160K TikTok Followers",
    "12M Monthly Views",
    "12% Engagement Rate",
  ];
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Metrics</h2>
        <p className={styles.panelSubtitle}>Current platform footprint</p>
      </header>
      <ContactHeader />
      <div className={styles.metricsGrid}>
        {metrics.map((metric) => (
          <div key={metric} className={styles.metricTile}>
            {metric}
          </div>
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
          <li>Per Video (Posted on one platform): $1,200</li>
          <li>Cross posted across platforms: $2,000</li>
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
  const partners = [
    { name: "Adobe", src: "/mediacard/logos/adobe.svg" },
    { name: "Adidas", src: "/mediacard/logos/adidas.svg" },
    { name: "Estee Lauder", src: "/mediacard/logos/esteelauder.svg" },
    { name: "OpenAI", src: "/mediacard/logos/openai.svg" },
  ];
  return (
    <>
      <header className={styles.panelTitleRow}>
        <h2 className={styles.panelTitle}>Noteworthy Collaborations</h2>
        <p className={styles.panelSubtitle}>Featured brand collaborators</p>
      </header>
      <div className={styles.logoGrid}>
        {partners.map((partner) => (
          <div key={partner.name} className={styles.logoTile}>
            <img src={partner.src} alt={`${partner.name} logo`} className={styles.logoMark} />
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
  return (
    <motion.aside
      className={styles.panel}
      initial={{ opacity: 0, y: 22, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.985 }}
      transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close panel">
        Close
      </button>
      <PanelBody panel={panel} comingSoonRegion={comingSoonRegion} />
    </motion.aside>
  );
}
