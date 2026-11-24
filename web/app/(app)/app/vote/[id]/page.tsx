import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { getCampaign, getVote, fmtUsd } from "@/lib/data";
import { FadeIn, PageHeader } from "@/components/app/primitives";
import VoteClient from "@/components/app/VoteClient";

export async function generateStaticParams() {
  const { getPendingVotes } = await import("@/lib/mock");
  return (await getPendingVotes()).map((v) => ({ id: v.campaignId }));
}

async function VotePageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const [c, v] = await Promise.all([getCampaign(id), getVote(id)]);
  if (!c || !v) notFound();
  const m = c.milestones.find((x) => x.index === v.milestoneIndex)!;

  return (
    <>
      <FadeIn>
        <Link href={`/app/campaign/${c.id}`} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-signal-ink">
          <ArrowLeft className="h-4 w-4" /> {c.name}
        </Link>
      </FadeIn>
      <PageHeader
        title={`Vote: ${c.name} — Milestone ${m.index}`}
        subtitle="Review the evidence and cast a private, stake-weighted vote. Missed milestones refund remaining funds to investors."
      />
      <FadeIn delay={0.1}>
        <VoteClient
          campaignId={c.id}
          campaignName={c.name}
          milestoneTitle={m.title}
          milestoneIndex={m.index}
          description={m.description}
          releaseLabel={fmtUsd(m.releaseUsdc)}
          closesAt={v.closesAt}
          opensAt={v.opensAt}
          quorumPct={v.quorumPct}
          quorumRequiredPct={v.quorumRequiredPct}
          evidence={v.evidence}
        />
      </FadeIn>
    </>
  );
}

export default function VotePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <VotePageContent params={params} />
    </Suspense>
  );
}
