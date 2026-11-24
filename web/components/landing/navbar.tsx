"use client";
import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const links = [["Shark Tank", "#shark-tank"], ["How it works", "#how"], ["Protection", "#protection"], ["Privacy", "#privacy"], ["For founders", "#founders"]];

export function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b-2 border-ink bg-paper">
      <div className="hidden border-b border-rule sm:block">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
          <span>Vol. 01 · Built on Solana</span>
          <span>Private equity crowdfunding · Est. 2026</span>
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" aria-label="Harvestia home"><Logo /></Link>
        <div className="hidden items-center gap-6 md:flex">
          {links.map(([l, h]) => <a key={h} href={h} className="ul-hover font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink">{l}</a>)}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app" className="border-2 border-ink bg-signal px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink transition-colors hover:bg-ink hover:text-paper">Launch app</Link>
          <button aria-label="Menu" onClick={() => setOpen(!open)} className="grid h-10 w-10 place-items-center border-2 border-ink md:hidden">{open ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </nav>
      {open && (
        <div className="flex flex-col border-t border-ink md:hidden">
          {links.map(([l, h]) => <a key={h} href={h} onClick={() => setOpen(false)} className="border-b border-rule px-4 py-3 font-mono text-xs uppercase tracking-[0.1em] hover:bg-ink hover:text-paper">{l}</a>)}
        </div>
      )}
    </header>
  );
}
