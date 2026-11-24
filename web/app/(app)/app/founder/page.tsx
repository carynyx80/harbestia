import { Suspense } from "react";
import { connection } from "next/server";
import { getCampaigns } from "@/lib/data";
import { PageHeader } from "@/components/app/primitives";
import FounderClient from "@/components/app/FounderClient";

async function FounderContent() {
  await connection();
  const all = await getCampaigns();
  const c = all.find((x) => x.id === "freshbox") ?? all[0];
  const milestones = (c?.milestones ?? []).map((m) => ({ index: m.index, title: m.title, status: m.status }));
  return (
    <>
      <PageHeader
        title="Founder dashboard"
        subtitle="Launch a milestone-based raise, prove progress, and keep a public spending ledger. Accountability is your edge."
      />
      <FounderClient campaignId={c?.id ?? "freshbox"} campaignName={c?.name ?? "FreshBox"} milestones={milestones} />
    </>
  );
}

export default function FounderPage() {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <FounderContent />
    </Suspense>
  );
}
