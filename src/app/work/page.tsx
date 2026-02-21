import { ReturnButton } from "@/components/ReturnButton";
import MatrixWorkStation3D from "@/components/work/MatrixWorkStation3D";
import { workTerminalSections } from "@/lib/portalData";

export default function WorkPage() {
  return (
    <div className="relative min-h-screen chv-matrix-bg">
      <ReturnButton className="bottom-4 left-4 border-emerald-200/14 bg-black/34 px-3 py-1.5 text-xs text-emerald-100/78 opacity-0 chv-hud-fade-in hover:bg-emerald-200/8 sm:bottom-5 sm:left-5" />

      <main className="relative z-10 flex min-h-screen w-full items-center justify-center px-0">
        <MatrixWorkStation3D sections={workTerminalSections} />
      </main>
    </div>
  );
}
