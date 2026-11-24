// Server component: investor terms, public payout ledger, token block. Render only after connection().
import { describeOffering, fmtUsdFull, msUntil, pct, offeringStamp, type Offering, type PayoutEntry, type CampaignFlag } from "@/lib/data";
import { Card, SectionTitle } from "./primitives";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-ink/30 py-2 text-sm">
      <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{k}</dt>
      <dd className="text-right font-medium text-ink tabular">{v}</dd>
    </div>
  );
}

export default function OfferingBlocks({ offering, payouts, flags }: { offering: Offering; payouts: PayoutEntry[]; flags: CampaignFlag[] }) {
  const eq = offering.kind !== "token" ? offering.equity : undefined;
  const tok = offering.kind !== "equity" ? offering.token : undefined;
  const launchMs = tok ? msUntil(tok.targetLaunchDate) : 0;
  const overdue = !!tok && !tok.mint && (flags.includes("TokenOverdue") || launchMs < -180 * 86400000);
  const pastTarget = !!tok && !tok.mint && launchMs < 0;
  const totalPaid = payouts.reduce((a, p) => a + p.paidUsdc, 0);

  return (
    <>
      <Card className="p-6">
        <SectionTitle kicker="Investor terms">What investors get</SectionTitle>
        <div className="mb-3 flex flex-wrap gap-2">
          <span className="stamp bg-ink text-paper !border-ink">{offeringStamp(offering.kind)}</span>
          {flags.map((f) => (
            <span key={f} className="stamp text-[#B3261E]">{f}</span>
          ))}
        </div>
        {describeOffering(offering).map((d) => (
          <p key={d} className="mb-2 text-base leading-snug text-ink">{d}</p>
        ))}
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {eq && (
            <dl>
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-signal-ink">Equity + monthly payouts</div>
              <Row k="Equity sold" v={pct(eq.equityBps)} />
              <Row k="Payout basis" v={<span className="capitalize">{eq.payout.basis}</span>} />
              <Row k="Paid to investors" v={`${pct(eq.payout.shareBps)} / month`} />
              <Row k="Grace period" v={`${eq.payout.startsAfterDays} days`} />
              <Row k="Due" v="Period end + 15 days" />
            </dl>
          )}
          {tok && (
            <dl>
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-signal-ink">Token allocation</div>
              <Row k="Symbol" v={`$${tok.symbol}`} />
              <Row k="Total supply" v={tok.totalSupply.toLocaleString("en-US")} />
              <Row k="Investor allocation" v={`${pct(tok.investorAllocationBps)} · ${Math.round((tok.totalSupply * tok.investorAllocationBps) / 10000).toLocaleString("en-US")}`} />
              <Row k="Vesting" v={`${tok.vesting.cliffMonths}-mo cliff · ${tok.vesting.months}-mo linear`} />
              <Row k="Target launch" v={tok.targetLaunchDate.slice(0, 10)} />
            </dl>
          )}
        </div>
        <p className="mt-4 text-[11px] text-muted">Milestone safe, private voting, refunds, exits and the 5% success fee apply to every offering.</p>
      </Card>

      {eq && (
        <Card className="p-6">
          <SectionTitle kicker="Public payout ledger">Monthly payouts to investors</SectionTitle>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted">No payouts yet — first payout is due {eq.payout.startsAfterDays} days after the raise closes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b-2 border-ink text-left font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    <th className="py-2 font-semibold">Period</th>
                    <th className="py-2 text-right font-semibold">{eq.payout.basis === "revenue" ? "Revenue" : "Profit"} reported</th>
                    <th className="py-2 text-right font-semibold">Paid to investors</th>
                    <th className="py-2 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((p) => (
                    <tr key={p.period} className="border-b border-ink/20">
                      <td className="py-2.5 font-mono text-ink">{p.period}</td>
                      <td className="py-2.5 text-right font-mono tabular text-ink">{fmtUsdFull(p.basisAmountUsdc)}</td>
                      <td className="py-2.5 text-right font-mono font-semibold tabular text-ink">{fmtUsdFull(p.paidUsdc)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`stamp ${p.status === "ON_TIME" ? "bg-signal text-ink !border-ink" : "text-[#B3261E]"}`}>
                          {p.status === "ON_TIME" ? "ON TIME" : "LATE"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="pt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-muted" colSpan={2}>Total paid</td>
                    <td className="pt-3 text-right font-mono font-semibold tabular text-ink">{fmtUsdFull(totalPaid)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11px] text-muted">Totals are public; each investor&apos;s share is claimed privately. 3 consecutive LATE periods flag PayoutDefault.</p>
        </Card>
      )}

      {tok && (
        <Card className="p-6">
          <SectionTitle kicker={`Token · $${tok.symbol}`}>Token allocation</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            {tok.mint ? (
              <span className="stamp bg-signal text-ink !border-ink">LAUNCHED</span>
            ) : overdue ? (
              <span className="stamp text-[#B3261E]">TOKEN OVERDUE</span>
            ) : pastTarget ? (
              <span className="stamp text-[#B3261E]">PAST TARGET</span>
            ) : (
              <span className="stamp text-navy">LAUNCH IN {Math.ceil(launchMs / 86400000)}D</span>
            )}
            <span className="font-mono text-xs text-muted">{tok.mint ? `mint ${tok.mint.slice(0, 4)}…${tok.mint.slice(-4)}` : `target ${tok.targetLaunchDate.slice(0, 10)}`}</span>
          </div>
          <p className="mt-3 text-sm text-muted">
            {pct(tok.investorAllocationBps)} of supply is reserved for investors, pro-rata to shares, vesting linearly over {tok.vesting.months} months
            {tok.vesting.cliffMonths ? ` after a ${tok.vesting.cliffMonths}-month cliff` : ""} from launch. Not launched by target + 180 days → publicly flagged TokenOverdue.
          </p>
        </Card>
      )}
    </>
  );
}
