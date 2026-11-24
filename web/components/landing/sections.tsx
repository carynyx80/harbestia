"use client";
import { useState } from "react";
import { Plus, ArrowRight, ArrowUpRight } from "lucide-react";
import { SectionHead, Serif } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const ticker = [
  { n: "FRESHBOX", r: "$412,800", p: "82.6%", s: "VOTING", up: true },
  { n: "ROOTWISE", r: "$405,000", p: "54.0%", s: "RAISING", up: true },
  { n: "LOOPLINE", r: "$372,000", p: "31.0%", s: "RAISING", up: true },
  { n: "MESHGRID", r: "$1,000,000", p: "100%", s: "FUNDED", up: true },
  { n: "TIDEPOOL", r: "$88,400", p: "17.7%", s: "REFUNDED", up: false },
];

export function Marquee() {
  const row = [...ticker, ...ticker];
  const infra = ["Solana", "Helius", "Arcium", "ZK Proofs", "TEE", "Token-2022", "USDC"];
  return (
    <section aria-label="Live campaign ticker" className="border-y-2 border-ink bg-ink text-paper">
      <div className="flex">
        <div className="z-10 shrink-0 bg-signal px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">Live</div>
        <div className="relative overflow-hidden">
          <div className="animate-marquee flex w-max">
            {row.map((t, i) => (
              <span key={i} className="flex items-center gap-3 whitespace-nowrap border-r border-paper/20 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em]">
                <b className="font-semibold">{t.n}</b>
                <span className="tabular">{t.r}</span>
                <span className={`tabular ${t.up ? "text-signal" : "text-paper/70"}`}>{t.up ? "▲" : "▼"} {t.p}</span>
                <span className="border border-paper/50 px-1.5 text-[10px]">{t.s}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-paper/20 bg-paper text-ink">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 font-mono text-[11px] uppercase tracking-[0.1em]">
          <span className="text-muted">Built on battle-tested privacy infrastructure:</span>
          {infra.map((t) => <span key={t} className="font-semibold">{t}</span>)}
        </div>
      </div>
    </section>
  );
}

const steps = [
  { t: "Founder lists", d: "A public founder posts the plan, equity offered and milestones with release amounts." },
  { t: "You invest privately", d: "Deposit USDC through a shielded pool. Your amount and wallet never appear on-chain." },
  { t: "Vote on milestones", d: "Founders submit evidence. Investors vote in secret, weighted by hidden stake." },
  { t: "Release or refund", d: "Yes releases the tranche. Missed milestones return remaining funds pro-rata." },
];

export function HowItWorks() {
  return (
    <section id="how" className="px-4 py-20 sm:py-28">
      <SectionHead num="02" eyebrow="How it works" title={<>Four steps from <Serif>seed</Serif> to harvest.</>} sub="Equity crowdfunding that treats investors like adults: accountability for founders, privacy for backers." />
      <ol className="mx-auto mt-14 max-w-6xl border-t-2 border-ink">
        {steps.map((s, k) => (
          <li key={s.t} className="group grid grid-cols-[56px_1fr] items-baseline gap-4 border-b border-ink py-6 transition-colors hover:bg-paper-2 sm:grid-cols-[120px_1fr_1fr] sm:gap-8">
            <span className="display text-4xl font-black tabular sm:text-6xl">0{k + 1}</span>
            <h3 className="w-cond text-2xl font-extrabold uppercase sm:text-4xl">{s.t}</h3>
            <p className="col-span-2 max-w-md text-[15px] leading-relaxed text-muted sm:col-span-1">{s.d}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function MilestoneSafe() {
  const nodes = [
    { t: "20% upfront", d: "Released when the raise closes so work can start.", s: "Funded" },
    { t: "Milestone vote", d: "7-day private vote. 20% quorum, 10% voter cap.", s: "Voting" },
    { t: "Release", d: "Yes → tranche unlocks. Founder shares vest.", s: "Released" },
    { t: "or Refund", d: "No twice → remaining funds return to investors.", s: "Refunded" },
  ];
  return (
    <section id="protection" className="bg-navy px-4 py-20 text-paper sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between border-t-2 border-paper pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="inline-flex items-center gap-3"><span className="bg-paper px-1.5 py-0.5 text-navy">§03</span>Milestone safe</span>
          <span className="hidden text-paper/70 sm:block">Program-controlled vault</span>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <h2 className="w-cond text-[40px] font-black uppercase leading-[0.9] sm:text-6xl lg:col-span-8 lg:text-7xl">Your money moves only when <Serif>progress</Serif> does.</h2>
          <p className="max-w-md self-end border-l border-paper pl-4 leading-relaxed text-paper/80 lg:col-span-4">Funds sit in a program-controlled vault. No founder, no admin, not even us can touch them early.</p>
        </div>
        <div className="mt-14 grid border-2 border-paper lg:grid-cols-4">
          {nodes.map((n, k) => (
            <div key={n.t} className={`p-6 ${k > 0 ? "border-t border-paper/40 lg:border-l lg:border-t-0" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-paper/70">Stage 0{k + 1}</span>
                <span className={`stamp ${k === 1 ? "bg-signal text-ink !border-signal" : k === 3 ? "text-paper/80" : "text-paper"}`}>{n.s}</span>
              </div>
              <h3 className="w-cond mt-8 text-3xl font-black uppercase">{n.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-paper/80">{n.d}</p>
              <div className="mt-6 font-mono text-paper/50" aria-hidden>{k < 3 ? "———→" : "■"}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Comparison() {
  const pub = ["Name, team and pitch", "Milestones & deadlines", "Every dollar spent", "Total raised"];
  const priv = ["Your identity & wallet", "How much you invested", "How you voted", "When you exit"];
  return (
    <section className="px-4 py-20 sm:py-28">
      <SectionHead num="04" eyebrow="Radical asymmetry" title={<>Public founders. <Serif>Invisible</Serif> investors.</>} />
      <div className="mx-auto mt-14 grid max-w-6xl border-2 border-ink md:grid-cols-2">
        <div className="p-6 sm:p-8">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-3"><h3 className="w-cond text-3xl font-black uppercase">Founders show</h3><span className="stamp">Public</span></div>
          <ul>{pub.map((p) => <li key={p} className="flex items-center justify-between border-b border-rule py-3.5"><span>{p}</span><span className="font-mono text-xs uppercase tracking-[0.08em] text-muted">On record</span></li>)}</ul>
        </div>
        <div className="border-t-2 border-ink bg-ink p-6 text-paper sm:p-8 md:border-l-2 md:border-t-0">
          <div className="flex items-baseline justify-between border-b-2 border-paper pb-3"><h3 className="w-cond text-3xl font-black uppercase">Investors hide</h3><span className="stamp bg-signal text-ink !border-signal">Sealed</span></div>
          <ul>{priv.map((p) => <li key={p} className="flex items-center justify-between gap-4 border-b border-paper/20 py-3.5"><span className="text-paper/85">{p}</span><span aria-label="redacted" className="font-mono text-sm tracking-[-0.1em] text-paper">██████</span></li>)}</ul>
        </div>
      </div>
    </section>
  );
}

const stack = [
  { t: "Helius Rings", d: "Deposits, balances and refunds with amounts hidden.", tag: "Amounts" },
  { t: "Arcium MPC", d: "Weighted vote tallies and pro-rata math computed on encrypted data.", tag: "Votes" },
  { t: "ZK proofs", d: "KYC credentials, one-vote nullifiers and refund claims without revealing who.", tag: "Identity" },
  { t: "TEE vault", d: "KYC documents sealed in hardware enclaves with an audit trail for regulators.", tag: "Compliance" },
  { t: "Shielded pool", d: "Break the link between your public wallet and your position.", tag: "Unlinkability" },
];

export function PrivacyStack() {
  return (
    <section id="privacy" className="px-4 py-20 sm:py-28">
      <SectionHead num="05" eyebrow="Privacy stack" title={<>Five layers of <Serif>silence.</Serif></>} sub="Every sensitive datum has a cryptographic home. Nothing private ever touches a public ledger in the clear." />
      <div className="mx-auto mt-14 max-w-6xl overflow-x-auto border-2 border-ink">
        <table className="w-full min-w-[520px] text-left">
          <thead>
            <tr className="border-b-2 border-ink font-mono text-[11px] uppercase tracking-[0.1em]">
              <th className="w-14 px-4 py-3 font-semibold">Layer</th><th className="px-4 py-3 font-semibold">Component</th><th className="px-4 py-3 font-semibold">Protects</th><th className="px-4 py-3 font-semibold">Function</th>
            </tr>
          </thead>
          <tbody>
            {stack.map((s, k) => (
              <tr key={s.t} className="border-b border-rule align-top transition-colors hover:bg-paper-2">
                <td className="px-4 py-5 font-mono text-sm tabular">L{k + 1}</td>
                <td className="w-cond display px-4 py-5 text-2xl font-black uppercase leading-none">{s.t}</td>
                <td className="px-4 py-5"><span className="stamp">{s.tag}</span></td>
                <td className="px-4 py-5 text-[15px] leading-relaxed text-muted">{s.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const campaigns = [
  { n: "FreshBox", t: "Farm-to-door produce subscriptions", img: "1542838132-92c53300491e", r: 82, g: "$500k", e: "10%" },
  { n: "Rootwise", t: "Soil sensors for smallholder farms", img: "1500937386664-56d1dfef3854", r: 54, g: "$750k", e: "12%" },
  { n: "Loopline", t: "Last-mile cold-chain logistics", img: "1586201375761-83865001e31c", r: 31, g: "$1.2M", e: "8%" },
];

export function Campaigns() {
  return (
    <section id="founders" className="px-4 py-20 sm:py-28">
      <SectionHead num="06" eyebrow="Featured campaigns" title={<>Founders raising <Serif>right now.</Serif></>} />
      <div className="mx-auto mt-14 grid max-w-6xl border-2 border-ink md:grid-cols-3">
        {campaigns.map((c, k) => (
          <a key={c.n} href="/app" className={`group block ${k > 0 ? "border-t-2 border-ink md:border-l-2 md:border-t-0" : ""}`}>
            <figure className="border-b-2 border-ink">
              <div className="relative h-52 overflow-hidden">
                <img src={U(c.img)} alt={c.n} className="photo h-full w-full object-cover" />
                <span className="stamp absolute left-3 top-3 bg-paper text-ink">{c.e} equity</span>
              </div>
              <figcaption className="flex justify-between border-t border-ink px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted"><span>Fig. 6.{k + 1}</span><span>Photo: Unsplash</span></figcaption>
            </figure>
            <div className="p-5">
              <div className="flex items-center justify-between"><h3 className="w-cond ul-hover text-3xl font-black uppercase">{c.n}</h3><ArrowUpRight size={20} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
              <p className="mt-1 text-sm text-muted">{c.t}</p>
              <div className="mt-5 h-3 border border-ink"><div className="h-full bg-signal" style={{ width: `${c.r}%` }} /></div>
              <div className="mt-2 flex justify-between font-mono text-xs uppercase tracking-[0.06em]"><span className="font-semibold tabular">{c.r}% funded</span><span className="text-muted">Goal {c.g}</span></div>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

const faqs = [
  ["Is my investment really private?", "Yes. Amounts move through Helius privacy rings and a shielded pool; votes are tallied by Arcium MPC. Only the public total raised is visible."],
  ["What happens if a founder misses a milestone?", "Investors vote No. Founders get one 30-day resubmission. If it fails again, all remaining locked funds are refunded pro-rata."],
  ["Do I need KYC?", "Yes, once. Documents are sealed in a TEE vault and you receive a reusable ZK credential. Founders never see who you are."],
  ["Can I exit early?", "During the 7-day window after each vote you can withdraw your pro-rata share of locked funds; your shares are burned."],
  ["What does Harvestia charge?", "A 5% success fee on completed raises. Nothing for investors."],
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="px-4 py-20 sm:py-28">
      <SectionHead num="07" eyebrow="FAQ" title={<>Questions, <Serif>answered.</Serif></>} />
      <div className="mx-auto mt-14 max-w-6xl border-t-2 border-ink">
        {faqs.map(([q, a], k) => (
          <div key={q} className="border-b border-ink">
            <button aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)} className="grid w-full grid-cols-[40px_1fr_24px] items-center gap-3 py-5 text-left sm:grid-cols-[80px_1fr_24px]">
              <span className="font-mono text-xs text-muted">Q.{String(k + 1).padStart(2, "0")}</span>
              <span className="text-lg font-semibold sm:text-xl">{q}</span>
              <Plus size={20} className={`transition-transform duration-200 ${open === k ? "rotate-45" : ""}`} />
            </button>
            {open === k && <p className="pb-6 pl-[52px] pr-8 text-[15px] leading-relaxed text-muted sm:pl-[92px]">{a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CTA() {
  return (
    <section className="px-4 py-16">
      <div className="mx-auto grid max-w-6xl border-2 border-ink bg-signal lg:grid-cols-12">
        <div className="p-6 sm:p-12 lg:col-span-8">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">§08 · Closing bell</span>
          <h2 className="w-cond mt-6 text-5xl font-black uppercase leading-[0.88] sm:text-7xl">Plant capital. Harvest quietly.</h2>
          <p className="mt-6 max-w-md text-ink">Join the first private equity launchpad where accountability is public and investors stay invisible.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/app" variant="ghost" className="bg-ink !text-paper hover:!bg-paper hover:!text-ink">Launch app <ArrowRight size={15} /></Button>
            <Button href="/app/founder" variant="ghost">Start a raise</Button>
          </div>
        </div>
        <figure className="group relative min-h-[220px] border-t-2 border-ink lg:col-span-4 lg:border-l-2 lg:border-t-0">
          <img src={U("1464226184884-fa280b87c399")} alt="" className="photo absolute inset-0 h-full w-full object-cover" />
        </figure>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t-2 border-ink px-4 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3 sm:items-end">
        <div>
          <div className="w-wide display text-2xl font-black uppercase">Harvestia</div>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-muted">Pitch in public. Invest invisible.</p>
        </div>
        <div className="flex flex-wrap gap-6 font-mono text-xs uppercase tracking-[0.08em]">
          <a href="#how" className="ul-hover">How it works</a><a href="#privacy" className="ul-hover">Privacy</a><a href="/app" className="ul-hover">App</a>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted sm:text-right">© 2026 Harvestia · Built on Solana</p>
      </div>
    </footer>
  );
}
