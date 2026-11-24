import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { SharkTank } from "@/components/landing/sharktank";
import { Marquee, HowItWorks, MilestoneSafe, Comparison, PrivacyStack, Campaigns, FAQ, CTA, Footer } from "@/components/landing/sections";

export default function Home() {
  return (
    <main className="relative overflow-x-hidden">
      <Navbar />
      <Hero />
      <Marquee />
      <SharkTank />
      <HowItWorks />
      <MilestoneSafe />
      <Comparison />
      <PrivacyStack />
      <Campaigns />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
