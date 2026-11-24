import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { MapPin, BadgeCheck, ExternalLink, DoorOpen, Lock, Unlock, ArrowLeft, Vote } from "lucide-react";
import { getCampaign, fmtUsd, fmtUsdFull, shortKey, type MilestoneStatus } from "@/lib/data";
import { Card, FadeIn, SectionTitle, StatusChip, ProgressBar } from "@/components/app/primitives";
import InvestPanel from "@/components/app/InvestPanel";

export async function generateStaticParams() {
  const { getCampaigns } = await import("@/lib/mock");
  return (await getCampaigns()).map((c) => ({ id: c.id }));
}

async function CampaignPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const c = await getCampaign(id);
  if (!c) notFound();

  const upfront = (c.goalUsdc * c.upfrontBps) / 10000;
  const released = upfront + c.milestones.filter((m) => m.status === "Released").reduce((a, m) => a + m.releaseUsdc, 0);
  const funded = Math.min(c.raisedUsdc, c.goalUsdc);
  const locked = c.lockedUsdc ?? Math.max(0, funded - (c.status === "Raising" ? 0 : released));
  const pct = (c.raisedUsdc / c.goalUsdc) * 100;
  const spent = c.spending.reduce((a, s) => a + s.amountUsdc, 0);

  const timeline = [
    { label: "Upfront release", title: "Raise closed", amount: upfront, status: (c.status === "Raising" ? "Pending" : "Released") as MilestoneStatus, deadline: c.raiseDeadline, idx: "0" },
    ...c.milestones.map((m) => ({ label: `Milestone ${m.index}`, title: m.title, amount: m.releaseUsdc, status: m.status, deadline: m.deadline, idx: String(m.index) })),
  ];

  return (
    <>
      <FadeIn>
        <Link href="/app" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-signal-ink">
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
      </FadeIn>

      {/* Hero */}
      <FadeIn delay={0.05}>
        <div className="group relative overflow-hidden border-2 border-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.image} alt={c.name} className="photo h-[220px] w-full object-cover md:h-[320px]" />
          <div className="border-t-2 border-ink bg-paper p-6 md:p-10">
            <div className="flex flex-wrap gap-2">
              <span className="stamp">{c.category}</span>
              <span className="stamp bg-signal text-ink !border-ink">{c.status}</span>
              <span className="stamp text-navy">
                {c.equityBps / 100}% equity offered
              </span>
            </div>
            <h1 className="w-cond mt-4 text-5xl font-black uppercase leading-[0.9] text-ink md:text-7xl">{c.name}</h1>
            <p className="mt-3 max-w-2xl text-base text-ink md:text-lg">{c.tagline}</p>
            <div className="mt-6 grid max-w-2xl grid-cols-3 gap-6">
              <div>
                <div className="display text-2xl font-black tabular text-ink">{fmtUsd(c.raisedUsdc)}</div>
                <div className="text-xs text-muted">raised of {fmtUsd(c.goalUsdc)}</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-signal-ink">{fmtUsd(released)}</div>
                <div className="text-xs text-muted">released to founder</div>
              </div>
              <div>
                <div className="text-2xl font-semibold text-navy">{fmtUsd(locked)}</div>
                <div className="text-xs text-muted">locked in safe</div>
              </div>
            </div>
            <ProgressBar value={pct} className="mt-5 max-w-2xl" />
          </div>
        </div>
      </FadeIn>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6 min-w-0">
          {/* Founder */}
          <FadeIn delay={0.1}>
            <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.founder.avatar} alt={c.founder.name} className="h-16 w-16 object-cover grayscale ring-1 ring-ink/25" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-ink">{c.founder.name}</span>
                  <BadgeCheck className="h-4.5 w-4.5 text-signal-ink" />
                  <span className="bg-ink/[0.05] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    Public founder
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                  <span>{c.founder.role}</span>
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{c.founder.location}</span>
                  <span className="font-mono">{shortKey(c.founder.pubkey)}</span>
                </div>
                <p className="mt-2 text-sm text-muted">{c.founder.bio}</p>
              </div>
            </Card>
          </FadeIn>

          {/* Problem / Solution */}
          <FadeIn delay={0.15} className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <SectionTitle kicker="Problem">Why this matters</SectionTitle>
              <p className="text-sm leading-relaxed text-muted">{c.problem}</p>
            </Card>
            <Card className="p-6">
              <SectionTitle kicker="Solution">What {c.name} builds</SectionTitle>
              <p className="text-sm leading-relaxed text-muted">{c.solution}</p>
            </Card>
          </FadeIn>

          {/* Use of funds */}
          <FadeIn delay={0.2}>
            <Card className="p-6">
              <SectionTitle kicker="Use of funds">Where the money goes</SectionTitle>
              <div className="flex h-3 w-full overflow-hidden">
                {c.useOfFunds.map((u, i) => (
                  <div
                    key={u.label}
                    style={{ width: `${u.pct}%`, opacity: 1 - i * 0.15 }}
                    className={i % 2 === 0 ? "bg-signal" : "bg-navy"}
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {c.useOfFunds.map((u, i) => (
                  <div key={u.label} className="flex items-center justify-between bg-paper px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 text-ink">
                      <span
                        className={`h-2 w-2  ${i % 2 === 0 ? "bg-signal" : "bg-navy"}`}
                        style={{ opacity: 1 - i * 0.15 }}
                      />
                      {u.label}
                    </span>
                    <span className="text-muted">{u.pct}% · {fmtUsd((c.goalUsdc * u.pct) / 100)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </FadeIn>

          {/* Milestone timeline */}
          <FadeIn delay={0.25}>
            <Card className="p-6">
              <div className="flex items-start justify-between">
                <SectionTitle kicker="Milestone safe">Funds release only after investor vote</SectionTitle>
                <div className="hidden text-right text-xs sm:block">
                  <div className="flex items-center justify-end gap-1.5 text-signal-ink"><Unlock className="h-3 w-3" /> {fmtUsd(released)} released</div>
                  <div className="mt-1 flex items-center justify-end gap-1.5 text-navy"><Lock className="h-3 w-3" /> {fmtUsd(locked)} locked</div>
                </div>
              </div>
              <ol className="relative mt-2">
                {timeline.map((t, i) => (
                  <li key={t.idx} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < timeline.length - 1 && (
                      <span className={`absolute left-[15px] top-8 h-[calc(100%-24px)] w-px ${t.status === "Released" ? "bg-signal/15" : "bg-ink/10"}`} />
                    )}
                    <span
                      className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center  text-xs font-semibold ring-1 ${
                        t.status === "Released"
                          ? "bg-signal/15 text-signal-ink ring-ink"
                          : t.status === "Voting"
                            ? "bg-navy/10 text-navy ring-navy"
                            : "bg-paper text-muted ring-ink/25"
                      }`}
                    >
                      {t.idx === "0" ? "↑" : `M${t.idx}`}
                    </span>
                    <div className="flex flex-1 flex-col gap-2 border border-ink bg-paper p-4 sm:flex-row sm:items-center">
                      <div className="flex-1">
                        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{t.label}</div>
                        <div className="mt-0.5 font-medium text-ink">{t.title}</div>
                        <div className="mt-0.5 text-xs text-muted">
                          Deadline {new Date(t.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-semibold text-ink">{fmtUsd(t.amount)}</div>
                          <div className="flex items-center justify-end gap-1 text-[11px] text-muted">
                            {t.status === "Released" ? <><Unlock className="h-3 w-3" /> released</> : <><Lock className="h-3 w-3" /> locked</>}
                          </div>
                        </div>
                        <StatusChip status={t.status} />
                      </div>
                      {t.status === "Voting" && (
                        <Link
                          href={`/app/vote/${c.id}`}
                          className="inline-flex items-center gap-1.5 bg-navy px-3 py-1.5 text-xs font-semibold text-paper transition hover:bg-signal hover:text-ink"
                        >
                          <Vote className="h-3.5 w-3.5" /> Vote
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          </FadeIn>

          {/* Ledger */}
          <FadeIn delay={0.3}>
            <Card className="overflow-hidden">
              <div className="flex items-end justify-between p-6 pb-4">
                <SectionTitle kicker="Public spending ledger">Every dollar, on-chain</SectionTitle>
                <div className="mb-4 text-right text-xs text-muted">
                  <span className="font-semibold text-ink">{fmtUsdFull(spent)}</span> spent
                </div>
              </div>
              {c.spending.length === 0 ? (
                <div className="px-6 pb-6 text-sm text-muted">No spending logged yet — funds unlock after the raise closes.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-y border-ink/25 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                        <th className="px-6 py-3 font-medium">Date</th>
                        <th className="px-3 py-3 font-medium">Category</th>
                        <th className="px-3 py-3 font-medium">Description</th>
                        <th className="px-3 py-3 text-right font-medium">Amount</th>
                        <th className="px-6 py-3 text-right font-medium">Tx</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.spending.map((s, i) => (
                        <tr key={`${s.txSig ?? "tx"}-${i}`} className="border-b border-ink/25 transition last:border-0 hover:bg-paper">
                          <td className="px-6 py-3.5 text-muted">
                            {new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="bg-ink/[0.05] px-2 py-0.5 text-xs text-ink">{s.category}</span>
                          </td>
                          <td className="px-3 py-3.5 text-ink">{s.description}</td>
                          <td className="px-3 py-3.5 text-right font-medium tabular-nums text-ink">{fmtUsdFull(s.amountUsdc)}</td>
                          <td className="px-6 py-3.5 text-right">
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-signal-ink">
                              {s.txSig} <ExternalLink className="h-3 w-3" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </FadeIn>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <FadeIn delay={0.15}>
            <InvestPanel campaignId={c.id} status={c.status} raisedUsdc={c.raisedUsdc} equityBps={c.equityBps} goalUsdc={c.goalUsdc} name={c.name} />
          </FadeIn>
          <FadeIn delay={0.2}>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                <DoorOpen className="h-4 w-4" /> Exit window
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                For 7 days after each milestone vote, you may exit and withdraw your pro-rata share of locked funds.
                Shares are burned. Refund math runs privately in Arcium MPC.
              </p>
              <div className="mt-3 bg-paper px-3 py-2 text-xs text-muted">
                Next window opens when <span className="text-ink">M2 voting closes</span>
              </div>
            </Card>
          </FadeIn>
          <FadeIn delay={0.25}>
            <Card className="grid grid-cols-2 gap-px overflow-hidden bg-ink/[0.04] p-0">
              {[
                ["Investors", "Private"],
                ["Min investors", String(c.minInvestors)],
                ["Success fee", "5%"],
                ["Upfront", `${c.upfrontBps / 100}%`],
              ].map(([k, v]) => (
                <div key={k} className="bg-paper p-4">
                  <div className="text-[11px] text-muted">{k}</div>
                  <div className="mt-1 text-sm font-semibold text-ink">{v}</div>
                </div>
              ))}
            </Card>
          </FadeIn>
        </div>
      </div>
    </>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <CampaignPageContent params={params} />
    </Suspense>
  );
}
