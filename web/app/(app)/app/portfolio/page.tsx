import { Suspense } from "react";
import { connection } from "next/server";
import { getPortfolio, refundsClaimable, fmtUsdFull, msUntil, currentMs, offeringStamp, poolFraction, vestedFraction } from "@/lib/data";
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

  const nowMs = currentMs(); // dynamic render (after connection)
  const returns = holdings.filter((h) => byId.has(h.campaignId)).map((h) => {
    const c = byId.get(h.campaignId)!;
    const frac = poolFraction(h.amountUsdc, c.goalUsdc);
    const t = c.offering.kind !== "equity" ? c.offering.token : undefined;
    const alloc = t ? Math.floor((frac * t.totalSupply * t.investorAllocationBps) / 10000) : 0;
    const vested = t ? Math.floor(alloc * vestedFraction(t, nowMs)) : 0;
    return {
      id: c.id,
      name: c.name,
      stamp: offeringStamp(c.offering.kind),
      payout: c.offering.kind !== "token" ? { claimable: fmtUsdFull(h.claimablePayoutUsdc), has: h.claimablePayoutUsdc > 0 } : null,
      token: t
        ? {
            symbol: t.symbol,
            allocation: alloc.toLocaleString("en-US"),
            vested: vested.toLocaleString("en-US"),
            claimable: Math.max(0, vested - h.tokensClaimed).toLocaleString("en-US"),
            has: vested - h.tokensClaimed > 0,
            launched: !!t.mint,
            target: t.targetLaunchDate.slice(0, 10),
          }
        : null,
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
        title="Portfolio"
        subtitle="Your positions, payouts and votes. Private balances (Helius Privacy Rings) are in development — deposits are currently plain, publicly visible USDC transfers."
      />
      <PortfolioClient
        rows={rows}
        total={fmtUsdFull(holdings.reduce((a, h) => a + h.amountUsdc, 0))}
        votes={pendingVotes}
        returns={returns}
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
