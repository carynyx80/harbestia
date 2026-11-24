"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Coins, Banknote } from "lucide-react";
import { Card, SectionTitle, inputCls, btnPrimary, btnGhost } from "./primitives";
import { depositPayout, registerToken, errorMessage, pct, fmtUsdFull, type Offering } from "@/lib/data";

function L({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-medium text-muted">{children}</label>;
}

export default function FounderPayouts({ campaignId, campaignName, offering, only, nextPeriod = 1 }: { campaignId: string; campaignName: string; offering: Offering; only?: "equity" | "token"; nextPeriod?: number }) {
  const router = useRouter();
  const [period, setPeriod] = useState(String(nextPeriod));
  const [basisAmt, setBasisAmt] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [mint, setMint] = useState("");
  const [tokMsg, setTokMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const eq = offering.kind !== "token" && only !== "token" ? offering.equity : undefined;
  const tok = offering.kind !== "equity" && only !== "equity" ? offering.token : undefined;
  const basisN = Number(basisAmt) || 0;
  const amount = eq ? Math.round(basisN * eq.payout.shareBps) / 10000 : 0;
  const deposit = tok ? Math.round((tok.totalSupply * tok.investorAllocationBps) / 10000) : 0;

  const onPayout = async () => {
    setMsg(null);
    const periodN = Number(period);
    if (!Number.isInteger(periodN) || periodN < 1 || basisN <= 0) return setMsg({ ok: false, text: "Period number (1, 2, …) and a positive amount are required." });
    try {
      await depositPayout(campaignId, { period: periodN, basisAmountUsdc: basisN, amountUsdc: amount });
      setPeriod(String(periodN + 1));
      setMsg({ ok: true, text: `Deposited ${fmtUsdFull(amount)} for period ${periodN} to the PayoutPool.` });
      setBasisAmt("");
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    }
  };
  const onToken = async () => {
    setTokMsg(null);
    if (mint.trim().length < 32) return setTokMsg({ ok: false, text: "Enter a valid SPL mint address." });
    try {
      await registerToken(campaignId, mint.trim(), deposit);
      setTokMsg({ ok: true, text: `Mint registered; ${deposit.toLocaleString("en-US")} $${tok?.symbol} deposited to the TokenVault.` });
      router.refresh();
    } catch (e) {
      setTokMsg({ ok: false, text: errorMessage(e) });
    }
  };

  return (
    <>
      {eq && (
        <Card className="p-6">
          <SectionTitle kicker={`${campaignName} · public payout ledger`}>Report monthly payout</SectionTitle>
          <p className="mb-3 text-xs text-muted">
            Terms: {pct(eq.payout.shareBps)} of monthly {eq.payout.basis}. Due by period end + 15 days, otherwise publicly marked LATE.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <L>Period # (month since payouts began)</L>
              <input className={inputCls} inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <div>
              <L>Gross {eq.payout.basis} (USDC)</L>
              <input className={inputCls} inputMode="decimal" placeholder="0.00" value={basisAmt} onChange={(e) => setBasisAmt(e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border border-ink bg-paper-2 px-3 py-2 font-mono text-xs">
            <span className="uppercase tracking-[0.08em] text-muted">Payout to investors</span>
            <span className="font-semibold text-ink tabular">{fmtUsdFull(amount)}</span>
          </div>
          <button onClick={onPayout} className={`${btnPrimary} mt-3 w-full`}>
            <Banknote className="h-4 w-4" /> Deposit payout
          </button>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-2 px-3 py-2 text-xs ${msg.ok ? "bg-signal/15 text-signal-ink" : "bg-[#B3261E]/10 text-[#B3261E]"}`}>{msg.ok && <Check className="mr-1 inline h-3.5 w-3.5" />}{msg.text}</p>}
        </Card>
      )}
      {tok && (
        <Card className="p-6">
          <SectionTitle kicker={`${campaignName} · $${tok.symbol}`}>Register token</SectionTitle>
          <p className="mb-3 text-xs text-muted">
            Registers the mint and deposits the investor allocation ({pct(tok.investorAllocationBps)} = {deposit.toLocaleString("en-US")} {tok.symbol}) into the TokenVault. Vesting starts at launch.
          </p>
          <L>Mint address</L>
          <input className={inputCls} placeholder="SPL mint pubkey" value={mint} onChange={(e) => setMint(e.target.value)} />
          <button onClick={onToken} className={`${btnGhost} mt-3 w-full`}>
            <Coins className="h-4 w-4" /> Register mint &amp; deposit
          </button>
          {tokMsg && <p role={tokMsg.ok ? "status" : "alert"} className={`mt-2 px-3 py-2 text-xs ${tokMsg.ok ? "bg-signal/15 text-signal-ink" : "bg-[#B3261E]/10 text-[#B3261E]"}`}>{tokMsg.text}</p>}
        </Card>
      )}
    </>
  );
}
