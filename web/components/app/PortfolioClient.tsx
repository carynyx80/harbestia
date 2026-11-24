"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ShieldCheck, Vote, Undo2, ArrowUpRight, Fingerprint } from "lucide-react";
import { Card, FadeIn, SectionTitle, btnPrimary } from "./primitives";

type Row = {
  id: string;
  name: string;
  image: string;
  founder: string;
  amount: string;
  shares: string;
  equity: string;
  status: string;
  progress: string;
};

function Masked({ value, show }: { value: string; show: boolean }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={show ? "v" : "m"}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2 }}
        className="tabular-nums"
      >
        {show ? value : "██████"}
      </motion.span>
    </AnimatePresence>
  );
}

export default function PortfolioClient({
  rows,
  total,
  votes,
  refunds,
}: {
  rows: Row[];
  total: string;
  votes: { id: string; name: string; milestone: string; closes: string }[];
  refunds: { campaign: string; amount: string; reason: string }[];
}) {
  const [show, setShow] = useState(false);
  const [claimed, setClaimed] = useState(false);

  return (
    <div className="space-y-6">
      <FadeIn className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="relative overflow-hidden p-6">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Total invested</div>
            <button
              onClick={() => setShow((s) => !s)}
              className="inline-flex items-center gap-1.5 border border-ink bg-paper px-2.5 py-1.5 text-xs text-ink transition hover:text-signal-ink"
              aria-label={show ? "Hide amounts" : "Reveal amounts"}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {show ? "Hide" : "Reveal locally"}
            </button>
          </div>
          <div className="mt-3 display text-4xl font-black tabular text-ink">
            <Masked value={total} show={show} />
          </div>
          <p className="mt-2 text-xs text-muted">Decrypted in your browser only. Never sent to any server.</p>
        </Card>
        <Card className="p-6">
          <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Positions</div>
          <div className="mt-3 display text-4xl font-black tabular text-ink">{rows.length}</div>
          <p className="mt-2 text-xs text-muted">Token-2022 shares · 12-mo lockup</p>
        </Card>
        <Card className="relative overflow-hidden p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center ring-1 ring-ink">
              <Fingerprint className="h-6 w-6 text-signal-ink" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">Investor ZK badge</div>
              <div className="text-xs text-signal-ink">KYC-verified · accredited</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Proven via zero-knowledge credential. Documents sealed in TEE vault.
          </p>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card className="overflow-hidden">
          <div className="p-6 pb-2">
            <SectionTitle kicker="Holdings">Your private positions</SectionTitle>
          </div>
          <div className="divide-y divide-ink/25">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/app/campaign/${r.id}`}
                className="group flex flex-wrap items-center gap-4 px-6 py-4 transition hover:bg-paper"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt={r.name} className="h-11 w-11 object-cover grayscale" />
                <div className="min-w-[140px] flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    {r.name}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="text-xs text-muted">by {r.founder} · {r.progress}</div>
                </div>
                <div className="w-28 text-right">
                  <div className="text-[11px] text-muted">Invested</div>
                  <div className="font-medium text-ink"><Masked value={r.amount} show={show} /></div>
                </div>
                <div className="w-24 text-right">
                  <div className="text-[11px] text-muted">Shares</div>
                  <div className="font-medium text-ink"><Masked value={r.shares} show={show} /></div>
                </div>
                <div className="w-20 text-right">
                  <div className="text-[11px] text-muted">Equity</div>
                  <div className="font-medium text-signal-ink"><Masked value={r.equity} show={show} /></div>
                </div>
                <span className="bg-ink/[0.05] px-2.5 py-1 text-[11px] text-muted">{r.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      </FadeIn>

      <div className="grid gap-6 md:grid-cols-2">
        <FadeIn delay={0.15}>
          <Card className="h-full p-6">
            <SectionTitle kicker="Action needed">Pending votes</SectionTitle>
            {votes.map((v) => (
              <div key={v.id} className="flex items-center gap-3 border border-navy bg-navy/10 p-4">
                <span className="grid h-10 w-10 place-items-center bg-navy/10 text-navy">
                  <Vote className="h-5 w-5" />
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{v.name} — {v.milestone}</div>
                  <div className="text-xs text-muted">Closes in {v.closes}</div>
                </div>
                <Link
                  href={`/app/vote/${v.id}`}
                  className="bg-navy px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-signal hover:text-ink"
                >
                  Vote
                </Link>
              </div>
            ))}
          </Card>
        </FadeIn>
        <FadeIn delay={0.2}>
          <Card className="h-full p-6">
            <SectionTitle kicker="Refunds">Claimable refunds</SectionTitle>
            {refunds.map((r) => (
              <div key={r.campaign} className="border border-ink bg-paper p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center bg-navy/10 text-navy">
                    <Undo2 className="h-5 w-5" />
                  </span>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{r.campaign}</div>
                    <div className="text-xs text-muted">{r.reason}</div>
                  </div>
                  <div className="text-right font-semibold text-ink"><Masked value={r.amount} show={show} /></div>
                </div>
                <button
                  onClick={() => setClaimed(true)}
                  disabled={claimed}
                  className={`${btnPrimary} mt-4 w-full disabled:opacity-60`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {claimed ? "Refund claimed to shielded balance" : "Claim with ZK proof"}
                </button>
              </div>
            ))}
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
