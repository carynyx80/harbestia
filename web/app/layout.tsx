import type { Metadata } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display: Archivo with the width axis for condensed / expanded headlines
const display = Archivo({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"] });
// Body
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });
// Numbers, labels, ledger data
const mono = IBM_Plex_Mono({ variable: "--font-mono-face", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Harvestia — Pitch in public. Invest invisible.",
  description: "Shark Tank for crypto: private, milestone-based fundraising on Solana.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
