"use client";

import { CollabsExperience } from "@/components/collabs/CollabsExperience";
import { ReturnButton } from "@/components/ReturnButton";
import { collabVideos } from "@/lib/portalData";

export default function CollabsPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <CollabsExperience videos={collabVideos} />

      <div className="pointer-events-none absolute left-5 top-4 z-20">
        <h1 className="text-[10px] font-medium uppercase tracking-[0.42em] text-white/62 md:text-[11px]">COLLABS</h1>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/42 md:text-[11px]">Broadcast archive</p>
      </div>

      <ReturnButton label="Return" className="opacity-55 hover:opacity-95" />
    </main>
  );
}
