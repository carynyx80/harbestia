import type { Metadata } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display: Archivo with the width axis for condensed / expanded headlines
const display = Archivo({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"] });
// Body
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });
// Numbers, labels, ledger data
const mono = IBM_Plex_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

const SITE_URL = "https://www.harvestia.xyz";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Harvestia — Pitch in public. Invest invisible.",
  description: "Shark Tank for startups: founders pitch in public, investors back them privately, and funds stay locked until milestones are hit. Built on Solana.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Harvestia",
    title: "Harvestia — Pitch in public. Invest invisible.",
    description: "Shark Tank for startups on Solana. Founders public, investors invisible, funds locked until they deliver.",
    images: [{ url: "/og.png", width: 1500, height: 600, alt: "Harvestia — Pitch in public. Invest invisible." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Harvestia — Pitch in public. Invest invisible.",
    description: "Shark Tank for startups on Solana. Founders public, investors invisible, funds locked until they deliver.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
