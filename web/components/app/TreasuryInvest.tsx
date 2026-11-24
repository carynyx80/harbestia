"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Check, Loader2, Wallet, Landmark, Ban } from "lucide-react";
import { API_BASE, errorMessage } from "@/lib/data";
import { shortAddress } from "@/lib/chain-config";
import {
  ATA_RENT_LAMPORTS, FEE_BUFFER_LAMPORTS, accountExists, baseToUsdc, buildTransferIxs, compileTx, randomCommitment,
  sendAndConfirm, simulateOrThrow, solscanTx, usdcToBase, walletErrorMessage, getWalletBalances,
} from "@/lib/treasury";
import { btnPrimary } from "./primitives";
import { useBalances, useChainConfig } from "./WalletProvider";

type Step = "check" | "sign" | "confirm" | "record";
const STEPS: { key: Step; label: string }[] = [
  { key: "check", label: "Checking balance" },
  { key: "sign", label: "Sign in wallet" },
  { key: "confirm", label: "Confirming on Solana" },
  { key: "record", label: "Recorded" },
];

export async function postInvestment(campaignId: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE.replace(/\/$/, "")}/campaigns/${encodeURIComponent(campaignId)}/invest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: string; raisedUsdc?: number; amountRevealedTotal?: number };
  if (!res.ok) throw new Error(j.error ?? `API error ${res.status}`);
  return j;
}

export default function TreasuryInvest({ campaignId, amount, sample, closed }: { campaignId: string; amount: number; sample: boolean; closed: boolean }) {
  const router = useRouter();
  const { connection } = useConnection();
  const { publicKey, connected, signTransaction, sendTransaction } = useWallet();
  const { treasuryWallet, usdcMint, cluster } = useChainConfig();
  const { refresh } = useBalances();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const invest = async () => {
    setError(null);
    setSig(null);
    setNote(null);
    setDone(false);
    setBusy(true);
    let cur: Step = "check";
    setStep(cur);
    try {
      if (!publicKey || !connected) throw new Error("Wallet disconnected. Reconnect and try again.");
      if (!treasuryWallet) throw new Error("Treasury wallet is not configured.");
      if (cluster !== "mainnet-beta") throw new Error(`App is configured for ${cluster}, not mainnet. Investing is disabled.`);
      const mint = new PublicKey(usdcMint);
      const treasury = new PublicKey(treasuryWallet);
      const amountBase = usdcToBase(amount);
      const [bal, treasuryAtaExists] = await Promise.all([
        getWalletBalances(connection, publicKey, mint),
        accountExists(connection, getAssociatedTokenAddressSync(mint, treasury, true)),
      ]);
      const needLamports = FEE_BUFFER_LAMPORTS + (treasuryAtaExists ? 0 : ATA_RENT_LAMPORTS);
      const missing: string[] = [];
      if (bal.usdcBase < amountBase)
        missing.push(`${(baseToUsdc(amountBase - bal.usdcBase)).toLocaleString("en-US", { maximumFractionDigits: 6 })} more USDC (you have ${baseToUsdc(bal.usdcBase).toLocaleString("en-US")})`);
      if (bal.lamports < needLamports)
        missing.push(`${((needLamports - bal.lamports) / 1e9).toFixed(4)} more SOL for network fees${treasuryAtaExists ? "" : " and the one-time treasury token account rent"} (need ~${(needLamports / 1e9).toFixed(4)} SOL)`);
      if (missing.length || !bal.usdcSource) throw new Error(`Not enough funds on Solana mainnet: ${missing.join("; ") || "no USDC token account"}.`);

      const memo = `harvestia:${campaignId}:${randomCommitment()}`;
      const base = { payer: publicKey, source: bal.usdcSource, mint, transfers: [{ to: treasury, amountBase }], memo };
      const draft = await connection.getLatestBlockhash("confirmed");
      const units = await simulateOrThrow(connection, compileTx(publicKey, draft.blockhash, buildTransferIxs(base)));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = compileTx(publicKey, blockhash, buildTransferIxs({ ...base, computeUnits: Math.ceil(units * 1.3) + 1000 }));

      cur = "sign";
      setStep(cur);
      let signature: string;
      if (signTransaction) {
        const signed = await signTransaction(tx).catch((e) => {
          throw new Error(walletErrorMessage(e));
        });
        cur = "confirm";
        setStep(cur);
        signature = await sendAndConfirm(connection, signed, lastValidBlockHeight, ({ resent }) => setNote(`Re-broadcast ${resent}×…`));
      } else {
        signature = await sendTransaction(tx, connection).catch((e) => {
          throw new Error(walletErrorMessage(e));
        });
        cur = "confirm";
        setStep(cur);
        const r = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
        if (r.value.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(r.value.err)}`);
      }
      setSig(signature);
      setNote(null);

      cur = "record";
      setStep(cur);
      try {
        await postInvestment(campaignId, { txSignature: signature });
      } catch (e) {
        throw new Error(`Your USDC transfer succeeded on-chain, but Harvestia couldn't record it yet (${errorMessage(e)}). Keep the Solscan link; support can attribute it from the memo.`);
      }
      setDone(true);
      refresh();
      router.refresh();
    } catch (e) {
      const label = STEPS.find((s) => s.key === cur)?.label ?? "Invest";
      setError(`${label}: ${e instanceof Error ? e.message : walletErrorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (sample)
    return (
      <button disabled className={`${btnPrimary} mt-4 w-full py-3`}>
        <Ban className="h-4 w-4" /> Sample campaign — investing disabled
      </button>
    );

  const cur = STEPS.findIndex((x) => x.key === step);
  return (
    <>
      {step && (
        <ol className="mt-3 border border-ink" aria-live="polite">
          {STEPS.map((s, i) => {
            const isDone = done || i < cur;
            const active = busy && i === cur;
            const failed = !!error && i === cur;
            return (
              <li
                key={s.key}
                className={`flex items-center gap-2.5 border-b border-ink/20 px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] last:border-b-0 ${
                  active ? "bg-ink text-paper" : failed ? "bg-[#B3261E]/10 text-[#B3261E]" : isDone ? "text-ink" : "text-muted"
                }`}
              >
                <span className="grid h-4 w-4 place-items-center border border-current text-[9px]">
                  {isDone ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
                </span>
                {s.label}
              </li>
            );
          })}
        </ol>
      )}
      <button onClick={invest} disabled={busy || !connected || closed || !amount} className={`${btnPrimary} mt-4 w-full py-3`}>
        {!connected ? (
          <>
            <Wallet className="h-4 w-4" /> Connect wallet to invest
          </>
        ) : busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {STEPS[cur]?.label ?? "Preparing"}…
          </>
        ) : done ? (
          <>
            <Check className="h-4 w-4" /> Investment recorded
          </>
        ) : (
          <>
            <Landmark className="h-4 w-4" /> Invest {amount ? `${amount.toLocaleString("en-US")} USDC` : ""}
          </>
        )}
      </button>
      {note && <p className="mt-2 text-center font-mono text-[11px] text-muted">{note}</p>}
      {error && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{error}</p>}
      {sig && (
        <a href={solscanTx(sig, cluster)} target="_blank" rel="noreferrer" className="mt-2 block font-mono text-[11px] text-ink underline decoration-signal underline-offset-2">
          View transfer {shortAddress(sig)} on Solscan ↗
        </a>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Sends USDC on Solana mainnet to the Harvestia treasury {treasuryWallet ? shortAddress(treasuryWallet) : ""}. Funds are custodial: held by the company
        and released after investor votes — publicly auditable on Solscan.
      </p>
    </>
  );
}
