"use client";

import { motion } from "framer-motion";
import { Starfield } from "./Starfield";

export function SceneShell({
  title,
  subtitle,
  background,
  showStars = true,
  showIntroFade = true,
  overlayPreset = "default",
  frameClassName,
  headerClassName,
  titleClassName,
  subtitleClassName,
  contentClassName,
  children,
}: {
  title: string;
  subtitle?: string;
  background?: React.ReactNode;
  showStars?: boolean;
  showIntroFade?: boolean;
  overlayPreset?: "default" | "lowlight" | "runway";
  frameClassName?: string;
  headerClassName?: string;
  titleClassName?: string;
  subtitleClassName?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const vignetteClass =
    overlayPreset === "lowlight"
      ? "pointer-events-none absolute inset-0 z-[1] chv-vignette opacity-[0.5]"
      : overlayPreset === "runway"
        ? "pointer-events-none absolute inset-0 z-[1] chv-vignette opacity-[0.38]"
        : "pointer-events-none absolute inset-0 z-[1] chv-vignette";
  const filmgrainClass =
    overlayPreset === "lowlight"
      ? "pointer-events-none absolute inset-0 z-[2] chv-filmgrain opacity-[0.52]"
      : overlayPreset === "runway"
        ? "pointer-events-none absolute inset-0 z-[2] chv-filmgrain opacity-[0.42]"
        : "pointer-events-none absolute inset-0 z-[2] chv-filmgrain";
  const radialOverlayClass =
    overlayPreset === "lowlight"
      ? "pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.18)_28%,rgba(0,0,0,0.55)_65%,rgba(0,0,0,0.7)_100%)]"
      : overlayPreset === "runway"
        ? "pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(ellipse_at_50%_36%,rgba(255,255,255,0.065)_0%,rgba(255,255,255,0.02)_16%,rgba(0,0,0,0.12)_36%,rgba(0,0,0,0.3)_64%,rgba(0,0,0,0.46)_100%)]"
        : "pointer-events-none absolute inset-0 z-[3] bg-[radial-gradient(ellipse_at_50%_36%,rgba(255,255,255,0.055)_0%,rgba(255,255,255,0.018)_14%,rgba(0,0,0,0.14)_34%,rgba(0,0,0,0.36)_62%,rgba(0,0,0,0.58)_100%)]";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      {background ? <div className="absolute inset-0 z-0">{background}</div> : null}
      {showStars ? <Starfield className="z-0" /> : null}

      {/* cinematic grain/vignette */}
      <div className={vignetteClass} />
      <div className={filmgrainClass} />

      <div className={radialOverlayClass} />

      {showIntroFade ? (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-black z-40"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      ) : null}

      <div className={`relative z-10 mx-auto w-full max-w-6xl px-6 py-16 ${frameClassName ?? ""}`.trim()}>
        <div className={`max-w-3xl ${headerClassName ?? ""}`.trim()}>
          <h1 className={`text-3xl md:text-5xl font-semibold tracking-tight ${titleClassName ?? ""}`.trim()}>
            {title}
          </h1>
          {subtitle ? (
            <p className={`mt-4 text-white/70 text-base md:text-lg ${subtitleClassName ?? ""}`.trim()}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className={`mt-10 ${contentClassName ?? ""}`.trim()}>{children}</div>
      </div>
    </main>
  );
}
