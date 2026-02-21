export type ProjectsPhase = "bg" | "constellation" | "compress" | "reveal" | "live";

export type ScreenPoint = {
  x: number;
  y: number;
};

export type ProjectedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  valid: boolean;
};
