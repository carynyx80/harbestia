"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { investPrivately, errorMessage, fmtUsdFull } from "@/lib/data";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Lock, Check, Loader2 } from "lucide-react";
import { Card, btnPrimary } from "./primitives";

export default function InvestPanel({
  campaignId,
  status,
  raisedUsdc,
  equityBps,
  goalUsdc,
  name,
}: {
  campaignId: string;
  status: string;
  raisedUsdc: number;
  equityBps: number;
  goalUsdc: number;
  name: string;
}) {
  const [amount, setAmount] = useState("2500");
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const n = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const equity = (n / goalUsdc) * (equityBps / 100);

  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [prevTotal, setPrevTotal] = useState<number>(raisedUsdc);
  const invest = async () => {
    if (!n) return;
    setError(null);
    setState("pending");
    try {
      const r = await investPrivately(campaignId, n);
      setPrevTotal(raisedUsdc);
      setTotal(r.amountRevealedTotal);
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      setError(errorMessage(e));
      setState("idle");
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h3 className="w-cond text-xl font-black uppercase text-ink">Invest in {name}</h3>
        <span className="text-[11px] text-muted">USDC</span>
      </div>
      <div className="relative mt-4">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-semibold text-muted">$</span>
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full border border-ink bg-white py-4 pl-9 pr-4 display text-2xl font-black tabular text-ink outline-none transition focus:border-ink focus:ring-2 focus:ring-signal/30"
        />
      </div>
      <div className="mt-2 flex gap-1.5">
        {[500, 1000, 2500, 10000].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(String(v))}
            className="flex-1 border border-ink bg-paper py-1.5 text-xs text-muted transition hover:text-signal-ink"
          >
            ${v >= 1000 ? `${v / 1000}k` : v}
          </button>
        ))}
      </div>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between text-muted">
          <dt>Est. equity</dt>
          <dd className="font-medium text-ink">{equity.toFixed(3)}%</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>Released upfront</dt>
          <dd className="text-ink">20%</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>Lockup</dt>
          <dd className="text-ink">12 months</dd>
        </div>
      </dl>
      <div className="mt-4 flex gap-2.5 border border-ink bg-signal/15 p-3 text-xs leading-relaxed text-signal-ink">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Your amount is shielded via Helius Privacy Ring. Only the public total updates.
      </div>
      <button onClick={invest} disabled={state !== "idle"} className={`${btnPrimary} mt-4 w-full py-3`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="inline-flex items-center gap-2"
          >
            {state === "idle" && (
              <>
                <ShieldCheck className="h-4 w-4" /> Invest privately
              </>
            )}
            {state === "pending" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating proof…
              </>
            )}
            {state === "done" && (
              <>
                <Check className="h-4 w-4" /> Shielded deposit confirmed
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </button>
      {status !== "Raising" && <p className="mt-2 text-center text-[11px] text-navy">Campaign is {status} — new investments are closed.</p>}
      {error && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{error}</p>}
      {total !== null && (
        <p role="status" className="mt-2 bg-signal/15 px-3 py-2 text-xs text-signal-ink">
          Deposit sealed. Public total now {fmtUsdFull(total)} (was {fmtUsdFull(prevTotal)}).
        </p>
      )}
      <p className="mt-3 text-center text-[11px] text-muted">Requires KYC credential · ZK proof, no documents shared</p>
    </Card>
  );
}
