export type BootStage = "off" | "line" | "bloom" | "settle" | "on";

export type LedMode = "off" | "idle" | "pulse";

export type CollabChannel = {
  id: string;
  number: number;
  title: string;
  brand: string;
  descriptor: "BRAND FILM" | "UGC CUTDOWN" | "PRODUCT HERO" | "BTS REEL" | "LAUNCH TEASE" | "PERFORMANCE EDIT";
  embedUrl?: string;
  mp4Url?: string;
  palette: [string, string, string];
};
