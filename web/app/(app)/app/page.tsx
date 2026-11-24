import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { EyeOff, Flag, ArrowUpRight, Clock } from "lucide-react";
import { getCampaigns, fmtUsd, daysUntil } from "@/lib/data";
import { FadeIn, PageHeader, ProgressBar } from "@/components/app/primitives";

async function ExploreContent() {
  await connection();
  const campaigns = await getCampaigns();
  const filters = ["All", "Raising", "Active", "Food & Logistics", "Climate", "Health", "AgTech", "SaaS"];

  return (
    <>
      <PageHeader
        title="Explore campaigns"
        subtitle="Public founders, accountable milestones. Your identity, amount and vote stay invisible."
        right={
          <div className="flex gap-6 text-right">
            <div>
              <div className="display text-xl font-black tabular text-ink">{fmtUsd(campaigns.reduce((a, c) => a + c.raisedUsdc, 0))}</div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Raised (public)</div>
            </div>
            <div>
              <div className="display text-xl font-black tabular text-ink">{campaigns.length}</div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Live campaigns</div>
            </div>
          </div>
        }
      />

      <FadeIn delay={0.05} className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {filters.map((f, i) => (
          <button
            key={f}
            className={`whitespace-nowrap px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
              i === 0
                ? "border border-ink bg-ink text-paper"
                : "border border-ink text-ink hover:bg-ink hover:text-paper"
            }`}
          >
            {f}
          </button>
        ))}
      </FadeIn>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((c, i) => {
          const pct = (c.raisedUsdc / c.goalUsdc) * 100;
          const daysLeft = daysUntil(c.raiseDeadline);
          return (
            <FadeIn key={c.id} delay={0.08 + i * 0.06}>
              <Link
                href={`/app/campaign/${c.id}`}
                className="group block overflow-hidden border-2 border-ink bg-paper transition-colors hover:bg-paper-2"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b-2 border-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image}
                    alt={c.name}
                    className="photo h-full w-full object-cover"
                  />
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <span className="stamp bg-paper text-ink">
                      {c.category}
                    </span>
                    <span
                      className={`stamp ${
                        c.status === "Active" ? "bg-signal text-ink !border-ink" : "bg-navy text-paper !border-navy"
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center bg-ink text-paper opacity-0 transition group-hover:opacity-100">
                    <ArrowUpRight className="h-4 w-4" />
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center gap-2.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.founder.avatar} alt={c.founder.name} className="h-7 w-7 object-cover grayscale ring-2 ring-ink/25" />
                    <div className="text-xs text-muted">
                      <span className="font-medium text-ink">{c.founder.name}</span> · {c.founder.role}
                    </div>
                  </div>
                  <h3 className="w-cond mt-3 text-3xl font-black uppercase leading-none text-ink">{c.name}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{c.tagline}</p>

                  <div className="mt-5 flex items-baseline justify-between">
                    <div>
                      <span className="font-mono text-lg font-semibold tabular text-ink">{fmtUsd(c.raisedUsdc)}</span>
                      <span className="text-sm text-muted"> / {fmtUsd(c.goalUsdc)}</span>
                    </div>
                    <span className="font-mono text-xs font-semibold tabular text-ink">{Math.round(pct)}%</span>
                  </div>
                  <ProgressBar value={pct} className="mt-2" />

                  <div className="mt-4 flex items-center justify-between border-t border-ink/25 pt-4 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Flag className="h-3.5 w-3.5" /> {c.milestones.length} milestones
                    </span>
                    <span className="flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-navy" /> Investors: private
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {c.status === "Raising" ? `${daysLeft}d` : "Funded"}
                    </span>
                  </div>
                </div>
              </Link>
            </FadeIn>
          );
        })}
      </div>
    </>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <ExploreContent />
    </Suspense>
  );
}
