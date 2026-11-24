"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Check, Loader2, Lock, RefreshCw, Send, ExternalLink } from "lucide-react";
import { API_BASE } from "@/lib/data";
import { shortAddress } from "@/lib/chain-config";
import {
  baseToUsdc, buildTransferIxs, compileTx, getWalletBalances, sendAndConfirm, simulateOrThrow, solscanAccount, solscanTx,
  usdcToBase, walletErrorMessage, FEE_BUFFER_LAMPORTS, ATA_RENT_LAMPORTS,
} from "@/lib/treasury";
import { Card, btnPrimary } from "./primitives";
import TreasuryCard from "./TreasuryCard";
import { useBalances, useChainConfig, useIsTreasury } from "./WalletProvider";

interface AdminTransfer {
  to: string;
  amountUsdc: number;
  /** Exact amount in base units (6 decimals) from the API; the API verifies this exact value. */
  amountMicro?: string;
}
interface AdminAction {
  id: string;
  kind: string;
  campaignId?: string;
  description: string;
  transfers: AdminTransfer[];
  status?: string;
}

const BASE = API_BASE.replace(/\/$/, "");
/** Max transfers per tx (each = ATA-idempotent + transferChecked) to stay under the 1232-byte limit. */
const PER_TX = 4;

function normalize(raw: unknown): AdminAction[] {
  const list = Array.isArray(raw) ? raw : ((raw as { actions?: unknown[] })?.actions ?? []);
  return list.map((a, i) => {
    const r = a as Record<string, unknown>;
    const rawTransfers = Array.isArray(r.transfers) ? (r.transfers as Record<string, unknown>[]) : [r];
    const transfers = rawTransfers
      .map((t) => ({
        to: String(t.to ?? t.recipient ?? t.address ?? t.payoutAddress ?? ""),
        amountUsdc: Number(t.amountUsdc ?? t.amount ?? 0),
        amountMicro: t.amountMicro != null ? String(t.amountMicro) : undefined,
      }))
      .filter((t) => t.to && t.amountUsdc > 0);
    return {
      id: String(r.actionId ?? r.id ?? i),
      kind: String(r.kind ?? r.type ?? "action"),
      campaignId: r.campaignId ? String(r.campaignId) : undefined,
      description: String(r.description ?? r.label ?? r.reason ?? ""),
      transfers,
      status: r.status ? String(r.status) : undefined,
    };
  });
}

function ActionRow({ action, onSettled }: { action: AdminAction; onSettled: () => void }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { usdcMint, cluster } = useChainConfig();
  const { refresh } = useBalances();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sigs, setSigs] = useState<string[]>([]);
  const total = action.transfers.reduce((s, t) => s + t.amountUsdc, 0);
  const settled = action.status === "settled" || action.status === "done";

  const run = async () => {
    setError(null);
    setSigs([]);
    try {
      if (!publicKey || !signTransaction) throw new Error("Connect the treasury wallet (it must support transaction signing).");
      if (!action.transfers.length) throw new Error("This action has no transfers to send.");
      setBusy("Checking balance");
      const mint = new PublicKey(usdcMint);
      const transfers = action.transfers.map((t) => ({
        to: new PublicKey(t.to),
        amountBase: t.amountMicro ? BigInt(t.amountMicro) : usdcToBase(t.amountUsdc),
      }));
      const need = transfers.reduce((s, t) => s + t.amountBase, BigInt(0));
      const bal = await getWalletBalances(connection, publicKey, mint);
      if (!bal.usdcSource || bal.usdcBase < need)
        throw new Error(`Treasury has ${baseToUsdc(bal.usdcBase).toLocaleString("en-US")} USDC; this action needs ${baseToUsdc(need).toLocaleString("en-US")}.`);
      const needLamports = FEE_BUFFER_LAMPORTS * Math.ceil(transfers.length / PER_TX) + ATA_RENT_LAMPORTS * transfers.length;
      if (bal.lamports < needLamports) throw new Error(`Treasury needs up to ${(needLamports / 1e9).toFixed(4)} SOL for fees + recipient token accounts.`);

      const out: string[] = [];
      for (let i = 0; i < transfers.length; i += PER_TX) {
        const part = transfers.slice(i, i + PER_TX);
        const label = transfers.length > PER_TX ? ` (${i / PER_TX + 1}/${Math.ceil(transfers.length / PER_TX)})` : "";
        const base = { payer: publicKey, source: bal.usdcSource, mint, transfers: part, memo: `harvestia:settle:${action.id}` };
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        const units = await simulateOrThrow(connection, compileTx(publicKey, blockhash, buildTransferIxs(base)));
        const tx = compileTx(publicKey, blockhash, buildTransferIxs({ ...base, computeUnits: Math.ceil(units * 1.3) + 1000 }));
        setBusy(`Sign in wallet${label}`);
        const signed = await signTransaction(tx).catch((e) => {
          throw new Error(walletErrorMessage(e));
        });
        setBusy(`Confirming on Solana${label}`);
        const sig = await sendAndConfirm(connection, signed, lastValidBlockHeight);
        out.push(sig);
        setSigs([...out]);
        setBusy(`Recording${label}`);
        const res = await fetch(`${BASE}/admin/actions/${encodeURIComponent(action.id)}/settle`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ txSignature: sig }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Transfer confirmed on-chain but the API rejected settle: ${j.error ?? res.status}. Do not resend — check Solscan.`);
        }
      }
      refresh();
      onSettled();
    } catch (e) {
      setError(e instanceof Error ? e.message : walletErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <li className="border-b-2 border-ink p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            {action.kind}
            {action.campaignId ? ` · ${action.campaignId}` : ""}
            {action.status ? ` · ${action.status}` : ""}
          </p>
          <p className="mt-1 text-sm text-ink">{action.description || "—"}</p>
          <p className="mt-1 text-sm font-semibold tabular text-ink">{total.toLocaleString("en-US", { maximumFractionDigits: 6 })} USDC · {action.transfers.length} transfer(s)</p>
        </div>
        <button onClick={run} disabled={!!busy || settled} className={`${btnPrimary} px-4 py-2`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : settled ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy ?? (settled ? "Settled" : "Sign & send")}
        </button>
      </div>
      <ul className="mt-2 space-y-0.5">
        {action.transfers.map((t, i) => (
          <li key={i} className="font-mono text-[11px] text-muted">
            → <a className="underline" href={solscanAccount(t.to, cluster)} target="_blank" rel="noreferrer">{shortAddress(t.to)}</a> {t.amountUsdc.toLocaleString("en-US")} USDC
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{error}</p>}
      {sigs.map((s) => (
        <a key={s} href={solscanTx(s, cluster)} target="_blank" rel="noreferrer" className="mt-1 block font-mono text-[11px] text-ink underline decoration-signal">
          {shortAddress(s)} on Solscan ↗
        </a>
      ))}
    </li>
  );
}

export default function AdminClient() {
  const isTreasury = useIsTreasury();
  const { connected } = useWallet();
  const { treasuryWallet, cluster } = useChainConfig();
  const [actions, setActions] = useState<AdminAction[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!isTreasury) return;
    let alive = true;
    fetch(`${BASE}/admin/actions`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return normalize(await r.json());
      })
      .then((a) => alive && (setActions(a), setLoadErr(null)))
      .catch((e) => alive && setLoadErr(`Couldn't load actions: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      alive = false;
    };
  }, [isTreasury, tick]);

  if (!isTreasury) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Lock className="h-4 w-4" /> Company only
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            This page is for the Harvestia company wallet, which signs milestone releases, refunds and payout distributions.
            {connected ? " The connected wallet is not the treasury wallet." : " Connect the treasury wallet to continue."}
          </p>
          {treasuryWallet ? (
            <a href={solscanAccount(treasuryWallet, cluster)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 break-all font-mono text-[11px] text-ink underline decoration-signal">
              {treasuryWallet} <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <p className="mt-3 font-mono text-[11px] text-muted">Treasury mode is not configured.</p>
          )}
        </Card>
        <TreasuryCard />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <div className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.1em] text-ink">Actions due</h2>
          <button onClick={reload} aria-label="Reload actions" className="text-ink hover:text-signal-ink">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {loadErr && <p role="alert" className="px-4 py-3 text-xs text-[#B3261E]">{loadErr}</p>}
        {!actions && !loadErr && <p className="px-4 py-3 text-xs text-muted">Loading…</p>}
        {actions && actions.length === 0 && <p className="px-4 py-3 text-xs text-muted">Nothing due. Releases, refunds and payouts appear here when votes or deadlines resolve.</p>}
        {actions && actions.length > 0 && (
          <ul>
            {actions.map((a) => (
              <ActionRow key={a.id} action={a} onSettled={reload} />
            ))}
          </ul>
        )}
      </Card>
      <TreasuryCard compact />
    </div>
  );
}
