import type { ReactNode } from "react";

// Static wrapper: no blur-in. Kept for API compatibility.
export function Reveal({ children, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function Eyebrow({ children, num }: { children: ReactNode; num?: string }) {
  return (
    <span className="inline-flex items-center gap-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
      {num && <span className="bg-ink px-1.5 py-0.5 text-paper">§{num}</span>}
      {children}
    </span>
  );
}

export function SectionHead({ eyebrow, title, sub, num }: { eyebrow: string; title: ReactNode; sub?: string; num?: string }) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between border-t-2 border-ink pt-3">
        <Eyebrow num={num}>{eyebrow}</Eyebrow>
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-muted sm:block">Harvestia Ledger</span>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <h2 className="w-cond text-[40px] font-black uppercase leading-[0.9] tracking-[-0.01em] sm:text-6xl lg:col-span-8 lg:text-7xl">{title}</h2>
        {sub && <p className="max-w-md self-end border-l border-ink pl-4 text-base leading-relaxed text-muted lg:col-span-4">{sub}</p>}
      </div>
    </div>
  );
}

// Emphasis: orange highlight block (no serif italics)
export function Serif({ children }: { children: ReactNode }) {
  return <span className="hl">{children}</span>;
}
