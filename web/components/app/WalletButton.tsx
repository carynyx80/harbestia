"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Wallet, LogOut, Loader2, X } from "lucide-react";
import { shortAddress } from "@/lib/chain-config";
import { useBalances, useChainConfig, useWalletError } from "./WalletProvider";
import { baseToUsdc } from "@/lib/treasury";

function isMobileUA() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function deepLinks() {
  if (typeof window === "undefined") return null;
  const url = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return {
    phantom: `https://phantom.app/ul/browse/${url}?ref=${ref}`,
    solflare: `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`,
  };
}

const btnBase =
  "inline-flex items-center gap-2 border-2 border-ink px-3 py-2 font-mono text-xs font-semibold transition-colors";

export default function WalletButton() {
  const { wallets, publicKey, connected, connecting, select, disconnect } = useWallet();
  const { cluster } = useChainConfig();
  const { balances, loading: balLoading } = useBalances();
  const [mobile] = useState(isMobileUA);
  const [open, setOpen] = useState(false);
  const { error: err, clear } = useWalletError();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const detected = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable,
  );

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    return (
      <div className="flex items-center">
        <span className={`${btnBase} bg-paper text-ink`} title={`${addr} · ${cluster}`}>
          <Wallet className="h-4 w-4" />
          {shortAddress(addr)}
          <span className="hidden text-[10px] tracking-[0.04em] text-muted sm:inline" aria-live="polite">
            {balances
              ? `${(balances.lamports / 1e9).toFixed(3)} SOL · ${baseToUsdc(balances.usdcBase).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`
              : balLoading
                ? "…"
                : ""}
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.08em] text-muted lg:inline">{cluster === "mainnet-beta" ? "mainnet" : cluster}</span>
        </span>
        <button
          onClick={() => disconnect().catch(() => undefined)}
          aria-label="Disconnect wallet"
          title="Disconnect"
          className="-ml-0.5 grid h-[36px] w-9 place-items-center border-2 border-ink text-ink transition-colors hover:bg-ink hover:text-paper"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          clear();
          setOpen((o) => !o);
        }}
        disabled={connecting}
        aria-expanded={open}
        className={`${btnBase} bg-signal uppercase tracking-[0.06em] text-ink hover:bg-ink hover:text-paper disabled:opacity-60`}
      >
        {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {err && !open && (
        <p role="alert" className="absolute right-0 top-full z-40 mt-2 w-64 border-2 border-ink bg-paper px-3 py-2 text-xs text-[#B3261E]">
          {err}
        </p>
      )}
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 border-2 border-ink bg-paper shadow-[4px_4px_0_0_var(--color-ink,#111)]">
          <div className="flex items-center justify-between border-b-2 border-ink px-3 py-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">
              Select wallet · {cluster}
            </span>
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-ink hover:text-signal-ink">
              <X className="h-4 w-4" />
            </button>
          </div>
          {detected.length === 0 ? (
            mobile ? (
              <div className="px-3 py-3 text-xs leading-relaxed text-muted">
                <p>No wallet in this browser. Open Harvestia inside your wallet app:</p>
                <div className="mt-2 grid gap-1.5">
                  {(() => {
                    const l = deepLinks();
                    return l ? (
                      <>
                        <a href={l.phantom} className={`${btnBase} justify-center bg-paper text-ink hover:bg-ink hover:text-paper`}>Open in Phantom</a>
                        <a href={l.solflare} className={`${btnBase} justify-center bg-paper text-ink hover:bg-ink hover:text-paper`}>Open in Solflare</a>
                      </>
                    ) : null;
                  })()}
                </div>
              </div>
            ) : (
              <p className="px-3 py-3 text-xs leading-relaxed text-muted">
                No Solana wallet detected. Install{" "}
                <a className="underline" href="https://phantom.app/download" target="_blank" rel="noreferrer">Phantom</a>,{" "}
                <a className="underline" href="https://solflare.com/download" target="_blank" rel="noreferrer">Solflare</a> or{" "}
                <a className="underline" href="https://backpack.app/download" target="_blank" rel="noreferrer">Backpack</a>, then reload.
              </p>
            )
          ) : (
            <ul>
              {detected.map((w) => (
                <li key={w.adapter.name} className="border-b border-ink/20 last:border-b-0">
                  <button
                    onClick={() => {
                      // autoConnect on the provider connects the selected wallet.
                      clear();
                      select(w.adapter.name);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left font-mono text-xs font-semibold text-ink transition-colors hover:bg-ink hover:text-paper"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs */}
                    <img src={w.adapter.icon} alt="" width={20} height={20} className="h-5 w-5" />
                    {w.adapter.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {err && <p role="alert" className="border-t-2 border-ink bg-[#B3261E]/10 px-3 py-2 text-xs text-[#B3261E]">{err}</p>}
        </div>
      )}
    </div>
  );
}
