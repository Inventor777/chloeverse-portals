"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SceneShell } from "@/components/SceneShell";
import { ReturnButton } from "@/components/ReturnButton";
import { ProjectsFieldWebGL } from "@/components/ProjectsFieldWebGL";
import { projectsVideos } from "@/lib/portalData";

type ReelItem = {
  id: string;
  title: string;
  subtitle?: string;
  embedUrl?: string;
  mp4Url?: string;
};

type ProjectVideoInput = {
  id?: string;
  title?: string;
  subtitle?: string;
  caption?: string;
  embedUrl?: string;
  mp4Url?: string;
};

function hasDevPlaceholderTone(value?: string) {
  if (!value) return false;
  return /replace|add\s|embed|mp4|snap|scroll|link|reel/i.test(value);
}

function normalizeProjectItem(item: ProjectVideoInput, index: number): ReelItem {
  const titleRaw = String(item?.title ?? "").trim();
  const subtitleRaw = String(item?.subtitle ?? item?.caption ?? "").trim();
  const fallbackTitle = `TRANSMISSION ${String(index + 1).padStart(2, "0")}`;

  const title =
    !titleRaw || /^project\s+video\s*\d+/i.test(titleRaw) || hasDevPlaceholderTone(titleRaw)
      ? fallbackTitle
      : titleRaw;

  const subtitle = subtitleRaw && !hasDevPlaceholderTone(subtitleRaw) ? subtitleRaw : "Signal pending.";

  return {
    id: String(item?.id ?? `project-${index + 1}`),
    title,
    subtitle,
    embedUrl: typeof item?.embedUrl === "string" && item.embedUrl.trim() ? item.embedUrl : undefined,
    mp4Url: typeof item?.mp4Url === "string" && item.mp4Url.trim() ? item.mp4Url : undefined,
  };
}

function PhoneReels({ items }: { items: ReelItem[] }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const h = el.clientHeight || 1;
      const idx = Math.round(el.scrollTop / h);
      setActive(Math.max(0, Math.min(items.length - 1, idx)));
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);

  useEffect(() => {
    videoRefs.current.forEach((videoEl, idx) => {
      if (!videoEl) return;
      if (idx === active) {
        const playResult = videoEl.play();
        if (playResult && typeof playResult.catch === "function") {
          playResult.catch(() => {});
        }
      } else {
        videoEl.pause();
        videoEl.currentTime = 0;
      }
    });
  }, [active]);

  return (
    <div className="absolute inset-[18px] overflow-hidden rounded-[2.75rem]">
      <div
        ref={scrollerRef}
        className="chv-hide-scrollbar h-full w-full overflow-y-auto overscroll-contain snap-y snap-mandatory bg-black"
      >
        {items.map((item, i) => (
          <section key={item.id} className="relative h-full w-full snap-start">
            <div className="absolute inset-0">
              {item.mp4Url ? (
                <video
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  src={item.mp4Url}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                  loop
                  controls={false}
                  preload="metadata"
                />
              ) : item.embedUrl ? (
                <iframe
                  className="h-full w-full"
                  src={item.embedUrl}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="no-referrer"
                  title={item.title}
                />
              ) : (
                <div className="relative h-full w-full chv-poster">
                  <div className="absolute inset-0 grid place-items-center">
                    <div className="text-center">
                      <div className="text-[11px] tracking-[0.62em] text-white/55">TRANSMISSION QUEUED</div>
                      <div className="mt-3 text-sm font-medium text-white/88">Signal pending.</div>
                      <div className="mt-2 text-xs text-white/48">Carrier lock not established.</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),rgba(0,0,0,0.88)_72%)] opacity-60" />
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-5">
              <div className="rounded-2xl border border-white/10 bg-black/38 px-4 py-3 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.72)]">
                <div className="text-sm font-medium tracking-tight text-white/92">{item.title}</div>
                {item.subtitle ? <div className="mt-1 text-xs text-white/64">{item.subtitle}</div> : null}
                <div className="mt-2 text-[11px] text-white/44">{i === active ? "Signal stream active." : "\u00A0"}</div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [seq, setSeq] = useState<"hold" | "drop" | "glide" | "done">("hold");
  const [impactPulse, setImpactPulse] = useState(0);

  const items = useMemo(
    () => (projectsVideos ?? []).map((item, index) => normalizeProjectItem(item, index)),
    []
  );

  useEffect(() => {
    const t = window.setTimeout(() => setSeq("drop"), 750);
    return () => window.clearTimeout(t);
  }, []);

  const handlePhoneAnimationComplete = () => {
    if (seq === "drop") {
      setImpactPulse((v) => v + 1);
      setSeq("glide");
    } else if (seq === "glide") {
      setSeq("done");
    }
  };

  const phoneVariants = {
    hold: {
      opacity: 0,
      x: 0,
      y: 0,
      z: -1400,
      scale: 0.22,
      rotateX: 4,
      rotateY: 0,
      rotateZ: 0,
      pointerEvents: "none",
    },
    drop: {
      opacity: [0, 1],
      x: 0,
      y: [-820, 0],
      z: -1400,
      scale: 0.22,
      rotateX: 4,
      rotateY: 0,
      rotateZ: 0,
      pointerEvents: "auto",
      transition: {
        opacity: { duration: 0.12, ease: "easeOut" },
        y: { type: "tween", duration: 1.55, ease: "easeOut" },
      },
    },
    glide: {
      opacity: 1,
      x: 0,
      y: 0,
      z: [-1400, 0],
      scale: [0.22, 1],
      rotateX: [4, 1.5],
      rotateY: 0,
      rotateZ: 0,
      pointerEvents: "auto",
      transition: { type: "tween", duration: 4.2, ease: "easeInOut" },
    },
    done: {
      opacity: 1,
      x: 0,
      y: 0,
      z: 0,
      scale: 1,
      rotateX: 1.5,
      rotateY: 0,
      rotateZ: 0,
      pointerEvents: "auto",
    },
  };

  return (
    <div className="relative h-screen overflow-hidden bg-black supports-[height:100svh]:h-[100svh]">
      <ReturnButton label="Click to stay in the Chloeverse" />

      <SceneShell
        title="PROJECTS"
        subtitle="NIGHT-SIGNAL ARCHIVE ON THE RUNWAY."
        showStars={false}
        showIntroFade={false}
        overlayPreset="runway"
        background={<ProjectsFieldWebGL />}
        frameClassName="h-screen supports-[height:100svh]:h-[100svh] max-w-none px-5 pb-0 pt-8 md:px-10 md:pt-10 flex flex-col overflow-hidden"
        headerClassName="max-w-lg"
        titleClassName="text-[1.45rem] md:text-[2rem] tracking-[0.28em] font-medium"
        subtitleClassName="mt-3 text-xs md:text-sm uppercase tracking-[0.08em] text-white/62"
        contentClassName="mt-6 md:mt-8 flex-1 overflow-hidden flex items-end justify-center"
      >
        <div className="relative flex h-full w-full items-end justify-center pb-9 md:pb-14">
          <motion.div
            className="pointer-events-none absolute left-1/2 bottom-[6.8%] h-36 w-[540px] -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.52),rgba(0,0,0,0.18)_34%,rgba(0,0,0,0)_76%)]"
            initial={{ opacity: 0, scale: 0.22, x: 0, y: 16 }}
            animate={
              seq === "hold"
                ? { opacity: 0, scale: 0.22, x: 0, y: 16 }
                : seq === "drop"
                  ? { opacity: 0.08, scale: 0.22, x: 0, y: 10 }
                  : seq === "glide"
                    ? { opacity: 0.42, scale: 0.94, x: 0, y: 3 }
                    : { opacity: 0.42, scale: 0.94, x: 0, y: 3 }
            }
            transition={
              seq === "drop"
                ? { type: "tween", duration: 1.55, ease: "easeOut" }
                : seq === "glide"
                  ? { type: "tween", duration: 4.2, ease: "easeInOut" }
                  : { duration: 0.26, ease: [0.2, 0.82, 0.22, 1] }
            }
          />

          <motion.div
            className="pointer-events-none absolute left-1/2 bottom-[8.5%] h-24 w-[470px] -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(246,164,88,0.2),rgba(0,0,0,0)_72%)] blur-2xl"
            initial={{ opacity: 0, scale: 0.22, x: 0, y: 12 }}
            animate={
              seq === "hold"
                ? { opacity: 0, scale: 0.22, x: 0, y: 12 }
                : seq === "drop"
                  ? { opacity: 0.03, scale: 0.22, x: 0, y: 9 }
                  : seq === "glide"
                    ? { opacity: 0.14, scale: 0.94, x: 0, y: 2 }
                    : { opacity: 0.14, scale: 0.94, x: 0, y: 2 }
            }
            transition={
              seq === "drop"
                ? { type: "tween", duration: 1.55, ease: "easeOut" }
                : seq === "glide"
                  ? { type: "tween", duration: 4.2, ease: "easeInOut" }
                  : { duration: 0.24, ease: [0.2, 0.82, 0.22, 1] }
            }
          />

          {impactPulse > 0 ? (
            <>
              <motion.div
                key={`impact-shadow-${impactPulse}`}
                className="pointer-events-none absolute left-1/2 bottom-[32.8%] h-6 w-36 -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.16),rgba(0,0,0,0.06)_45%,rgba(0,0,0,0)_80%)]"
                initial={{ opacity: 0, scale: 0.72, y: 3 }}
                animate={{ opacity: [0, 0.14, 0.05, 0], scale: [0.72, 1.04, 1.12, 1.18], y: [3, 1, 0, 0] }}
                transition={{ duration: 0.44, times: [0, 0.3, 0.68, 1], ease: [0.2, 0.82, 0.2, 1] }}
              />
              <motion.div
                key={`impact-flash-${impactPulse}`}
                className="pointer-events-none absolute left-1/2 bottom-[33.2%] h-4 w-20 -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(237,245,255,0.52),rgba(196,214,244,0.1)_48%,rgba(0,0,0,0)_76%)] mix-blend-screen blur-sm"
                initial={{ opacity: 0, scale: 0.4, y: 2 }}
                animate={{ opacity: [0, 0.3, 0], scale: [0.4, 1, 1.16], y: [2, 0, 0] }}
                transition={{ duration: 0.28, ease: [0.2, 0.82, 0.24, 1] }}
              />
            </>
          ) : null}

          <div className="relative [perspective:1600px] [perspective-origin:50%_65%]">
            <motion.div
              className="relative h-[720px] w-[360px] md:h-[820px] md:w-[420px]"
              initial="hold"
              animate={seq}
              variants={phoneVariants}
              onAnimationComplete={handlePhoneAnimationComplete}
              style={{ transformStyle: "preserve-3d", transformOrigin: "50% 100%" }}
            >
              <div className="absolute inset-0 rounded-[3.2rem] overflow-hidden isolation-isolate">
                <div className="chv-glass-sheen absolute inset-0 rounded-[inherit] border border-white/10 bg-gradient-to-b from-white/12 to-black/45 shadow-[0_60px_120px_rgba(0,0,0,0.8)] backdrop-blur-xl" />
                <div className="absolute inset-[10px] rounded-[inherit] border border-white/10 bg-black/40" />
                <div className="absolute left-1/2 top-4 h-3 w-24 -translate-x-1/2 rounded-full border border-white/10 bg-black/70" />
                <PhoneReels items={items} />
              </div>
            </motion.div>
          </div>
        </div>
      </SceneShell>

      <motion.div
        className="pointer-events-none absolute inset-0 z-[60] bg-black"
        initial={{ opacity: 1 }}
        animate={{ opacity: [1, 1, 0] }}
        transition={{ duration: 0.9, times: [0, 0.44, 1], ease: "easeOut" }}
      />
    </div>
  );
}
