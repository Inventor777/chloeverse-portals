export type VideoItem = {
  id: string;
  title: string;
  brand?: string;
  // Use either an embedUrl (iframe) or a direct mp4 (video).
  embedUrl?: string;
  mp4Url?: string;
  caption?: string;
};

export const projectsVideos: VideoItem[] = [
  {
    id: "p1",
    title: "Project Video 01",
    caption: "Replace with TikTok/Reel embed or MP4.",
    // embedUrl: "https://www.tiktok.com/embed/v2/XXXXXXXX",
    mp4Url: "",
  },
  { id: "p2", title: "Project Video 02", caption: "Replace me.", mp4Url: "" },
  { id: "p3", title: "Project Video 03", caption: "Replace me.", mp4Url: "" },
];

export const collabVideos: VideoItem[] = [
  { id: "c1", title: "Sponsored Video 01", brand: "Brand Name", caption: "Replace me.", mp4Url: "" },
  { id: "c2", title: "Sponsored Video 02", brand: "Brand Name", caption: "Replace me.", mp4Url: "" },
  { id: "c3", title: "Sponsored Video 03", brand: "Brand Name", caption: "Replace me.", mp4Url: "" },
];

// You said you’ll handwrite the LinkedIn experience into the terminal.
// Put it here and it will render in /work after authentication.
export const workTerminalSections: Array<{ heading: string; body: string[] }> = [
  {
    heading: "SUMMARY",
    body: [
      "Write a tight, high-impact summary here.",
      "Keep it sleek. Punchy. Outcome-driven.",
    ],
  },
  {
    heading: "EXPERIENCE",
    body: [
      "Role — Company — Dates",
      "• One-line impact metric",
      "• One-line responsibility / scope",
      "",
      "Role — Company — Dates",
      "• One-line impact metric",
      "• One-line responsibility / scope",
    ],
  },
  {
    heading: "SKILLS",
    body: ["UGC • Growth • Creative Strategy • Editing • Paid Social • Partnerships"],
  },
  {
    heading: "HIGHLIGHTS",
    body: ["• Notable win", "• Notable win", "• Notable win"],
  },
];

export const contactInfo = {
  title: "CONTACT",
  subtitle: "Let’s build something unreal.",
  items: [
    { label: "Email", value: "you@example.com" },
    { label: "TikTok", value: "@yourhandle" },
    { label: "Instagram", value: "@yourhandle" },
    { label: "YouTube", value: "@yourhandle" },
  ],
};
