import { ArrowRight, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CountUp } from "@/components/ui/countup";

const milestones = [
  { t: "Upfront release", a: "20%", s: "done" },
  { t: "MVP + 500 boxes shipped", a: "25%", s: "done" },
  { t: "Cold-chain partner signed", a: "25%", s: "voting" },
  { t: "3 cities live", a: "30%", s: "pending" },
];

export function Hero() {
  return (
    <section className="relative px-4 pt-10 pb-16 sm:pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink pb-3 font-mono text-[11px] uppercase tracking-[0.12em]">
          <span className="font-semibold">§00 · Front page</span>
          <span className="text-muted">Shark Tank for crypto · Private · Solana</span>
        </div>
        <h1 className="mt-6 text-[11vw] font-black uppercase leading-[0.85] tracking-[-0.02em] sm:text-[96px] lg:text-[136px]">
          <span className="w-cond block">Pitch in public.</span>
          <span className="w-cond block"><span className="hl">Invest</span> invisible.</span>
        </h1>
        <div className="mt-10 grid gap-10 border-t-2 border-ink pt-8 lg:grid-cols-12">
          <div className="lg:col-span-6">
            <p className="max-w-lg text-lg leading-relaxed">
              <span className="float-left mr-2 mt-1 font-mono text-5xl font-bold leading-[0.8]">F</span>ounders pitch any crypto product in public. You back them for real equity while your identity, amount and vote stay encrypted. Your money sits in a code-controlled safe and is only released when founders hit milestones you vote on. Miss one? You get refunded.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/app">Explore campaigns <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" /></Button>
              <Button href="#founders" variant="ghost">Raise as a founder</Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs uppercase tracking-[0.08em]">
              <span className="flex items-center gap-2"><Lock size={14} /> Stake encrypted</span>
              <span className="flex items-center gap-2"><ShieldCheck size={14} /> Milestone-locked</span>
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
        <span className="stamp border-signal text-signal">Active</span>
      </header>
      <div className="grid grid-cols-[120px_1fr] border-b border-ink sm:grid-cols-[160px_1fr]">
        <figure className="group relative border-r border-ink">
          <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80" alt="Fresh produce" className="photo h-full min-h-[120px] w-full object-cover" />
        </figure>
        <div className="p-4">
          <div className="w-cond display text-3xl font-black uppercase leading-none">FreshBox</div>
          <div className="mt-1 text-sm text-muted">Farm-to-door produce boxes</div>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">Ticker FRBX · Equity 10%</div>
        </div>
      </div>
      <div className="grid grid-cols-2 border-b border-ink">
        <div className="border-r border-ink p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Raised</div>
          <div className="display mt-1 text-3xl font-black"><CountUp to={412800} prefix="$" /></div>
        </div>
        <div className="p-4">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">Goal</div>
          <div className="display mt-1 text-3xl font-black">$500,000</div>
        </div>
      </div>
      <div className="border-b border-ink px-4 py-3">
        <div className="flex justify-between font-mono text-[11px] uppercase tracking-[0.08em]"><span>Filled</span><span className="font-semibold">82.6%</span></div>
        <div className="mt-2 h-3 border border-ink"><div className="h-full bg-signal" style={{ width: "82.6%" }} /></div>
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
                {m.s === "done" ? <span className="stamp">Funded</span> : m.s === "voting" ? <span className="stamp bg-signal text-ink !border-ink">Voting · 4d</span> : <span className="stamp text-muted">Pending</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer className="flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.1em]"><Lock size={13} /> Your stake</span>
        <span className="flex items-center gap-2 font-mono text-sm"><span className="redact">$00,000</span><span className="text-[11px] uppercase tracking-[0.08em] text-muted">private</span></span>
      </footer>
    </article>
  );
}
