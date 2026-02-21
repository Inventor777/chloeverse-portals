export type PanelId = "audience" | "metrics" | "services" | "collabs" | "comingSoon";
export type RegionMode = "na" | "ca" | "kr" | "au";
export type PanelTargetKey = Exclude<PanelId, "comingSoon">;

export type FocusPresetTarget = {
  lat: number;
  lon: number;
  zoom: number;
  label: string;
};

export type TargetConfig = FocusPresetTarget & {
  mode: RegionMode;
};

export const TARGETS: Record<PanelTargetKey, TargetConfig> = {
  audience: { lat: 39.5, lon: -98.35, zoom: 1.55, label: "Audience", mode: "na" },
  metrics: { lat: 56.13, lon: -106.35, zoom: 1.65, label: "Metrics", mode: "ca" },
  services: { lat: 36.5, lon: 127.8, zoom: 1.75, label: "Services/Rates", mode: "kr" },
  collabs: { lat: -25.0, lon: 133.0, zoom: 1.7, label: "Noteworthy Collaborations", mode: "au" },
};

export const FOCUS_PRESETS: Record<PanelId, FocusPresetTarget> = {
  audience: TARGETS.audience,
  metrics: TARGETS.metrics,
  services: TARGETS.services,
  collabs: TARGETS.collabs,
  comingSoon: { lat: 20.0, lon: 0.0, zoom: 1.45, label: "Coming soon" },
};
