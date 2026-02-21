"use client";

import { motion } from "framer-motion";

import type { PanelId } from "./focusPresets";
import styles from "./mediacard.module.css";

export type MediaMenuKey = "audience" | "metrics" | "services" | "collabs";

export type MenuJump = {
  key: MediaMenuKey;
  label: string;
  panel: Exclude<PanelId, "comingSoon">;
};

export const MENU_JUMPS: MenuJump[] = [
  { key: "audience", label: "Audience", panel: "audience" },
  { key: "metrics", label: "Metrics", panel: "metrics" },
  { key: "services", label: "Services/Rates", panel: "services" },
  { key: "collabs", label: "Noteworthy Collaborations", panel: "collabs" },
];

export function MediaCardMenu({
  visible,
  activeKey,
  hoveredKey,
  onJump,
  onHoverKey,
}: {
  visible: boolean;
  activeKey: MediaMenuKey | null;
  hoveredKey?: MediaMenuKey | null;
  onJump: (jump: MenuJump) => void;
  onHoverKey?: (key: MediaMenuKey | null) => void;
}) {
  return (
    <motion.nav
      className={styles.menu}
      initial={{ opacity: 0, x: -16 }}
      animate={visible ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      aria-label="Media card navigation"
      onMouseLeave={() => onHoverKey?.(null)}
    >
      {MENU_JUMPS.map((jump, index) => (
        <button
          key={jump.key}
          type="button"
          className={styles.menuItem}
          data-active={activeKey === jump.key ? "true" : "false"}
          data-hovered={hoveredKey === jump.key ? "true" : "false"}
          onClick={() => onJump(jump)}
          onMouseEnter={() => onHoverKey?.(jump.key)}
          onFocus={() => onHoverKey?.(jump.key)}
          onBlur={() => onHoverKey?.(null)}
          style={{ transitionDelay: `${index * 38}ms` }}
        >
          {jump.label}
        </button>
      ))}
    </motion.nav>
  );
}
