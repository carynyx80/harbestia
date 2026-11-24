import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { EyeOff, Flag, ArrowUpRight, Clock } from "lucide-react";
import { getCampaigns, fmtUsd, daysUntil, offeringStamp, type OfferingKind } from "@/lib/data";
import { FadeIn, PageHeader, ProgressBar } from "@/components/app/primitives";

const KIND_FILTERS: { key: "all" | OfferingKind; label: string }[] = [
  { key: "all", label: "All offerings" },
  { key: "equity", label: "Equity · payouts" },
  { key: "token", label: "Token" },
  { key: "both", label: "Equity + token" },
];

async function ExploreContent({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  await connection();
  const { kind: rawKind, q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim().toLowerCase();
  const kind = KIND_FILTERS.some((f) => f.key === rawKind) ? (rawKind as "all" | OfferingKind) : "all";
  const all = await getCampaigns();
  const byKind = kind === "all" ? all : all.filter((c) => c.offering.kind === kind);
  const campaigns = q
    ? byKind.filter((c) =>
        [c.name, c.tagline, c.category, c.founder.name, c.founder.role].some((f) => f?.toLowerCase().includes(q)),
      )
    : byKind;
  const allSample = campaigns.length > 0 && campaigns.every((c) => c.sample);
  const qs = (k: string) => {
    const p = new URLSearchParams();
    if (k !== "all") p.set("kind", k);
    if (q) p.set("q", rawQ!.trim());
    const str = p.toString();
    return str ? `/app?${str}` : "/app";
  };

  return (
    <>
      <PageHeader
        title="Explore campaigns"
        subtitle="Public founders, accountable milestones. Funds held in a public, auditable treasury."
        right={
          <div className="flex gap-6 text-right">
            <div>
              <div className="display text-xl font-black tabular text-ink">{fmtUsd(campaigns.reduce((a, c) => a + c.raisedUsdc, 0))}</div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{allSample ? "Raised (sample)" : "Raised (public)"}</div>
            </div>
            <div>
              <div className="display text-xl font-black tabular text-ink">{campaigns.length}</div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{allSample ? "Sample campaigns" : "Campaigns"}</div>
            </div>
          </div>
        }
      />

      <FadeIn delay={0.05} className="mb-6 flex gap-2 overflow-x-auto pb-1">
        {KIND_FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs(f.key)}
            aria-current={kind === f.key ? "page" : undefined}
            className={`whitespace-nowrap px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
              kind === f.key
                ? "border border-ink bg-ink text-paper"
                : "border border-ink text-ink hover:bg-ink hover:text-paper"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </FadeIn>

      {q && (
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {campaigns.length} result{campaigns.length === 1 ? "" : "s"} for &ldquo;{rawQ!.trim()}&rdquo; ·{" "}
          <Link href={qs(kind)} className="text-ink underline decoration-signal underline-offset-2">
            clear search
          </Link>
        </p>
      )}
      {campaigns.length === 0 && (
        <div className="border-2 border-dashed border-ink/40 p-8 text-center">
          <p className="text-sm font-semibold text-ink">No campaigns match.</p>
          <p className="mt-1 text-xs text-muted">Try another search or offering type.</p>
          <Link href="/app" className="mt-4 inline-block border border-ink px-3.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-ink hover:bg-ink hover:text-paper">
            Show all campaigns
          </Link>
        </div>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((c, i) => {
          const pct = (c.raisedUsdc / c.goalUsdc) * 100;
          const daysLeft = daysUntil(c.raiseDeadline);
          return (
            <FadeIn key={c.id} delay={0.08 + i * 0.06} className="min-w-0">
              <Link
                href={`/app/campaign/${c.id}`}
                className="group block overflow-hidden border-2 border-ink bg-paper transition-colors hover:bg-paper-2"
              >
                <div className="relative aspect-[16/10] overflow-hidden border-b-2 border-ink">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.image}
                    alt={`${c.name} cover`}
                    className="photo h-full w-full object-cover"
                  />
                  <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
                    <span className="stamp bg-paper text-ink">
                      {c.category}
                    </span>
                    <span className="stamp bg-ink text-paper !border-ink">{offeringStamp(c.offering.kind)}</span>
                    <span
                      className={`stamp ${
                        c.status === "Active" ? "bg-signal text-ink !border-ink" : "bg-navy text-paper !border-navy"
                      }`}
                    >
                      {c.status}
                    </span>
                    {c.sample && <span className="stamp bg-signal text-ink !border-ink">Sample</span>}
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

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/25 pt-4 text-[12px] text-muted">
                    <span className="flex items-center gap-1.5">
                      <Flag className="h-3.5 w-3.5" /> {c.milestones.length} milestones
                    </span>
                    <span className="flex items-center gap-1.5">
                      <EyeOff className="h-3.5 w-3.5 text-navy" /> Privacy: in development
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {c.status === "Raising" ? `${daysLeft}d` : "Funded"}
                    </span>
                  </div>
                  {c.sample && <p className="mt-3 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">Sample campaign — investing disabled.</p>}
                </div>
              </Link>
            </FadeIn>
          );
        })}
      </div>
    </>
  );
}

export default function ExplorePage({ searchParams }: { searchParams: Promise<{ kind?: string; q?: string }> }) {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <ExploreContent searchParams={searchParams} />
    </Suspense>
  );
}
