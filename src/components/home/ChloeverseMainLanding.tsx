"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent,
} from "react";

type ChloeverseMainLandingProps = {
  titleFontClassName: string;
  monoFontClassName: string;
};

type SpotTarget = "title" | "tagline" | null;
type HoverRegion = "title" | "tagline" | "bg" | "none";
type CursorMode = "idle" | "text" | "bg";
type PortalPhase = "idle" | "entering" | "ready";

const TAGLINE = "where storytelling meets tomorrow";
const MENU_LINKS = [
  { href: "/projects", label: "PROJECTS" },
  { href: "/collabs", label: "COLLABS" },
  { href: "/work", label: "WORK" },
  { href: "/contact", label: "CONTACT" },
  { href: "/mediacard", label: "MEDIACARD" },
] as const;

const SPOTLIGHT_RADIUS = 70;
const BACKDROP_SPOTLIGHT_RADIUS = 34;
const RAINBOW_COLORS = ["#ff4ea8", "#ff8a3d", "#ffd646", "#8aff5c", "#4ce4ff", "#6f8dff", "#da6dff"];

function seeded(seed: number, offset: number): number {
  const value = Math.sin(seed * 78.233 + offset * 39.425) * 43758.5453;
  return value - Math.floor(value);
}

function colorAt(seed: number, offset: number): string {
  const index = Math.floor(seeded(seed, offset) * RAINBOW_COLORS.length) % RAINBOW_COLORS.length;
  return RAINBOW_COLORS[index];
}

export function paintStyle(seed: number): CSSProperties {
  const c1 = colorAt(seed, 1);
  const c2 = colorAt(seed, 2);
  const c3 = colorAt(seed, 3);
  const c4 = colorAt(seed, 4);
  const c5 = colorAt(seed, 5);

  const p1x = 16 + seeded(seed, 11) * 68;
  const p1y = 18 + seeded(seed, 12) * 64;
  const p2x = 14 + seeded(seed, 13) * 72;
  const p2y = 14 + seeded(seed, 14) * 70;
  const p3x = 18 + seeded(seed, 15) * 64;
  const p3y = 20 + seeded(seed, 16) * 66;
  const p4x = 12 + seeded(seed, 17) * 74;
  const p4y = 10 + seeded(seed, 18) * 76;
  const angle = Math.floor(seeded(seed, 19) * 360);

  const backgroundImage = [
    `radial-gradient(circle at ${p1x}% ${p1y}%, ${c1} 0%, ${c1} 27%, transparent 62%)`,
    `radial-gradient(circle at ${p2x}% ${p2y}%, ${c2} 0%, ${c2} 24%, transparent 58%)`,
    `radial-gradient(circle at ${p3x}% ${p3y}%, ${c3} 0%, ${c3} 26%, transparent 60%)`,
    `radial-gradient(circle at ${p4x}% ${p4y}%, ${c4} 0%, ${c4} 22%, transparent 52%)`,
    `conic-gradient(from ${angle}deg at 52% 50%, ${c5}, ${c1}, ${c2}, ${c3}, ${c5})`,
  ].join(", ");

  return {
    backgroundImage,
    backgroundBlendMode: "screen,screen,screen,screen,normal",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    WebkitTextStroke: "0.6px rgba(255,255,255,0.22)",
    textShadow: "0 0 10px rgba(255,255,255,0.16), 0 0 26px rgba(255,255,255,0.08)",
  };
}

export function paintBackdropStyle(seed: number): CSSProperties {
  const broadLayers: string[] = [];
  const broadSizes: string[] = [];
  const broadPositions: string[] = [];
  const microLayers: string[] = [];
  const microSizes: string[] = [];
  const microPositions: string[] = [];

  for (let i = 0; i < 12; i += 1) {
    const c1 = colorAt(seed, 300 + i * 3);
    const c2 = colorAt(seed, 301 + i * 3);
    const c3 = colorAt(seed, 302 + i * 3);
    const size = [140, 180, 220][i % 3];
    const px = Math.floor(seeded(seed, 350 + i) * size);
    const py = Math.floor(seeded(seed, 390 + i) * size);

    if (i % 4 === 0) {
      broadLayers.push(
        `conic-gradient(from ${Math.floor(seeded(seed, 420 + i) * 360)}deg at 50% 50%, ${c1} 0deg, ${c2} 132deg, ${c3} 248deg, ${c1} 360deg)`,
      );
    } else {
      const alpha = i === 1 ? 0.98 : 0.52;
      broadLayers.push(
        `linear-gradient(${Math.floor(seeded(seed, 450 + i) * 360)}deg, ${c1}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")} 0%, ${c2}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")} 52%, ${c3}${Math.round(alpha * 255)
          .toString(16)
          .padStart(2, "0")} 100%)`,
      );
    }

    broadSizes.push(`${size}px ${size}px`);
    broadPositions.push(`${px}px ${py}px`);
  }

  for (let i = 0; i < 16; i += 1) {
    const color = colorAt(seed, 600 + i);
    const x = Math.floor(10 + seeded(seed, 650 + i) * 80);
    const y = Math.floor(10 + seeded(seed, 700 + i) * 80);
    const radius = Math.floor(10 + seeded(seed, 750 + i) * 16);
    const fade = radius + Math.floor(3 + seeded(seed, 800 + i) * 6);
    const size = [92, 108, 124, 140][i % 4];
    const px = Math.floor(seeded(seed, 840 + i) * size);
    const py = Math.floor(seeded(seed, 880 + i) * size);

    microLayers.push(`radial-gradient(circle at ${x}% ${y}%, ${color} 0 ${radius}px, rgba(0,0,0,0) ${fade}px)`);
    microSizes.push(`${size}px ${size}px`);
    microPositions.push(`${px}px ${py}px`);
  }

  return {
    backgroundImage: [...microLayers, ...broadLayers].join(", "),
    backgroundSize: [...microSizes, ...broadSizes].join(", "),
    backgroundPosition: [...microPositions, ...broadPositions].join(", "),
    backgroundRepeat: "repeat",
    opacity: 1,
  };
}

function setMaskPosition(node: HTMLElement | null, x: number, y: number): void {
  if (!node) {
    return;
  }
  node.style.setProperty("--mx", `${x}px`);
  node.style.setProperty("--my", `${y}px`);
  node.style.setProperty("--r", `${SPOTLIGHT_RADIUS}px`);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pointInRect(x: number, y: number, rect: DOMRect): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function typingDelay(char: string): number {
  let ms = 55;
  if (char === " ") {
    ms += 120;
  }
  if (/[.,!?;:]/.test(char)) {
    ms += 220;
  }
  return ms;
}

export default function ChloeverseMainLanding({ titleFontClassName, monoFontClassName }: ChloeverseMainLandingProps) {
  const bgRainbowRef = useRef<HTMLDivElement>(null);
  const titleHitRef = useRef<HTMLDivElement>(null);
  const titleOverlayRef = useRef<HTMLDivElement>(null);
  const taglineHitRef = useRef<HTMLDivElement>(null);
  const taglineOverlayRef = useRef<HTMLParagraphElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const titleMaskTargetRef = useRef({ x: 0, y: 0 });
  const titleMaskCurrentRef = useRef({ x: 0, y: 0 });
  const taglineMaskTargetRef = useRef({ x: 0, y: 0 });
  const taglineMaskCurrentRef = useRef({ x: 0, y: 0 });
  const bgRadiusTargetRef = useRef(0);
  const bgRadiusCurrentRef = useRef(0);
  const hoverRegionRef = useRef<HoverRegion>("none");
  const portalTriggeredRef = useRef(false);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isFinePointer, setIsFinePointer] = useState(false);
  const [titleEntered, setTitleEntered] = useState(false);
  const [typedText, setTypedText] = useState("");
  const [typingDone, setTypingDone] = useState(false);
  const [activeSpotTarget, setActiveSpotTarget] = useState<SpotTarget>(null);
  const [hasPointer, setHasPointer] = useState(false);
  const [cursorMode, setCursorMode] = useState<CursorMode>("idle");
  const [portalPhase, setPortalPhase] = useState<PortalPhase>("idle");

  const backdropPaint = useMemo(() => paintBackdropStyle(933), []);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncMotion = () => setPrefersReducedMotion(reducedMotionQuery.matches);
    const syncPointer = () => {
      const fine = finePointerQuery.matches;
      setIsFinePointer(fine);
      if (!fine) {
        hoverRegionRef.current = "none";
        bgRadiusTargetRef.current = 0;
        bgRadiusCurrentRef.current = 0;
        setActiveSpotTarget(null);
        setCursorMode("idle");
        setHasPointer(false);
        if (bgRainbowRef.current) {
          bgRainbowRef.current.style.setProperty("--bgr", "0px");
        }
      }
    };

    syncMotion();
    syncPointer();

    reducedMotionQuery.addEventListener("change", syncMotion);
    finePointerQuery.addEventListener("change", syncPointer);

    return () => {
      reducedMotionQuery.removeEventListener("change", syncMotion);
      finePointerQuery.removeEventListener("change", syncPointer);
    };
  }, []);

  useEffect(() => {
    const syncCenters = () => {
      const titleRect = titleHitRef.current?.getBoundingClientRect();
      if (titleRect) {
        const centered = { x: titleRect.width * 0.5, y: titleRect.height * 0.5 };
        titleMaskTargetRef.current = centered;
        titleMaskCurrentRef.current = centered;
        setMaskPosition(titleOverlayRef.current, centered.x, centered.y);
      }

      const taglineRect = taglineHitRef.current?.getBoundingClientRect();
      if (taglineRect) {
        const centered = { x: taglineRect.width * 0.5, y: taglineRect.height * 0.5 };
        taglineMaskTargetRef.current = centered;
        taglineMaskCurrentRef.current = centered;
        setMaskPosition(taglineOverlayRef.current, centered.x, centered.y);
      }
    };

    syncCenters();
    window.addEventListener("resize", syncCenters);
    return () => window.removeEventListener("resize", syncCenters);
  }, []);

  useEffect(() => {
    let titleTimer = 0;
    let stepTimer = 0;
    let startTimer = 0;

    const kickoffTimer = window.setTimeout(() => {
      if (prefersReducedMotion) {
        setTitleEntered(true);
        setTypedText(TAGLINE);
        setTypingDone(true);
        return;
      }

      setTitleEntered(false);
      setTypedText("");
      setTypingDone(false);

      titleTimer = window.setTimeout(() => {
        setTitleEntered(true);
      }, 32);

      startTimer = window.setTimeout(() => {
        let index = 0;
        const tick = () => {
          index += 1;
          setTypedText(TAGLINE.slice(0, index));
          if (index >= TAGLINE.length) {
            setTypingDone(true);
            return;
          }
          stepTimer = window.setTimeout(tick, typingDelay(TAGLINE[index - 1]));
        };
        tick();
      }, 1000);
    }, 0);

    return () => {
      window.clearTimeout(kickoffTimer);
      window.clearTimeout(titleTimer);
      window.clearTimeout(startTimer);
      window.clearTimeout(stepTimer);
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isFinePointer) {
      if (bgRainbowRef.current) {
        bgRainbowRef.current.style.setProperty("--bgr", "0px");
      }
      return;
    }

    let frame = 0;
    const pointerLerp = prefersReducedMotion ? 1 : 0.16;
    const maskLerp = prefersReducedMotion ? 1 : 0.2;
    const bgLerp = prefersReducedMotion ? 1 : 0.25;

    const animate = () => {
      const pointerTarget = pointerTargetRef.current;
      const pointerCurrent = pointerCurrentRef.current;
      pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * pointerLerp;
      pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * pointerLerp;

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${pointerCurrent.x}px, ${pointerCurrent.y}px, 0) translate(-50%, -50%)`;
      }

      const titleTarget = titleMaskTargetRef.current;
      const titleCurrent = titleMaskCurrentRef.current;
      titleCurrent.x += (titleTarget.x - titleCurrent.x) * maskLerp;
      titleCurrent.y += (titleTarget.y - titleCurrent.y) * maskLerp;
      setMaskPosition(titleOverlayRef.current, titleCurrent.x, titleCurrent.y);

      const taglineTarget = taglineMaskTargetRef.current;
      const taglineCurrent = taglineMaskCurrentRef.current;
      taglineCurrent.x += (taglineTarget.x - taglineCurrent.x) * maskLerp;
      taglineCurrent.y += (taglineTarget.y - taglineCurrent.y) * maskLerp;
      setMaskPosition(taglineOverlayRef.current, taglineCurrent.x, taglineCurrent.y);

      bgRadiusTargetRef.current = hoverRegionRef.current === "bg" ? BACKDROP_SPOTLIGHT_RADIUS : 0;
      bgRadiusCurrentRef.current += (bgRadiusTargetRef.current - bgRadiusCurrentRef.current) * bgLerp;

      if (bgRainbowRef.current) {
        bgRainbowRef.current.style.setProperty("--bgx", `${pointerCurrent.x}px`);
        bgRainbowRef.current.style.setProperty("--bgy", `${pointerCurrent.y}px`);
        bgRainbowRef.current.style.setProperty("--bgr", `${Math.max(0, bgRadiusCurrentRef.current)}px`);
      }

      frame = window.requestAnimationFrame(animate);
    };

    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [isFinePointer, prefersReducedMotion]);

  useEffect(() => {
    if (portalTriggeredRef.current) {
      return;
    }

    const onScroll = () => {
      if (portalTriggeredRef.current || window.scrollY <= 24) {
        return;
      }
      portalTriggeredRef.current = true;
      setPortalPhase("entering");
      window.removeEventListener("scroll", onScroll);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (portalPhase !== "entering") {
      return;
    }
    const timer = window.setTimeout(
      () => {
        setPortalPhase("ready");
      },
      prefersReducedMotion ? 0 : 900,
    );
    return () => window.clearTimeout(timer);
  }, [portalPhase, prefersReducedMotion]);

  const updateMaskTarget = (
    clientX: number,
    clientY: number,
    host: HTMLElement | null,
    targetRef: MutableRefObject<{ x: number; y: number }>,
  ) => {
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    targetRef.current = {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  };

  const applyRegion = (region: HoverRegion) => {
    if (region === hoverRegionRef.current) {
      return;
    }

    hoverRegionRef.current = region;
    if (region === "title" || region === "tagline") {
      setActiveSpotTarget(region);
      setCursorMode("text");
      return;
    }
    if (region === "bg") {
      setActiveSpotTarget(null);
      setCursorMode("bg");
      return;
    }
    setActiveSpotTarget(null);
    setCursorMode("idle");
  };

  const onRootPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (!isFinePointer) {
      return;
    }

    const clientX = event.clientX;
    const clientY = event.clientY;
    pointerTargetRef.current = { x: clientX, y: clientY };

    const titleRect = titleHitRef.current?.getBoundingClientRect();
    const taglineRect = taglineHitRef.current?.getBoundingClientRect();

    if (titleRect && pointInRect(clientX, clientY, titleRect)) {
      updateMaskTarget(clientX, clientY, titleHitRef.current, titleMaskTargetRef);
      applyRegion("title");
    } else if (taglineRect && pointInRect(clientX, clientY, taglineRect)) {
      updateMaskTarget(clientX, clientY, taglineHitRef.current, taglineMaskTargetRef);
      applyRegion("tagline");
    } else {
      applyRegion("bg");
    }

    setHasPointer(true);
  };

  const renderPaintedText = (text: string, seedStart: number) =>
    Array.from(text).map((char, index) => {
      if (char === " ") {
        return (
          <span key={`${seedStart}-${index}`} aria-hidden>
            &nbsp;
          </span>
        );
      }
      return (
        <span key={`${seedStart}-${index}`} style={paintStyle(seedStart + index * 17)}>
          {char}
        </span>
      );
    });

  const renderPlainText = (text: string, seedStart: number) =>
    Array.from(text).map((char, index) => (
      <span key={`${seedStart}-${index}`} className="text-white [text-shadow:0_0_12px_rgba(255,255,255,0.2)]">
        {char === " " ? "\u00A0" : char}
      </span>
    ));

  const heroTransition = prefersReducedMotion
    ? "none"
    : "opacity 700ms cubic-bezier(0.16, 1, 0.3, 1), transform 700ms cubic-bezier(0.16, 1, 0.3, 1)";

  return (
    <main
      onPointerMove={onRootPointerMove}
      onPointerLeave={() => {
        applyRegion("none");
        bgRadiusTargetRef.current = 0;
        setHasPointer(false);
      }}
      className={`relative min-h-[240vh] overflow-x-clip bg-black text-white ${isFinePointer ? "chv-home-cursorless" : ""}`}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 chv-vignette" />
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 chv-filmgrain" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[1]">
        <div ref={bgRainbowRef} className="absolute inset-0 home-bg-rainbow home-spotlight-mask-bg" style={backdropPaint} />
      </div>

      {isFinePointer ? (
        <div ref={cursorRef} aria-hidden className="pointer-events-none fixed left-0 top-0 z-50" style={{ opacity: hasPointer ? 1 : 0 }}>
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height,background-color,border-color,box-shadow,opacity] duration-200 ${
              cursorMode === "text"
                ? "home-cursor-inner--text"
                : cursorMode === "bg"
                  ? "home-cursor-inner--bg"
                  : "home-cursor-inner--idle"
            }`}
          />
          <div
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[width,height,box-shadow,opacity] duration-200 ${
              cursorMode === "text"
                ? "home-cursor-glow--text"
                : cursorMode === "bg"
                  ? "home-cursor-glow--bg"
                  : "home-cursor-glow--idle"
            }`}
          />
        </div>
      ) : null}

      <section className="sticky top-0 z-10 flex min-h-screen items-center justify-center px-6">
        <div className="relative flex w-full max-w-6xl flex-col items-center text-center">
          <div
            ref={titleHitRef}
            className="relative inline-block select-none"
            style={{
              opacity: titleEntered ? 1 : 0,
              transform: titleEntered ? "translateY(0)" : "translateY(10px)",
              transition: heroTransition,
            }}
          >
            <div className={`${titleFontClassName} leading-[0.84] tracking-[0.02em]`}>
              <p className="text-[clamp(1.6rem,3vw,3rem)]">{renderPaintedText("The", 101)}</p>
              <p className="mt-2 text-[clamp(4.8rem,9vw,9rem)]">{renderPaintedText("Chloeverse", 270)}</p>
            </div>

            <div
              ref={titleOverlayRef}
              aria-hidden
              className={`pointer-events-none absolute inset-0 chv-spotlight-mask transition-opacity duration-200 ${
                isFinePointer && activeSpotTarget === "title" ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className={`${titleFontClassName} leading-[0.84] tracking-[0.02em]`}>
                <p className="text-[clamp(1.6rem,3vw,3rem)]">{renderPlainText("The", 401)}</p>
                <p className="mt-2 text-[clamp(4.8rem,9vw,9rem)]">{renderPlainText("Chloeverse", 570)}</p>
              </div>
            </div>
          </div>

          <div className="mt-10 h-14">
            <div
              ref={taglineHitRef}
              className={`${monoFontClassName} relative inline-block text-[clamp(0.95rem,1.85vw,1.2rem)] tracking-[0.13em] text-white`}
            >
              <p className="whitespace-pre">
                {typedText}
                <span aria-hidden className={`chv-type-cursor ${typingDone ? "chv-type-cursor-done" : ""}`}>
                  |
                </span>
              </p>

              <p
                ref={taglineOverlayRef}
                aria-hidden
                className={`pointer-events-none absolute inset-0 whitespace-pre chv-spotlight-mask transition-opacity duration-200 ${
                  isFinePointer && activeSpotTarget === "tagline" ? "opacity-100" : "opacity-0"
                }`}
              >
                {renderPaintedText(typedText, 800)}
                <span className={`chv-type-cursor ${typingDone ? "chv-type-cursor-done" : ""}`}>|</span>
              </p>
            </div>
          </div>

          <p
            className={`${monoFontClassName} mt-16 text-[11px] uppercase tracking-[0.38em] text-white/58 ${
              prefersReducedMotion ? "" : "animate-pulse"
            }`}
          >
            scroll for portals
          </p>
        </div>
      </section>

      <section className="relative z-20 h-[140vh] px-6 pt-[55vh] pb-24">
        <div className="sticky top-[18px] flex w-full justify-center">
          {portalPhase === "entering" ? (
            <p
              className={`${monoFontClassName} rounded-full border border-white/14 bg-black/35 px-5 py-2 text-[0.78rem] tracking-[0.22em] text-white/85 backdrop-blur-sm ${
                prefersReducedMotion ? "" : "home-blink"
              }`}
            >
              ENTERING MAIN PORTAL
            </p>
          ) : null}

          {portalPhase === "ready" ? (
            <nav
              aria-label="Primary navigation"
              className={`${monoFontClassName} inline-flex items-center gap-6 rounded-full border border-white/12 bg-black/30 px-6 py-3 text-[0.72rem] tracking-[0.24em] text-white/76 backdrop-blur-md sm:gap-8`}
            >
              {MENU_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative whitespace-nowrap transition-colors duration-300 hover:text-white focus-visible:text-white"
                >
                  <span>{link.label}</span>
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 opacity-85 transition-transform duration-300 group-hover:scale-x-100 group-focus-visible:scale-x-100"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, rgba(255,82,173,0.95) 0%, rgba(255,213,74,0.95) 30%, rgba(76,228,255,0.95) 62%, rgba(143,255,94,0.95) 100%)",
                    }}
                  />
                </Link>
              ))}
            </nav>
          ) : null}
        </div>
      </section>
    </main>
  );
}
