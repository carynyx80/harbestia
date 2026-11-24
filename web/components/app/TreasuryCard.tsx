"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Landmark, ExternalLink } from "lucide-react";
import { shortAddress } from "@/lib/chain-config";
import { solscanAccount } from "@/lib/treasury";
import { Card } from "./primitives";
import { useChainConfig } from "./WalletProvider";

export default function TreasuryCard({ compact = false }: { compact?: boolean }) {
  const { treasuryWallet, usdcMint, cluster } = useChainConfig();
  const { connection } = useConnection();
  const [usdc, setUsdc] = useState<number | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!treasuryWallet) return;
    let alive = true;
    const load = () => {
      const ata = getAssociatedTokenAddressSync(new PublicKey(usdcMint), new PublicKey(treasuryWallet), true);
      connection
        .getTokenAccountBalance(ata, "confirmed")
        .then((r) => alive && (setUsdc(r.value.uiAmount ?? 0), setErr(false)))
        .catch((e: unknown) => {
          if (!alive) return;
          // Missing account = no USDC received yet.
          if (/could not find account|Invalid param/i.test(String(e))) setUsdc(0);
          else setErr(true);
        });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection, treasuryWallet, usdcMint]);

  if (!treasuryWallet) return null;
  return (
    <Card className={compact ? "p-4" : "p-5"}>
      <div className="flex items-center gap-2 text-sm font-semibold text-navy">
        <Landmark className="h-4 w-4" /> Funds held by Harvestia treasury
      </div>
      <p className="mt-2 break-all font-mono text-[11px] text-ink">{treasuryWallet}</p>
      <dl className="mt-3 flex items-baseline justify-between text-sm">
        <dt className="text-muted">Live USDC balance</dt>
        <dd className="font-semibold tabular text-ink" aria-live="polite">
          {usdc !== null ? `${usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC` : err ? "unavailable" : "…"}
        </dd>
      </dl>
      <a
        href={solscanAccount(treasuryWallet, cluster)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 font-mono text-[11px] text-ink underline decoration-signal underline-offset-2"
      >
        Audit {shortAddress(treasuryWallet)} on Solscan <ExternalLink className="h-3 w-3" />
      </a>
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Custodial: the company wallet holds investor USDC and releases it after investor votes. Every transfer is public on Solana.
      </p>
    </Card>
  );
}
