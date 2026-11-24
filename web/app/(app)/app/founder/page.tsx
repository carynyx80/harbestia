import { Suspense } from "react";
import { connection } from "next/server";
import { getCampaigns, getPayouts } from "@/lib/data";
import { PageHeader } from "@/components/app/primitives";
import FounderClient from "@/components/app/FounderClient";
import FounderPayouts from "@/components/app/FounderPayouts";

async function FounderContent() {
  await connection();
  const all = await getCampaigns();
  const c = all.find((x) => x.id === "freshbox") ?? all[0];
  const tokenCampaign = all.find((x) => x.offering.kind !== "equity" && !x.offering.token?.mint);
  const ledger = c ? await getPayouts(c.id) : [];
  const nextPeriod = ledger.length + 1;
  const milestones = (c?.milestones ?? []).map((m) => ({ index: m.index, title: m.title, status: m.status }));
  return (
    <>
      <PageHeader
        title="Founder dashboard"
        subtitle="Any startup — business, brand, SaaS or crypto. Launch a milestone raise, choose what investors get, prove progress, and pay back in public."
      />
      <FounderClient campaignId={c?.id ?? "freshbox"} campaignName={c?.name ?? "FreshBox"} milestones={milestones} />
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        {c && <FounderPayouts campaignId={c.id} campaignName={c.name} offering={c.offering} only="equity" nextPeriod={nextPeriod} />}
        {tokenCampaign && (
          <FounderPayouts campaignId={tokenCampaign.id} campaignName={tokenCampaign.name} offering={tokenCampaign.offering} only="token" />
        )}
      </div>
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
