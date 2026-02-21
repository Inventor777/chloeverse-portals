"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneShell } from "@/components/SceneShell";
import { ReturnButton } from "@/components/ReturnButton";
import { ProjectsFieldWebGL } from "@/components/ProjectsFieldWebGL";
import { IphoneHeroGLB } from "@/components/projects/IphoneHeroGLB";
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

const PIXEL_EPSILON = 0.5;

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

function PhoneReels({
  items,
  interactive,
  className,
}: {
  items: ReelItem[];
  interactive: boolean;
  className?: string;
}) {
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
    <div className={`relative h-full w-full overflow-hidden bg-black ${className ?? ""}`.trim()}>
      <div
        ref={scrollerRef}
        className="chv-hide-scrollbar h-full w-full overflow-y-auto overscroll-contain snap-y snap-mandatory bg-black"
        style={{ pointerEvents: interactive ? "auto" : "none", touchAction: interactive ? "pan-y" : "none" }}
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
                      <div className="text-[11px] tracking-[0.58em] text-white/58">TRANSMISSION QUEUED</div>
                      <div className="mt-3 text-sm font-medium text-white/88">Signal pending.</div>
                      <div className="mt-2 text-xs text-white/46">Awaiting channel lock.</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.12),rgba(0,0,0,0.9)_72%)] opacity-60" />
            </div>

            <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-5">
              <div className="rounded-2xl border border-white/10 bg-black/42 px-4 py-3 backdrop-blur-xl shadow-[0_30px_80px_rgba(0,0,0,0.72)]">
                <div className="text-sm font-medium tracking-tight text-white/92">{item.title}</div>
                {item.subtitle ? <div className="mt-1 text-xs text-white/64">{item.subtitle}</div> : null}
                <div className="mt-2 text-[11px] text-white/44">{i === active ? "Signal stream active." : "\u00a0"}</div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [mounted, setMounted] = useState(false);
  const [showPhone, setShowPhone] = useState(false);
  const [debug, setDebug] = useState(false);
  const [screenRect, setScreenRect] = useState<{ left: number; top: number; width: number; height: number; radius: number } | null>(null);
  const screenOverlayRef = useRef<HTMLDivElement | null>(null);
  const screenBezelRef = useRef<HTMLDivElement | null>(null);

  const items = useMemo(
    () => (projectsVideos ?? []).map((item, index) => normalizeProjectItem(item, index)),
    []
  );

  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      setMounted(true);
      setDebug(new URLSearchParams(window.location.search).has("debug"));
    }, 0);
    const timer = window.setTimeout(() => setShowPhone(true), 1000);
    return () => {
      window.clearTimeout(bootTimer);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const prevDocOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevDocOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const handleScreenRect = useCallback((next: { left: number; top: number; width: number; height: number; radius: number }) => {
    setScreenRect((prev) => {
      if (!prev) return next;
      return (
        Math.abs(prev.left - next.left) > PIXEL_EPSILON ||
        Math.abs(prev.top - next.top) > PIXEL_EPSILON ||
        Math.abs(prev.width - next.width) > PIXEL_EPSILON ||
        Math.abs(prev.height - next.height) > PIXEL_EPSILON ||
        Math.abs(prev.radius - next.radius) > PIXEL_EPSILON
      )
        ? next
        : prev;
    });
  }, []);

  return (
    <main className="relative h-screen overflow-hidden overscroll-none bg-black supports-[height:100svh]:h-[100svh]">
      <ReturnButton label="Click to stay in the Chloeverse" />

      <div className="absolute inset-0">
        <SceneShell
          title="PROJECTS"
          subtitle="NIGHT-SIGNAL ARCHIVE IN CELESTIAL SILENCE."
          showStars={false}
          showIntroFade={false}
          overlayPreset="default"
          background={<ProjectsFieldWebGL mode="celestial" />}
          frameClassName="h-screen supports-[height:100svh]:h-[100svh] max-w-none px-5 pb-0 pt-8 md:px-10 md:pt-10 flex flex-col overflow-hidden"
          headerClassName="max-w-lg"
          titleClassName="text-[1.45rem] md:text-[2rem] tracking-[0.28em] font-medium"
          subtitleClassName="mt-3 text-xs md:text-sm uppercase tracking-[0.08em] text-white/62"
          contentClassName="mt-6 md:mt-8 flex-1 overflow-visible flex items-end justify-center"
        >
          <div className="relative flex h-full w-full items-end justify-center pb-10 md:pb-14">
            <div className="relative h-[min(86vh,920px)] w-[min(92vw,520px)]">
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 z-[10] h-[72%] w-[88%] -translate-x-1/2 -translate-y-1/2"
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 38%, rgba(0,0,0,0) 70%)",
                  filter: "blur(2px)",
                  opacity: showPhone ? 1 : 0,
                  transition: "opacity 600ms ease",
                }}
              />
              <div className="pointer-events-none absolute left-1/2 bottom-[10.5%] z-[11] h-40 w-[92%] -translate-x-1/2 rounded-[999px] bg-[radial-gradient(ellipse_at_center,rgba(228,236,252,0.22),rgba(174,196,235,0.06)_40%,rgba(0,0,0,0)_75%)] opacity-30" />
              {mounted && showPhone ? (
                <IphoneHeroGLB
                  className="z-[20]"
                  onScreenRect={mounted && debug ? handleScreenRect : undefined}
                  screenOverlayRef={screenOverlayRef}
                  screenBezelRef={screenBezelRef}
                  debug={mounted && debug}
                />
              ) : null}
            </div>
          </div>
        </SceneShell>

        <div className="absolute inset-0 z-[28]">
          <div
            id="projects-screen-bezel"
            ref={screenBezelRef}
            className="pointer-events-none absolute left-0 top-0 bg-black/95"
            style={{
              left: "0px",
              top: "0px",
              width: "0px",
              height: "0px",
              opacity: showPhone ? 1 : 0,
            }}
          />

          <div
            id="projects-screen-overlay"
            ref={screenOverlayRef}
            className="absolute left-0 top-0 overflow-hidden border border-white/10 bg-black"
            style={{
              left: "0px",
              top: "0px",
              width: "0px",
              height: "0px",
              overflow: "hidden",
              opacity: showPhone ? 1 : 0,
              pointerEvents: showPhone ? "auto" : "none",
              willChange: "left,top,width,height,opacity",
            }}
          >
            <div
              className="h-full w-full"
              style={{ filter: "brightness(1) saturate(1)", opacity: 1 }}
            >
              <PhoneReels items={items} interactive={showPhone} />
            </div>

            <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_22px_rgba(0,0,0,0.38)]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,255,255,0.1),rgba(0,0,0,0)_46%)]" />
          </div>

          {mounted && debug && screenRect ? (
            <div
              className="pointer-events-none absolute border border-cyan-200/60"
              style={{
                transform: `translate3d(${screenRect.left}px, ${screenRect.top}px, 0)`,
                width: screenRect.width,
                height: screenRect.height,
                borderRadius: screenRect.radius,
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
