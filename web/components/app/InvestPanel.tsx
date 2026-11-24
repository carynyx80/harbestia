"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { investPrivately, recordShieldedInvestment, errorMessage, fmtUsdFull, poolFraction, type Offering, type PayoutEntry } from "@/lib/data";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, Lock, Check, Loader2, Wallet } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Card, btnPrimary } from "./primitives";
import { useChainConfig } from "./WalletProvider";
import { shortAddress } from "@/lib/chain-config";
import type { DepositStep } from "@/lib/helius-deposit";
import TreasuryInvest from "./TreasuryInvest";

const STEPS: { key: DepositStep; label: string }[] = [
  { key: "register", label: "Registering" },
  { key: "build", label: "Building deposit" },
  { key: "sign", label: "Sign in wallet" },
  { key: "confirm", label: "Confirming" },
  { key: "record", label: "Recorded" },
];

export default function InvestPanel({
  campaignId,
  status,
  raisedUsdc,
  equityBps,
  goalUsdc,
  name,
  offering,
  payouts = [],
  sample = false,
}: {
  campaignId: string;
  status: string;
  raisedUsdc: number;
  equityBps: number;
  goalUsdc: number;
  name: string;
  offering?: Offering;
  payouts?: PayoutEntry[];
  sample?: boolean;
}) {
  const [amount, setAmount] = useState("2500");
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const n = Number(amount.replace(/[^0-9.]/g, "")) || 0;
  const frac = poolFraction(n, goalUsdc);
  const eqTerms = offering && offering.kind !== "token" ? offering.equity : undefined;
  const tokTerms = offering && offering.kind !== "equity" ? offering.token : undefined;
  const equity = frac * ((eqTerms?.equityBps ?? equityBps) / 100);
  const lastPaid = payouts[0]?.paidUsdc;
  const monthlyShare = lastPaid !== undefined ? frac * lastPaid : undefined;
  const tokenAlloc = tokTerms ? Math.floor((frac * tokTerms.totalSupply * tokTerms.investorAllocationBps) / 10000) : 0;

  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [prevTotal, setPrevTotal] = useState<number>(raisedUsdc);
  const { privacyMode, rpcUrl, cluster, mode } = useChainConfig();
  const treasury = mode === "treasury";
  const helius = privacyMode === "helius";
  const { connection } = useConnection();
  const { publicKey, signMessage, sendTransaction, connected } = useWallet();
  const [step, setStepState] = useState<DepositStep | null>(null);
  const stepRef = useRef<DepositStep | null>(null);
  const setStep = (s: DepositStep | null) => {
    stepRef.current = s;
    setStepState(s);
  };
  const [txSig, setTxSig] = useState<string | null>(null);

  const investHelius = async () => {
    if (!publicKey || !signMessage) throw new Error("Connect a wallet that supports message signing (Phantom, Solflare, Backpack).");
    const { heliusShieldDeposit, usdcToBaseUnits, DEPOSIT_MINT } = await import("@/lib/helius-deposit");
    const { txSignature } = await heliusShieldDeposit({
      wallet: {
        publicKey,
        signMessage,
        sendTransaction: (tx) => sendTransaction(tx, connection),
      },
      rpcUrl,
      mint: DEPOSIT_MINT,
      amount: usdcToBaseUnits(n),
      onStep: setStep,
    });
    setTxSig(txSignature);
    setStep("record");
    return recordShieldedInvestment(campaignId, n, txSignature);
  };

  const invest = async () => {
    if (!n || sample || status !== "Raising") return;
    setError(null);
    setTxSig(null);
    setStep(null);
    setState("pending");
    try {
      const r = helius ? await investHelius() : await investPrivately(campaignId, n);
      setPrevTotal(raisedUsdc);
      setTotal(r.amountRevealedTotal);
      setState("done");
      router.refresh();
      setTimeout(() => setState("idle"), 2500);
    } catch (e) {
      const msg = errorMessage(e);
      setError(helius ? `${STEPS.find((x) => x.key === stepRef.current)?.label ?? "Deposit"} failed: ${msg}` : msg);
      setState("idle");
    }
  };
  const needsWallet = helius && !connected;

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
        {(!offering || eqTerms) && (
          <div className="flex justify-between text-muted">
            <dt>Est. equity</dt>
            <dd className="font-medium text-ink">{equity.toFixed(3)}%</dd>
          </div>
        )}
        {eqTerms && (
          <div className="flex justify-between gap-3 text-muted">
            <dt>Your share of monthly payouts ≈</dt>
            <dd className="text-right font-medium text-ink">
              {monthlyShare !== undefined ? `${fmtUsdFull(Math.round(monthlyShare * 100) / 100)}/mo` : `${(frac * 100).toFixed(3)}% of pool`}
              <span className="block text-[10px] text-muted">{(eqTerms.payout.shareBps / 100).toFixed(1)}% of {eqTerms.payout.basis}{monthlyShare !== undefined ? ", at last month’s rate" : ""}</span>
            </dd>
          </div>
        )}
        {tokTerms && (
          <div className="flex justify-between gap-3 text-muted">
            <dt>Your token allocation ≈</dt>
            <dd className="text-right font-medium text-ink">
              {tokenAlloc.toLocaleString("en-US")} ${tokTerms.symbol}
              <span className="block text-[10px] text-muted">vests over {tokTerms.vesting.months} mo{tokTerms.vesting.cliffMonths ? `, ${tokTerms.vesting.cliffMonths}-mo cliff` : ""}</span>
            </dd>
          </div>
        )}
        <div className="flex justify-between text-muted">
          <dt>Released upfront</dt>
          <dd className="text-ink">20%</dd>
        </div>
        <div className="flex justify-between text-muted">
          <dt>Lockup</dt>
          <dd className="text-ink">12 months</dd>
        </div>
      </dl>
      {treasury ? (
        <TreasuryInvest campaignId={campaignId} amount={n} sample={sample} closed={status !== "Raising"} />
      ) : (
        <>
      {helius ? (
        <div className="mt-4 border border-ink bg-navy p-3 text-xs leading-relaxed text-paper">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em]">
            <Lock className="h-3.5 w-3.5" /> Helius Privacy Rings · {cluster}
          </div>
          <p className="mt-1.5 text-paper/80">
            Your USDC is shielded into the default ring; your private balance stays encrypted. The deposit transaction
            itself still shows your wallet address and this amount on-chain.
          </p>
          {publicKey && <p className="mt-1.5 font-mono text-[11px] text-paper/70">From {shortAddress(publicKey.toBase58())}</p>}
        </div>
      ) : (
        <div className="mt-4 flex gap-2.5 border border-ink bg-signal/15 p-3 text-xs leading-relaxed text-signal-ink">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Preview mode: amounts are not encrypted yet. Helius Privacy Rings will hide them before launch.
        </div>
      )}
      {helius && (step || txSig) && (
        <ol className="mt-3 border border-ink">
          {STEPS.map((s, i) => {
            const cur = STEPS.findIndex((x) => x.key === step);
            const done = state === "done" ? true : i < cur;
            const active = state === "pending" && i === cur;
            const failed = !!error && i === cur;
            return (
              <li
                key={s.key}
                className={`flex items-center gap-2.5 border-b border-ink/20 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] last:border-b-0 ${
                  active ? "bg-ink text-paper" : failed ? "bg-[#B3261E]/10 text-[#B3261E]" : done ? "text-ink" : "text-muted"
                }`}
              >
                <span className="grid h-4 w-4 place-items-center border border-current text-[9px]">
                  {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      <button onClick={invest} disabled={sample || status !== "Raising" || state !== "idle" || needsWallet} className={`${btnPrimary} mt-4 w-full py-3`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="inline-flex items-center gap-2"
          >
            {state === "idle" && sample && <>Sample campaign — investing disabled</>}
            {state === "idle" && !sample && needsWallet && (
              <>
                <Wallet className="h-4 w-4" /> Connect wallet to invest
              </>
            )}
            {state === "idle" && !sample && !needsWallet && (
              <>
                <ShieldCheck className="h-4 w-4" /> Invest
              </>
            )}
            {state === "pending" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {helius ? `${STEPS.find((x) => x.key === step)?.label ?? "Preparing"}…` : "Submitting…"}
              </>
            )}
            {state === "done" && (
              <>
                <Check className="h-4 w-4" /> Deposit confirmed
              </>
            )}
          </motion.span>
        </AnimatePresence>
      </button>
        </>
      )}
      {status !== "Raising" && <p className="mt-2 text-center text-[11px] text-navy">Campaign is {status} — new investments are closed.</p>}
      {error && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{error}</p>}
      {total !== null && (
        <p role="status" className="mt-2 bg-signal/15 px-3 py-2 text-xs text-signal-ink">
          Deposit recorded. Public total now {fmtUsdFull(total)} (was {fmtUsdFull(prevTotal)}).
        </p>
      )}
      {txSig && (
        <a
          href={`https://explorer.solana.com/tx/${txSig}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block font-mono text-[11px] text-ink underline decoration-signal underline-offset-2"
        >
          Deposit tx {shortAddress(txSig)} ↗
        </a>
      )}
      {!treasury && <p className="mt-3 text-center text-[11px] text-muted">Investor KYC credentials (ZK) are in development</p>}
    </Card>
  );
}
