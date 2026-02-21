import ChloeverseMainLanding from "@/components/home/ChloeverseMainLanding";
import { IBM_Plex_Mono, Rubik_Puddles } from "next/font/google";

const rubikPuddles = Rubik_Puddles({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export default function Home() {
  return (
    <ChloeverseMainLanding
      titleFontClassName={rubikPuddles.className}
      monoFontClassName={ibmPlexMono.className}
    />
  );
}
