"use client";

import Link from "next/link";
import { Logo, LogoMark } from "@/components/ui/logo";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import WalletButton from "./WalletButton";
import { Compass, Wallet, Vote, Rocket, ShieldCheck, Search, Bell, Lock } from "lucide-react";

const nav = [
  { href: "/app", label: "Explore", icon: Compass },
  { href: "/app/portfolio", label: "Portfolio", icon: Wallet },
  { href: "/app/vote/ferrolab", label: "Votes", icon: Vote, badge: "1" },
  { href: "/app/founder", label: "Founder", icon: Rocket },
];

export default function AppShell({ children, pill }: { children: ReactNode; pill?: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink antialiased">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r-2 border-ink bg-paper md:flex">
        <Link href="/" className="flex h-16 items-center gap-2.5 border-b-2 border-ink px-5">
          <Logo />
        </Link>
        <Suspense fallback={<nav />}>
          <SidebarNav />
        </Suspense>
        <div className="mt-auto border-t-2 border-ink">
          <div className="bg-navy p-4 text-paper">
            <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">
              <Lock className="h-3.5 w-3.5" /> Privacy layer: preview
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-paper/80">
              Mock encryption for now. Helius Rings, Arcium MPC and ZK proofs are being integrated.
            </p>
          </div>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-paper md:pl-60">
        <div className="flex h-16 items-center gap-3 px-4 md:px-8">
          <Link href="/app" className="flex items-center gap-2 md:hidden">
            <LogoMark size={26} />
          </Link>
          <div className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              placeholder="Search founders, campaigns…"
              className="w-full border border-ink bg-white py-2 pl-9 pr-3 font-mono text-sm text-ink placeholder:text-muted outline-none focus:border-signal focus:ring-2 focus:ring-signal/30"
            />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {pill}
            <span className="stamp hidden text-ink sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified · ZK
            </span>
            <button className="hidden h-9 w-9 place-items-center border-2 border-ink text-ink transition hover:bg-ink hover:text-paper sm:grid">
              <Bell className="h-4 w-4" />
            </button>
            <WalletButton />
          </div>
        </div>
        {/* mobile nav */}
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      </header>

      <main className="relative md:pl-60">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}

function useIsActive() {
  const pathname = usePathname() ?? "";
  return (href: string) =>
    href === "/app"
      ? pathname === "/app" || pathname.startsWith("/app/campaign")
      : pathname.startsWith(href.replace(/\/ferrolab$/, ""));
}

function SidebarNav() {
  const isActive = useIsActive();
  return (
    <nav className="flex flex-col">
      {nav.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`group relative flex items-center gap-3 border-b border-ink/20 px-5 py-3 font-mono text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
              active ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"
            }`}
          >
            {active && <span className="absolute inset-y-0 left-0 w-1 bg-signal" />}
            <Icon className={`h-4 w-4 ${active ? "text-signal" : ""}`} />
            {label}
            {badge && (
              <span className="ml-auto bg-signal px-1.5 py-0.5 text-[10px] font-bold text-ink">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function MobileNav() {
  const isActive = useIsActive();
  return (
    <nav className="flex overflow-x-auto border-t border-ink md:hidden">
      {nav.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap border-r border-ink/20 px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] ${isActive(href) ? "bg-ink text-paper" : "text-ink"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
