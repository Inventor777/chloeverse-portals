"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  forwardRef,
  startTransition,
  useRef,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useReducedMotion } from "framer-motion";

type MobileRouteLinkProps = {
  href: string;
  accent: string;
  label: string;
  children: ReactNode;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children">;

function spawnTransitionOverlay(accent: string, label: string) {
  const existing = document.querySelector("[data-mobile-route-transition='true']");
  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement("div");
  overlay.setAttribute("data-mobile-route-transition", "true");
  overlay.className = "chv-mobile-route-transition";
  overlay.style.setProperty("--transition-accent", accent);
  overlay.innerHTML = `
    <div class="chv-mobile-route-transition__field"></div>
    <div class="chv-mobile-route-transition__spine"></div>
    <div class="chv-mobile-route-transition__orb"></div>
    <div class="chv-mobile-route-transition__label">${label}</div>
  `;

  document.body.appendChild(overlay);
  window.requestAnimationFrame(() => {
    overlay.dataset.active = "true";
  });

  window.setTimeout(() => {
    overlay.dataset.active = "false";
    window.setTimeout(() => overlay.remove(), 420);
  }, 720);
}

function withViewOverride(href: string): string {
  if (typeof window === "undefined") return href;
  const current = new URL(window.location.href);
  const next = new URL(href, current.origin);
  if (next.origin !== current.origin) return next.href;

  const view = current.searchParams.get("view");
  if (!view) return href;

  if (!next.searchParams.has("view")) {
    next.searchParams.set("view", view);
  }

  return `${next.pathname}${next.search}${next.hash}`;
}

export const MobileRouteLink = forwardRef<HTMLAnchorElement, MobileRouteLinkProps>(function MobileRouteLink(
  {
    href,
    accent,
    label,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const navigatingRef = useRef(false);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      navigatingRef.current
    ) {
      return;
    }

    event.preventDefault();
    navigatingRef.current = true;

    spawnTransitionOverlay(accent, label);

    const nextHref = withViewOverride(href);
    const delay = reducedMotion ? 0 : 180;
    window.setTimeout(() => {
      if (new URL(nextHref, window.location.origin).origin !== window.location.origin) {
        window.location.assign(nextHref);
        return;
      }

      startTransition(() => {
        router.push(nextHref);
      });
      window.setTimeout(() => {
        navigatingRef.current = false;
      }, 280);
    }, delay);
  };

  return (
    <Link href={href} onClick={handleClick} ref={ref} {...rest}>
      {children}
    </Link>
  );
});
