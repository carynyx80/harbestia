import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/countup";

const milestones = [
  { t: "Upfront release", a: "20%", s: "done" },
  { t: "M1 · 50 cameras at paying factories", a: "30%", s: "done" },
  { t: "M2 · $40k monthly recurring revenue", a: "30%", s: "voting" },
  { t: "M3 · 3 enterprise contracts signed", a: "20%", s: "pending" },
];

export function Hero() {
  return (
    <section className="relative px-4 pt-10 pb-16 sm:pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink pb-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-semibold">§00 · Front page</span>
          <span className="text-muted">Shark Tank for every startup · Solana · Privacy layer in development</span>
        </div>
        <h1 className="mt-6 text-[11vw] font-black uppercase leading-[0.85] tracking-[-0.02em] sm:text-[96px] lg:text-[136px]">
          <span className="w-cond block">Pitch in public.</span>
          <span className="w-cond block"><span className="hl">Invest</span> invisible.</span>
        </h1>
        <div className="mt-10 grid gap-10 border-t-2 border-ink pt-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className="max-w-lg text-lg leading-relaxed">
              <span className="float-left mr-2 mt-1 font-mono text-5xl font-bold leading-[0.8]">F</span>ounders of any startup — a local business, a consumer brand, SaaS or a crypto project — pitch in public. You back them for equity with monthly revenue payouts, a token allocation, or both, with a privacy layer coming via Helius Privacy Rings. Your USDC goes to the Harvestia treasury wallet — a public address anyone can audit — and is released to founders milestone by milestone after investors vote. Miss one, and the company refunds what is left.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/app">Explore campaigns <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></Button>
              <Button href="/app/founder" variant="ghost">Raise as a founder</Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.08em]">
              <span className="flex items-center gap-2"><Lock size={14} /> Privacy layer in development</span>
              <span className="flex items-center gap-2"><ShieldCheck size={14} /> Public, auditable treasury</span>
            </div>
          </div>
          <div className="lg:col-span-6"><TermSheet /></div>
        </div>
      </div>
    </section>
  );
}

function TermSheet() {
  return (
    <article className="border-2 border-ink bg-paper">
      <header className="flex items-center justify-between border-b-2 border-ink bg-ink px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper">
        <span>Term sheet · No. 0042</span>
        <span className="flex items-center gap-2"><span className="stamp bg-signal text-ink !border-signal">Sample</span><span className="stamp border-signal text-signal">Active</span></span>
      </header>
      <div className="grid grid-cols-[120px_1fr] border-b border-ink sm:grid-cols-[160px_1fr]">
        <figure className="group relative border-r border-ink">
          <img src="/startups/ferrolab-cover.png" alt="Ferrolab cover art" className="photo h-full min-h-[120px] w-full object-cover object-left" />
        </figure>
        <div className="p-4">
          <div className="w-cond display text-3xl font-black uppercase leading-none">Ferrolab</div>
          <div className="mt-1 text-sm text-muted">AI inspection cameras for small factories</div>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Equity 12% · 7% of revenue paid monthly</div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-b border-ink">
        <div className="border-r border-ink p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Raised</div>
          <div className="display mt-1 text-3xl font-black"><CountUp to={500000} prefix="$" /></div>
        </div>
        <div className="p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Goal</div>
          <div className="display mt-1 text-3xl font-black">$500,000</div>
        </div>
      </div>
      <div className="border-b border-ink px-4 py-3">
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em]"><span>Filled</span><span className="font-semibold">100%</span></div>
        <div className="mt-2 h-3 border border-ink"><div className="h-full bg-signal" style={{ width: "100%" }} /></div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
            <th className="px-4 py-2 text-left font-medium">Milestone</th><th className="px-2 py-2 text-right font-medium">Tranche</th><th className="px-4 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {milestones.map((m) => (
            <tr key={m.t} className="border-b border-rule">
              <td className={`px-4 py-2.5 ${m.s === "pending" ? "text-muted" : ""}`}>{m.t}</td>
              <td className="px-2 py-2.5 text-right font-mono tabular">{m.a}</td>
              <td className="px-4 py-2.5 text-right">
                {m.s === "done" ? <span className="stamp">Released</span> : m.s === "voting" ? <span className="stamp bg-signal text-ink !border-ink">Voting · 4d</span> : <span className="stamp text-muted">Pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-b border-ink">
        <div className="flex items-center justify-between border-b border-rule bg-ink/[0.03] px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
          <span>Payout ledger · monthly</span><span>63 investors</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em]">Period 01 · revenue $31,400</span>
          <span className="font-mono tabular">$2,198 → investors</span>
          <span className="stamp">On time</span>
        </div>
      </div>
      <footer className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]"><Lock size={13} /> Your stake</span>
        <span className="flex items-center gap-2 font-mono text-sm"><span className="redact">$00,000</span><span className="text-[11px] uppercase tracking-[0.08em] text-muted">private soon</span></span>
      </footer>
      <p className="border-t border-ink px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">Sample campaign for demonstration — not a live raise.</p>
    </article>
  );
}
