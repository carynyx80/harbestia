"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus, ArrowRight, ArrowUpRight } from "lucide-react";
import { SectionHead, Serif } from "@/components/ui/reveal";
import { Button } from "@/components/ui/button";

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1200&q=80`;

const ticker = [
  { n: "ZENTROVE · ZTRV", r: "$286,000", p: "38.1%", s: "RAISING", up: true },
  { n: "FERROLAB", r: "$500,000", p: "100%", s: "M2 VOTING", up: true },
];

export function Marquee() {
  const row = [...ticker, ...ticker, ...ticker, ...ticker, ...ticker, ...ticker];
  const infra = ["Solana", "USDC", "Solscan-auditable treasury", "Helius Privacy Rings (in development)", "Arcium (planned)", "ZK proofs (planned)"];
  return (
    <section aria-label="Sample campaign ticker" className="border-y-2 border-ink bg-ink text-paper">
      <div className="flex">
        <div className="z-10 shrink-0 bg-signal px-3 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink">Sample</div>
        <div className="relative overflow-hidden">
          <div className="animate-marquee flex w-max">
            {row.map((t, i) => (
              <span key={i} className="flex items-center gap-3 whitespace-nowrap border-r border-paper/20 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.06em]">
                <b className="font-semibold">{t.n}</b>
                <span className="border border-paper/50 px-1 text-[9px] text-paper/70">SAMPLE</span>
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
          <span className="text-muted">Built on Solana, privacy layer in development:</span>
          {infra.map((t) => <span key={t} className="font-semibold">{t}</span>)}
        </div>
      </div>
    </section>
  );
}

const steps = [
  { t: "Founder lists", d: "A public founder (any startup: business, brand, SaaS or crypto) posts the plan, what investors get and milestones with release amounts." },
  { t: "You invest in USDC", d: "Your USDC goes to the Harvestia treasury wallet — a public address anyone can audit. Transfers are visible on-chain today; private deposits are coming with Helius Privacy Rings." },
  { t: "Vote on milestones", d: "Founders submit evidence. Investors vote, weighted by stake. Private ballots are coming with the privacy layer." },
  { t: "Release or refund", d: "On a Yes, the company releases the tranche from the treasury. Missed milestones: the company refunds remaining funds pro-rata." },
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

const TREASURY = "DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx";

export function MilestoneSafe() {
  const nodes = [
    { t: "20% upfront", d: "Sent by the company from the treasury when the raise closes.", s: "Funded" },
    { t: "Milestone vote", d: "7-day investor vote. 20% quorum, 10% voter cap.", s: "Voting" },
    { t: "Release", d: "Yes → the company pays the tranche to the founder.", s: "Released" },
    { t: "or Refund", d: "No twice → the company refunds remaining funds to investors.", s: "Refunded" },
  ];
  return (
    <section id="protection" className="bg-navy px-4 py-20 text-paper sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between border-t-2 border-paper pt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="inline-flex items-center gap-3"><span className="bg-paper px-1.5 py-0.5 text-navy">§03</span>Milestone treasury</span>
          <span className="hidden text-paper/70 sm:block">Company treasury · publicly auditable</span>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <h2 className="w-cond text-[40px] font-black uppercase leading-[0.9] sm:text-6xl lg:col-span-8 lg:text-7xl">Your money moves only when <Serif>progress</Serif> does.</h2>
          <p className="max-w-md self-end border-l border-paper pl-4 leading-relaxed text-paper/80 lg:col-span-4">Your USDC goes to the Harvestia treasury wallet — a public address anyone can audit. Funds are released to founders milestone by milestone after investors vote, and refunded if milestones are missed. The company executes every release and refund; it is not enforced by code.</p>
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
        <div id="treasury" className="mt-14 grid gap-6 border-2 border-paper p-6 sm:p-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em]"><span className="bg-paper px-1.5 py-0.5 text-navy">§03B</span> Where your money sits</span>
            <h3 className="w-cond mt-5 text-3xl font-black uppercase leading-none sm:text-4xl">One public wallet. <Serif>Audit it yourself.</Serif></h3>
          </div>
          <div className="space-y-4 text-sm leading-relaxed text-paper/80 lg:col-span-7">
            <p>Every investment goes to the Harvestia treasury wallet. Balances and every USDC transfer in and out are public on Solscan.</p>
            <a href={`https://solscan.io/account/${TREASURY}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-paper px-3 py-2 font-mono text-xs uppercase tracking-[0.08em] text-paper hover:bg-paper hover:text-navy" title={TREASURY}>
              Treasury {TREASURY.slice(0, 4)}…{TREASURY.slice(-4)} · View on Solscan <ArrowUpRight size={14} />
            </a>
            <p className="text-paper/70">Custodial today: the company holds the key and executes releases and refunds after investor votes. We plan to move the treasury to a multisig.</p>
          </div>
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
      <SectionHead num="04" eyebrow="Radical asymmetry" title={<>Public founders. <Serif>Invisible</Serif> investors.</>} sub="Where we're headed. Investor privacy is in development with Helius Privacy Rings; until it ships, USDC transfers to the treasury are visible on-chain." />
      <div className="mx-auto mt-14 grid max-w-6xl border-2 border-ink md:grid-cols-2">
        <div className="p-6 sm:p-8">
          <div className="flex items-baseline justify-between border-b-2 border-ink pb-3"><h3 className="w-cond text-3xl font-black uppercase">Founders show</h3><span className="stamp">Public</span></div>
          <ul>{pub.map((p) => <li key={p} className="flex items-center justify-between border-b border-rule py-3.5"><span>{p}</span><span className="font-mono text-xs uppercase tracking-[0.08em] text-muted">On record</span></li>)}</ul>
        </div>
        <div className="border-t-2 border-ink bg-ink p-6 text-paper sm:p-8 md:border-l-2 md:border-t-0">
          <div className="flex items-baseline justify-between border-b-2 border-paper pb-3"><h3 className="w-cond text-3xl font-black uppercase">Investors hide</h3><span className="stamp bg-signal text-ink !border-signal">Coming soon</span></div>
          <ul>{priv.map((p) => <li key={p} className="flex items-center justify-between gap-4 border-b border-paper/20 py-3.5"><span className="text-paper/85">{p}</span><span aria-label="redacted" className="font-mono text-sm tracking-[-0.1em] text-paper">██████</span></li>)}</ul>
        </div>
      </div>
    </section>
  );
}

const stack = [
  { t: "Helius Rings", d: "Being integrated: deposits, balances and refunds with amounts hidden.", tag: "Amounts" },
  { t: "Arcium MPC", d: "Planned: weighted vote tallies and pro-rata math computed on encrypted data.", tag: "Votes" },
  { t: "ZK proofs", d: "Planned: KYC credentials, one-vote nullifiers and refund claims without revealing who.", tag: "Identity" },
  { t: "TEE vault", d: "Planned: KYC documents sealed in hardware enclaves with an audit trail for regulators.", tag: "Compliance" },
  { t: "Shielded pool", d: "Planned: break the link between your public wallet and your position.", tag: "Unlinkability" },
];

export function PrivacyStack() {
  return (
    <section id="privacy" className="px-4 py-20 sm:py-28">
      <SectionHead num="05" eyebrow="Privacy stack · in development" title={<>Five layers of <Serif>silence.</Serif></>} sub="The privacy layer we are building. None of these layers is live yet: today, USDC transfers to the treasury are visible on-chain. Helius Privacy Rings is being integrated first." />
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
  { id: "zentrove", n: "Zentrove", t: "Private stablecoin payroll for remote teams.", img: "/startups/zentrove-cover.png", r: 38, g: "$750k", e: "15% of ZTRV", s: "Raising" },
  { id: "ferrolab", n: "Ferrolab", t: "AI inspection cameras for small factories.", img: "/startups/ferrolab-cover.png", r: 100, g: "$500k", e: "12% equity + 7% rev.", s: "Active · M2 vote" },
];

export function Campaigns() {
  return (
    <section id="campaigns" className="px-4 py-20 sm:py-28">
      <SectionHead num="06" eyebrow="Sample campaigns" title={<>Two campaigns, <Serif>end to end.</Serif></>} sub="Fictional samples that show every stage: Zentrove is still raising, Ferrolab is funded and voting on its second milestone. Investing is disabled on both." />
      <div className="mx-auto mt-14 grid max-w-6xl border-2 border-ink md:grid-cols-2">
        {campaigns.map((c, k) => (
          <Link key={c.id} href={`/app/campaign/${c.id}`} className={`group block ${k > 0 ? "border-t-2 border-ink md:border-l-2 md:border-t-0" : ""}`}>
            <figure className="border-b-2 border-ink">
              <div className="relative aspect-[16/9] overflow-hidden">
                <img src={c.img} alt={`${c.n} cover art`} className="photo h-full w-full object-cover" />
                <span className="stamp absolute left-3 top-3 bg-paper text-ink">{c.e}</span>
                <span className="stamp absolute right-3 top-3 bg-signal text-ink !border-ink">Sample</span>
              </div>
              <figcaption className="flex justify-between border-t border-ink px-4 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted"><span>Fig. 6.{k + 1}</span><span>{c.s}</span></figcaption>
            </figure>
            <div className="p-5">
              <div className="flex items-center justify-between"><h3 className="w-cond ul-hover text-3xl font-black uppercase">{c.n}</h3><ArrowUpRight size={20} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></div>
              <p className="mt-1 text-sm text-muted">{c.t}</p>
              <div className="mt-5 h-3 border border-ink"><div className="h-full bg-signal" style={{ width: `${c.r}%` }} /></div>
              <div className="mt-2 flex justify-between font-mono text-xs uppercase tracking-[0.06em]"><span className="font-semibold tabular">{c.r}% funded</span><span className="text-muted">Goal {c.g}</span></div>
              <p className="mt-4 border-t border-rule pt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">Sample campaign for demonstration — not a live raise.</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

const payback = [
  {
    k: "A",
    t: "Equity + monthly payouts",
    stamp: "EQUITY · PAYOUTS",
    d: "You own a slice of the company. Every month the founder pays a fixed share of revenue or profit to investors from the treasury, with a public report. Late months get a public LATE stamp.",
    ex: "e.g. Ferrolab: 12% equity, 7% of monthly revenue paid out",
  },
  {
    k: "B",
    t: "Token",
    stamp: "TOKEN",
    d: "For crypto projects. A fixed share of the token supply is reserved for investors and vests month by month after launch. Miss the target launch date by six months and the campaign is flagged overdue.",
    ex: "e.g. Zentrove: 15% of 1B ZTRV, 3-month cliff, 12-month vesting",
  },
  {
    k: "C",
    t: "Both",
    stamp: "EQUITY + TOKEN",
    d: "Equity with monthly payouts and a token allocation, both split by your share. Suits a business that also launches a token.",
    ex: "e.g. 12% equity + 5% of revenue + 15% of tokens",
  },
];

export function PayBack() {
  return (
    <section id="payback" className="px-4 py-20 sm:py-28">
      <SectionHead num="02B" eyebrow="Choose how you pay back" title={<>Equity, tokens, <Serif>or both.</Serif></>} sub="Founders pick what investors get. Treasury custody, milestone votes, refunds and exits work the same for all three." />
      <div className="mx-auto mt-14 grid max-w-6xl border-2 border-ink md:grid-cols-3">
        {payback.map((p, i) => (
          <article key={p.k} className={`flex flex-col p-6 ${i > 0 ? "border-t-2 border-ink md:border-l-2 md:border-t-0" : ""}`}>
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
              <span className="font-semibold">Option {p.k}</span>
              <span className="stamp bg-ink text-paper !border-ink">{p.stamp}</span>
            </div>
            <h3 className="w-cond mt-5 text-3xl font-black uppercase leading-none">{p.t}</h3>
            <p className="mt-4 flex-1 text-[15px] leading-relaxed text-muted">{p.d}</p>
            <p className="mt-5 border-t border-ink pt-3 font-mono text-xs uppercase tracking-[0.06em]">{p.ex}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

const faqs = [
  ["Who can raise on Harvestia?", "Any startup: a local business, a consumer brand, a SaaS company, hardware, creators, or a crypto project. Founders are public and accountable; investor privacy is in development."],
  ["What do investors actually get?", "The founder chooses: equity with monthly payouts (a set share of revenue or profit, paid every month), a token allocation that vests after launch, or both. The terms are shown on every campaign page."],
  ["How do monthly payouts work?", "Each month the founder deposits the payout in USDC with a public report, and the company distributes your pro-rata share from the treasury. A missed month is marked LATE; three in a row flags the campaign and opens an extra exit vote."],
  ["Is my investment private?", "Not yet. Today your USDC transfer to the treasury wallet is a normal mainnet transfer, visible on-chain. We are integrating Helius Privacy Rings, with Arcium and ZK proofs to follow; none of these are live yet. \"Invest invisible\" is where we are headed, not where we are today."],
  ["Who holds my money?", "Harvestia does. Your USDC goes to the Harvestia treasury wallet (DtvU…3Scx), a public address anyone can audit on Solscan. There is no custom on-chain program: the company releases funds to founders after investor votes and sends refunds when milestones are missed. This is custodial."],
  ["What happens if Harvestia disappears?", "Honest answer: funds in the treasury are controlled by the company's key, so you depend on the company to release or refund them. Every balance and transfer is public on Solscan, so the funds can always be checked, but code does not force a refund. We plan to move the treasury to a multisig with independent signers to reduce this risk."],
  ["What happens if a founder misses a milestone?", "Investors vote No. Founders get one 30-day resubmission. If it fails again, the company refunds all remaining funds from the treasury pro-rata."],
  ["Do I need KYC?", "Today you invest by connecting a Solana wallet and signing a USDC transfer. A one-time KYC check with a TEE-sealed document vault and a reusable ZK credential is planned but not live yet; when it ships, founders will not see who you are."],
  ["Can I exit early?", "During the 7-day window after each vote you can request your pro-rata share of unreleased funds; the company refunds it from the treasury and your shares are burned."],
  ["What does Harvestia charge?", "A 5% success fee on completed raises. Nothing for investors."],
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="px-4 py-20 sm:py-28">
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
          <p className="mt-6 max-w-md text-ink">Join the launchpad where accountability is public, the treasury is auditable, and investor privacy is on the way.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/app" variant="ghost" className="!bg-ink !text-paper hover:!bg-paper hover:!text-ink">Launch app <ArrowRight size={15} /></Button>
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
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3 lg:items-end">
        <div>
          <div className="w-wide display text-2xl font-black uppercase">Harvestia</div>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.08em] text-muted">Pitch in public. Invest invisible.</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-xs uppercase tracking-[0.08em]">
          <a href="#how" className="ul-hover">How it works</a><a href="#treasury" className="ul-hover">Treasury</a><a href="#privacy" className="ul-hover">Privacy</a><a href="#campaigns" className="ul-hover">Campaigns</a><a href="#faq" className="ul-hover">FAQ</a><Link href="/app" className="ul-hover">Launch app</Link><Link href="/app/founder" className="ul-hover">Start a raise</Link>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted lg:text-right">© 2026 Harvestia · Built on Solana</p>
      </div>
    </footer>
  );
}
