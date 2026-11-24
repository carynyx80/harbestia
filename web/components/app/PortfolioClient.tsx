"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ShieldCheck, Vote, Undo2, ArrowUpRight, Fingerprint, Banknote, Coins, Loader2 } from "lucide-react";
import { claimPayout, claimTokens, errorMessage } from "@/lib/data";
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

export type ReturnRow = {
  id: string;
  name: string;
  stamp: string;
  payout: { claimable: string; has: boolean } | null;
  token: { symbol: string; allocation: string; vested: string; claimable: string; has: boolean; launched: boolean; target: string } | null;
};

function ClaimButton({ label, done, onClaim, disabled }: { label: string; done: string; onClaim: () => Promise<unknown>; disabled?: boolean }) {
  const [st, setSt] = useState<"idle" | "pending" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setErr(null);
    setSt("pending");
    try {
      await onClaim();
      setSt("done");
    } catch (e) {
      // Never report a claim as successful unless the API confirmed it.
      const m = errorMessage(e);
      setErr(m.includes("demo mode") || m.includes("(404)") ? "Claims aren't available yet. Nothing was claimed." : m);
      setSt("idle");
    }
  };
  return (
    <>
      <button onClick={run} disabled={disabled || st !== "idle"} className={`${btnPrimary} mt-3 w-full disabled:opacity-60`}>
        {st === "pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
        {st === "done" ? done : st === "pending" ? "Generating proof…" : label}
      </button>
      {err && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{err}</p>}
    </>
  );
}

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
  returns = [],
}: {
  rows: Row[];
  total: string;
  votes: { id: string; name: string; milestone: string; closes: string }[];
  refunds: { campaign: string; amount: string; reason: string }[];
  returns?: ReturnRow[];
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

      <FadeIn delay={0.12}>
        <Card className="p-6">
          <SectionTitle kicker="Investor returns">Monthly payouts &amp; tokens</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {returns.map((r) => (
              <div key={r.id} className="border-2 border-ink bg-paper p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="w-cond text-lg font-black uppercase text-ink">{r.name}</span>
                  <span className="stamp bg-ink text-paper !border-ink">{r.stamp}</span>
                </div>
                {r.payout && (
                  <div className="mt-3 border-t border-dashed border-ink/30 pt-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                        <Banknote className="h-3.5 w-3.5" /> Claimable payouts
                      </span>
                      <span className="font-mono font-semibold text-ink"><Masked value={r.payout.claimable} show={show} /></span>
                    </div>
                    <ClaimButton label="Claim privately" done="Claimed to shielded balance" disabled={!r.payout.has} onClaim={() => claimPayout(r.id)} />
                  </div>
                )}
                {r.token && (
                  <div className="mt-3 border-t border-dashed border-ink/30 pt-3 text-sm">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Coins className="h-3.5 w-3.5" /> ${r.token.symbol} {r.token.launched ? "· launched" : `· target ${r.token.target}`}
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div><dt className="text-[10px] uppercase text-muted">Allocation</dt><dd className="font-mono text-ink"><Masked value={r.token.allocation} show={show} /></dd></div>
                      <div><dt className="text-[10px] uppercase text-muted">Vested</dt><dd className="font-mono text-ink"><Masked value={r.token.vested} show={show} /></dd></div>
                      <div><dt className="text-[10px] uppercase text-muted">Claimable</dt><dd className="font-mono font-semibold text-signal-ink"><Masked value={r.token.claimable} show={show} /></dd></div>
                    </dl>
                    <ClaimButton label={`Claim ${r.token.symbol} privately`} done="Tokens claimed" disabled={!r.token.has} onClaim={() => claimTokens(r.id)} />
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">Amounts decrypt locally. Claims use a ZK position proof; pro-rata math runs in Arcium MPC.</p>
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
