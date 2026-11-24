"use client";

import Link from "next/link";
import { Vote, Undo2, ArrowUpRight, Fingerprint, Banknote, Coins, Compass, Info } from "lucide-react";
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

const label = "font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted";

/**
 * Honest portfolio: sample campaigns can never accept money, so a real wallet has no positions yet.
 * The sample rows below are shown only as a clearly labelled illustration of the layout.
 */
export default function PortfolioClient({
  rows,
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
  return (
    <div className="space-y-6">
      <FadeIn className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
        <Card className="p-6">
          <div className={label}>Total invested</div>
          <div className="mt-3 display text-4xl font-black tabular text-ink">$0</div>
          <p className="mt-2 text-xs text-muted">No verified deposits from your wallet yet.</p>
        </Card>
        <Card className="p-6">
          <div className={label}>Positions</div>
          <div className="mt-3 display text-4xl font-black tabular text-ink">0</div>
          <p className="mt-2 text-xs text-muted">Positions appear after a verified USDC deposit to the treasury.</p>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center ring-1 ring-ink">
              <Fingerprint className="h-6 w-6 text-muted" />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">Investor credential</div>
              <div className="text-xs text-muted">Coming soon</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Zero-knowledge KYC credentials are in development. Nothing is verified or stored today.
          </p>
        </Card>
      </FadeIn>

      <FadeIn delay={0.08}>
        <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <span className="grid h-10 w-10 shrink-0 place-items-center bg-ink text-paper">
            <Compass className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-sm font-semibold text-ink">You don&apos;t hold any positions yet</div>
            <p className="mt-1 text-xs text-muted">
              The campaigns listed today are fictional samples — investing in them is disabled. Live campaigns will show up in Explore.
            </p>
          </div>
          <Link href="/app" className={btnPrimary}>
            Explore campaigns
          </Link>
        </Card>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card className="overflow-hidden">
          <div className="p-6 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="stamp bg-signal text-ink !border-ink">Sample</span>
              <span className={label}>Illustration only — not your holdings</span>
            </div>
            <div className="mt-4">
              <SectionTitle kicker="Preview">What a position looks like</SectionTitle>
            </div>
          </div>
          <div className="divide-y divide-ink/25">
            {rows.map((r) => (
              <Link
                key={r.id}
                href={`/app/campaign/${r.id}`}
                className="group flex flex-wrap items-center gap-4 px-6 py-4 transition hover:bg-paper-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.image} alt={`${r.name} cover`} className="h-11 w-11 object-cover grayscale" />
                <div className="min-w-[140px] flex-1">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    {r.name}
                    <ArrowUpRight className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
                  </div>
                  <div className="text-xs text-muted">by {r.founder} · {r.progress}</div>
                </div>
                <div className="w-24 text-right">
                  <div className="text-[11px] text-muted">Invested</div>
                  <div className="font-mono text-sm text-ink">{r.amount}</div>
                </div>
                <div className="w-20 text-right">
                  <div className="text-[11px] text-muted">Shares</div>
                  <div className="font-mono text-sm text-ink">{r.shares}</div>
                </div>
                <span className="border border-ink/40 px-2.5 py-1 font-mono text-[11px] uppercase text-muted">{r.status}</span>
              </Link>
            ))}
          </div>
        </Card>
      </FadeIn>

      <FadeIn delay={0.12}>
        <Card className="p-6">
          <SectionTitle kicker="Investor returns · sample">Monthly payouts &amp; tokens</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {returns.map((r) => (
              <div key={r.id} className="border-2 border-ink bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="w-cond text-lg font-black uppercase text-ink">{r.name}</span>
                  <span className="stamp bg-ink text-paper !border-ink">{r.stamp}</span>
                </div>
                {r.payout && (
                  <div className="mt-3 flex items-center justify-between border-t border-dashed border-ink/30 pt-3 text-sm">
                    <span className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Banknote className="h-3.5 w-3.5" /> Claimable payouts
                    </span>
                    <span className="font-mono font-semibold text-ink">{r.payout.claimable}</span>
                  </div>
                )}
                {r.token && (
                  <div className="mt-3 border-t border-dashed border-ink/30 pt-3 text-sm">
                    <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      <Coins className="h-3.5 w-3.5" /> ${r.token.symbol} {r.token.launched ? "· launched" : `· target ${r.token.target}`}
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div><dt className="text-[10px] uppercase text-muted">Allocation</dt><dd className="font-mono text-ink">{r.token.allocation}</dd></div>
                      <div><dt className="text-[10px] uppercase text-muted">Vested</dt><dd className="font-mono text-ink">{r.token.vested}</dd></div>
                      <div><dt className="text-[10px] uppercase text-muted">Claimable</dt><dd className="font-mono text-ink">{r.token.claimable}</dd></div>
                    </dl>
                  </div>
                )}
                <button disabled className={`${btnPrimary} mt-3 w-full`}>
                  Sample — claims disabled
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Payouts are paid by the company treasury wallet after each reported period. Private claims (Helius Privacy Rings) are in development.
          </p>
        </Card>
      </FadeIn>

      <div className="grid gap-6 md:grid-cols-2">
        <FadeIn delay={0.15}>
          <Card className="h-full p-6">
            <SectionTitle kicker="Governance">Open votes</SectionTitle>
            {votes.length === 0 && <p className="text-sm text-muted">No votes are open right now.</p>}
            <div className="space-y-3">
              {votes.map((v) => (
                <div key={v.id} className="flex items-center gap-3 border border-navy bg-navy/10 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center bg-navy/10 text-navy">
                    <Vote className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{v.name} — {v.milestone} <span className="font-mono text-[10px] uppercase text-muted">(sample)</span></div>
                    <div className="text-xs text-muted">Closes in {v.closes} · only investors can vote</div>
                  </div>
                  <Link
                    href={`/app/vote/${v.id}`}
                    className="bg-navy px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-signal hover:text-ink"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        </FadeIn>
        <FadeIn delay={0.2}>
          <Card className="h-full p-6">
            <SectionTitle kicker="Refunds">Claimable refunds</SectionTitle>
            {refunds.length === 0 ? (
              <div className="flex items-start gap-3 text-sm text-muted">
                <Undo2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>No refunds due. If a raise or milestone fails, the treasury sends your pro-rata USDC back to your wallet automatically — no claim needed.</p>
              </div>
            ) : (
              refunds.map((r) => (
                <div key={r.campaign} className="flex items-center gap-3 border border-ink bg-paper p-4">
                  <Undo2 className="h-5 w-5 text-navy" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{r.campaign}</div>
                    <div className="text-xs text-muted">{r.reason}</div>
                  </div>
                  <div className="text-right font-semibold text-ink">{r.amount}</div>
                </div>
              ))
            )}
          </Card>
        </FadeIn>
      </div>
    </div>
  );
}
