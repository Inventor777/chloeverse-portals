import type { ReelItem } from "@/components/collabs/reelsData";

export const HOME_PORTALS = [
  {
    href: "/projects",
    label: "PROJECTS",
    displayTitle: "things i've made",
    subtitle: "films, edits, experiments",
    sigil: "I",
    accent: "#ff8d5c",
    mobileEnabled: true,
  },
  {
    href: "/collabs",
    label: "COLLABS",
    displayTitle: "things we've made",
    subtitle: "brand work, invited rooms",
    sigil: "II",
    accent: "#80a9ff",
    mobileEnabled: true,
  },
  {
    href: "/work",
    label: "WORK",
    displayTitle: "where i've been",
    subtitle: "roles, timeline, wins",
    sigil: "III",
    accent: "#8de7ad",
    mobileEnabled: true,
  },
  {
    href: "https://trueme.io",
    label: "STARTUP",
    displayTitle: "what's launching next",
    subtitle: "teaser, waitlist, reveal",
    sigil: "IV",
    accent: "#d7d7d7",
    mobileEnabled: true,
  },
  {
    href: "/contact",
    label: "CONTACT",
    displayTitle: "where to find me",
    subtitle: "notes, inquiries, hello",
    sigil: "V",
    accent: "#ffbf72",
    mobileEnabled: true,
  },
  {
    href: "/mediacard",
    label: "MEDIACARD",
    displayTitle: "what the numbers say",
    subtitle: "audience, rates, partners",
    sigil: "VI",
    accent: "#ead2a7",
    mobileEnabled: true,
  },
] as const;

export type MobileProjectReel = {
  id: string;
  instagramUrl: string;
  coverImage: string;
  videoSrc: string;
  posterAlt: string;
  durationLabel: string;
  metrics?: {
    likes?: string;
    comments?: string;
    shares?: string;
  };
};

export const DESKTOP_PROJECT_REEL_ORDER = ["r3", "r4", "r12", "r5", "r6", "r11", "r10", "r9", "r8", "r7"] as const;

export const PROJECT_REELS: MobileProjectReel[] = [
  {
    id: "r3",
    instagramUrl: "https://www.instagram.com/reel/DTZ2XtNkeNC/",
    coverImage: "/projects/reels/r3/cover.jpg",
    videoSrc: "/projects/reels/r3/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DTZ2XtNkeNC.",
    durationLabel: "1:03",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r4",
    instagramUrl: "https://www.instagram.com/reel/DR_GW1BkQci/",
    coverImage: "/projects/reels/r4/cover.jpg",
    videoSrc: "/projects/reels/r4/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DR_GW1BkQci.",
    durationLabel: "0:19",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r12",
    instagramUrl: "https://www.instagram.com/p/DVcRnM5kurR/",
    coverImage: "/projects/reels/r12/cover.jpg",
    videoSrc: "/projects/reels/r12/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DVcRnM5kurR.",
    durationLabel: "1:26",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r5",
    instagramUrl: "https://www.instagram.com/reel/DSitVRLkjEf/",
    coverImage: "/projects/reels/r5/cover.jpg",
    videoSrc: "/projects/reels/r5/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DSitVRLkjEf.",
    durationLabel: "0:16",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r6",
    instagramUrl: "https://www.instagram.com/reel/DOH8x_gk2Ew/",
    coverImage: "/projects/reels/r6/cover.jpg",
    videoSrc: "/projects/reels/r6/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DOH8x_gk2Ew.",
    durationLabel: "0:07",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r7",
    instagramUrl: "https://www.instagram.com/reel/DOQ-ZxuEzan/",
    coverImage: "/projects/reels/r7/cover.jpg",
    videoSrc: "/projects/reels/r7/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DOQ-ZxuEzan.",
    durationLabel: "0:14",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r8",
    instagramUrl: "https://www.instagram.com/reel/DObX6ceE-di/",
    coverImage: "/projects/reels/r8/cover.jpg",
    videoSrc: "/projects/reels/r8/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DObX6ceE-di.",
    durationLabel: "0:21",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r9",
    instagramUrl: "https://www.instagram.com/reel/DOsvvxCkUxJ/",
    coverImage: "/projects/reels/r9/cover.jpg",
    videoSrc: "/projects/reels/r9/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DOsvvxCkUxJ.",
    durationLabel: "0:18",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r10",
    instagramUrl: "https://www.instagram.com/reel/DMLYWLOhTfg/",
    coverImage: "/projects/reels/r10/cover.jpg",
    videoSrc: "/projects/reels/r10/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DMLYWLOhTfg.",
    durationLabel: "0:14",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
  {
    id: "r11",
    instagramUrl: "https://www.instagram.com/reel/DMxxlTEp98D/",
    coverImage: "/projects/reels/r11/cover.jpg",
    videoSrc: "/projects/reels/r11/video.mp4",
    posterAlt: "Instagram reel cover for Chloe Kang reel DMxxlTEp98D.",
    durationLabel: "0:10",
    metrics: {
      likes: "watch",
      comments: "swipe",
      shares: "source",
    },
  },
];

export const WORK_ROLE_STACK = [
  "Creator",
  "Founder",
  "Creative strategist",
  "Growth Marketer",
] as const;

export const WORK_INTRO_COPY = "Here's what I've been up to the past few years!";

export type WorkEntry = {
  title: string;
  date: string;
  location: string;
  type?: string;
  bullets: string[];
};

export const WORK_ENTRIES: WorkEntry[] = [
  {
    title: "Stealth Startup - Founder",
    date: "Feb 2026 - Present",
    location: "Remote",
    bullets: ["More news soon."],
  },
  {
    title: "Adobe - AI Search",
    date: "Jan 2026 - Present",
    location: "Los Angeles Metropolitan Area  Remote",
    type: "Contract",
    bullets: ["Search optimization for LLM training & retrieval. Not via an organization on campus."],
  },
  {
    title: "Instagram - Creator",
    date: "Jul 2025 - Present",
    location: "Los Angeles, California, United States  Hybrid",
    type: "Self-employed",
    bullets: [
      "300K+ followers",
      "250M views",
      "Grew IG from 0 to 140k+ in 3 months",
      "Viral series accumulated 200M views & attention from major news outlets",
      "Worked with Adidas, Adobe, Estee Lauder, OpenAI, Hera, etc.",
    ],
  },
  {
    title: "Single Origin Studios - CEO",
    date: "Jun 2023 - Jan 2026",
    location: "Los Angeles, California, United States  Remote",
    type: "Self-employed",
    bullets: [
      "Marketing consulting",
      "Previous experience with YC backed startups",
      "Full in house marketing with UGC team management",
      "Scaled brands from 0 to 50k+ users in 2 months",
      "Generated 6 figures of revenue",
      "Worked with pre-seed and early stage",
    ],
  },
  {
    title: "Outsmart - Product Marketing",
    date: "Sep 2025 - Dec 2025",
    location: "Los Angeles, California, United States  Hybrid",
    type: "Contract",
    bullets: [
      "Product and growth directly under ex-CMO @ Duolingo, $38M raised, backed by DST Global, Lightspeed, Khosla Ventures, execs from OpenAI & Quora.",
    ],
  },
  {
    title: "Stealth AI Startup - Head of Growth",
    date: "Jun 2025 - Sep 2025",
    location: "San Francisco, California, United States  On-site",
    type: "Full-time",
    bullets: ["Product and growth for B2C fashion tech, backed by execs from Shopify and Pinterest."],
  },
  {
    title: "Soluna - Product Marketing Intern",
    date: "Oct 2024 - Jun 2025",
    location: "Los Angeles, California, United States  Remote",
    type: "Internship",
    bullets: ["Streamlined Solunas GTM, drove 179% increase in revenue in US market."],
  },
  {
    title: "Headspace - Digital Marketing Intern",
    date: "May 2022 - Sep 2023",
    location: "Los Angeles, California, United States  Remote",
    type: "Internship",
    bullets: ["Tripled Headspaces social media presence in one year, youngest employee to earn an extended contract."],
  },
];

export const WORK_HIGHLIGHTS = [
  "300K+ followers",
  "250M views",
  "200M views from viral series",
  "6 figures of revenue generated",
  "179% increase in revenue in the US market",
  "Tripled Headspaces social presence in one year",
] as const;

export const CONTACT_DETAILS = {
  name: "Chloe Kang",
  email: "ugcbychloekang@gmail.com",
  instagram: "https://instagram.com/imchloekang",
  tiktok: "https://www.tiktok.com/@imchloekang",
  linkedin: "https://www.linkedin.com/in/chloe-kang-234292250/",
  x: "https://x.com/ChloeKa39867633",
  candy: "https://imchloekang.com",
} as const;

export type ContactCarouselItem = {
  id: "contact" | "instagram" | "tiktok" | "linkedin" | "x";
  label: string;
  href?: string;
  accent: string;
  glow: string;
  surface: string;
  icon: "contact" | "instagram" | "tiktok" | "linkedin" | "x";
};

export const CONTACT_CAROUSEL_ITEMS: ContactCarouselItem[] = [
  {
    id: "contact",
    label: "Contact Card",
    accent: "#e8b47d",
    glow: "rgba(232,180,125,0.24)",
    surface: "linear-gradient(180deg,#f9e9d6_0%,#b58657_100%)",
    icon: "contact",
  },
  {
    id: "instagram",
    label: "Instagram",
    href: CONTACT_DETAILS.instagram,
    accent: "#f24ab7",
    glow: "rgba(242,74,183,0.2)",
    surface: "linear-gradient(180deg,#ffd65f_0%,#e92b7f_54%,#5848ff_100%)",
    icon: "instagram",
  },
  {
    id: "tiktok",
    label: "TikTok",
    href: CONTACT_DETAILS.tiktok,
    accent: "#25f4ee",
    glow: "rgba(37,244,238,0.18)",
    surface: "linear-gradient(180deg,#121318_0%,#030305_100%)",
    icon: "tiktok",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    href: CONTACT_DETAILS.linkedin,
    accent: "#0a66c2",
    glow: "rgba(10,102,194,0.18)",
    surface: "linear-gradient(180deg,#3190ff_0%,#0a66c2_48%,#063f81_100%)",
    icon: "linkedin",
  },
  {
    id: "x",
    label: "X",
    href: CONTACT_DETAILS.x,
    accent: "#e7edf5",
    glow: "rgba(231,237,245,0.14)",
    surface: "linear-gradient(180deg,#272c35_0%,#0a0b0e_56%,#000000_100%)",
    icon: "x",
  },
] as const;

export const MEDIACARD_AUDIENCE = ["United States", "Canada", "Australia", "South Korea"] as const;

export const MEDIACARD_METRICS = [
  { label: "Instagram", value: "160K" },
  { label: "TikTok", value: "160K" },
  { label: "Views", value: "12M monthly" },
  { label: "Engagement", value: "12%" },
] as const;

export const MEDIACARD_SERVICES = {
  brandPartnerships: [
    "Per Video (Posted on one platform): $3,000",
    "Cross posted across platforms: $4,000",
    "Link in bio per every 7 days: Additional $100",
    "Whitelisting (per 15 days): Additional $100",
    "Usage rights (per 30 days): Additional $200",
  ],
  diningPartnerships: [
    "Cross Posted across platforms with Instagram story coverage included",
    "Per Cross Posted Video: Hosted dining experience for desired party size",
  ],
} as const;

export type MobileMediaCardCollab = {
  name: string;
  logoSrc: string;
  logoHeightClassName?: string;
};

export const MEDIACARD_COLLABS: readonly MobileMediaCardCollab[] = [
  { name: "Adobe", logoSrc: "/mediacard/logos/adobe.png" },
  { name: "Adidas", logoSrc: "/mediacard/logos/adidas.png" },
  { name: "OpenAI", logoSrc: "/mediacard/logos/openai.png" },
  { name: "BTS", logoSrc: "/mediacard/logos/bts.png", logoHeightClassName: "h-9" },
  { name: "Estee Lauder", logoSrc: "/mediacard/logos/esteelauder.png" },
  { name: "Armani", logoSrc: "/mediacard/logos/armani.svg", logoHeightClassName: "h-9" },
] as const;

export function getCollabBrandLabel(item: ReelItem): string {
  return item.title;
}

export function getCollabMediumLabel(url: string): "Instagram Reel" | "Instagram Post" {
  return url.includes("/reel/") ? "Instagram Reel" : "Instagram Post";
}
