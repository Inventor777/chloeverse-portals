"use client";

import { ArrowLeft } from "lucide-react";

function getReturnUrl() {
  if (typeof window === "undefined") return "https://imchloekang.com";
  const url = new URL(window.location.href);
  return url.searchParams.get("return") || "https://imchloekang.com";
}

export function ReturnButton({
  label = "Return to Chloeverse",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={getReturnUrl()}
      className={`fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm text-white/90 backdrop-blur-xl hover:bg-white/10 transition ${className}`.trim()}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </a>
  );
}
