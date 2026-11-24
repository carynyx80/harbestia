import { Suspense } from "react";
import { connection } from "next/server";
import { getPortfolio, refundsClaimable, fmtUsdFull, msUntil } from "@/lib/data";
import { PageHeader } from "@/components/app/primitives";
import PortfolioClient from "@/components/app/PortfolioClient";

async function PortfolioContent() {
  await connection();
  const { holdings, campaigns, votes } = await getPortfolio();
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  const rows = holdings.filter((h) => byId.has(h.campaignId)).map((h) => {
    const c = byId.get(h.campaignId)!;
    const released = c.milestones.filter((m) => m.status === "Released").length;
    return {
      id: c.id,
      name: c.name,
      image: c.image,
      founder: c.founder.name,
      amount: fmtUsdFull(h.amountUsdc),
      shares: h.shares.toLocaleString("en-US"),
      equity: `${h.equityPct.toFixed(3)}%`,
      status: c.status,
      progress: `${released}/${c.milestones.length} milestones`,
    };
  });

  const pendingVotes = votes.filter((v) => byId.has(v.campaignId)).map((v) => {
    const c = byId.get(v.campaignId)!;
    const ms = msUntil(v.closesAt);
    return {
      id: c.id,
      name: c.name,
      milestone: `M${v.milestoneIndex}`,
      closes: `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h`,
    };
  });

  return (
    <>
      <PageHeader
        title="Private portfolio"
        subtitle="Only you can see this. Balances live in Helius Privacy Rings and are decrypted locally with your viewing key."
      />
      <PortfolioClient
        rows={rows}
        total={fmtUsdFull(holdings.reduce((a, h) => a + h.amountUsdc, 0))}
        votes={pendingVotes}
        refunds={refundsClaimable.map((r) => ({ campaign: r.campaign, reason: r.reason, amount: fmtUsdFull(r.amountUsdc) }))}
      />
    </>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={<div className="h-[60vh] animate-pulse bg-paper" />}>
      <PortfolioContent />
    </Suspense>
  );
}
