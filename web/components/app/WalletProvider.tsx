"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WalletError } from "@solana/wallet-adapter-base";
import { PublicKey } from "@solana/web3.js";
import { ConnectionProvider, WalletProvider as SolanaWalletProvider, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ENV_CHAIN_CONFIG, fetchChainConfig, type ChainConfig } from "@/lib/chain-config";
import { API_BASE } from "@/lib/data";
import { getWalletBalances, proxyFetch, walletErrorMessage, type WalletBalances } from "@/lib/treasury";

const CONN_CONFIG = { commitment: "confirmed" as const, fetch: proxyFetch };

const ChainConfigContext = createContext<ChainConfig>(ENV_CHAIN_CONFIG);
export const useChainConfig = () => useContext(ChainConfigContext);

const WalletErrorContext = createContext<{ error: string | null; clear: () => void; set: (m: string) => void }>({
  error: null,
  clear: () => {},
  set: () => {},
});
export const useWalletError = () => useContext(WalletErrorContext);

interface BalanceState {
  balances: WalletBalances | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}
const BalanceContext = createContext<BalanceState>({ balances: null, loading: false, error: null, refresh: () => {} });
export const useBalances = () => useContext(BalanceContext);

/** True when the connected wallet is the company treasury wallet. */
export function useIsTreasury() {
  const { publicKey } = useWallet();
  const { treasuryWallet } = useChainConfig();
  return !!publicKey && !!treasuryWallet && publicKey.toBase58() === treasuryWallet;
}

function BalanceProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { usdcMint } = useChainConfig();
  const [balances, setBalances] = useState<WalletBalances | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const key = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    // Kick off async loading state in a microtask to avoid sync setState-in-effect.
    Promise.resolve().then(() => alive && setLoading(true));
    getWalletBalances(connection, new PublicKey(key), new PublicKey(usdcMint))
      .then((b) => alive && (setBalances(b), setError(null)))
      .catch((e) => alive && setError(`Couldn't load balances: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => alive && setLoading(false));
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [connection, key, usdcMint, tick]);

  const value = useMemo(
    () => ({ balances: key ? balances : null, loading, error: key ? error : null, refresh }),
    [key, balances, loading, error, refresh],
  );
  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

/** Surfaces unexpected disconnects (e.g. locked wallet / revoked site). */
function DisconnectWatcher({ onDisconnect }: { onDisconnect: () => void }) {
  const { connected, disconnecting } = useWallet();
  const was = useRef(false);
  const intentional = useRef(false);
  useEffect(() => {
    if (disconnecting) intentional.current = true;
  }, [disconnecting]);
  useEffect(() => {
    if (was.current && !connected && !intentional.current) onDisconnect();
    if (connected) intentional.current = false;
    was.current = connected;
  }, [connected, onDisconnect]);
  return null;
}

/**
 * Wallet Standard auto-detection: passing `wallets={[]}` lets the adapter discover
 * every installed standard wallet (Phantom, Solflare, Backpack, ...) and adds Mobile
 * Wallet Adapter on Android. The last wallet is persisted ("walletName") and auto-reconnects.
 */
export default function WalletProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ChainConfig>(ENV_CHAIN_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const clear = useCallback(() => setError(null), []);
  const onError = useCallback((e: WalletError) => setError(walletErrorMessage(e)), []);
  const onDisconnect = useCallback(() => setError("Wallet disconnected. Reconnect to continue."), []);
  const errCtx = useMemo(() => ({ error, clear, set: setError }), [error, clear]);

  useEffect(() => {
    const ac = new AbortController();
    fetchChainConfig(API_BASE, ac.signal).then((c) => {
      if (!ac.signal.aborted) setConfig(c);
    });
    return () => ac.abort();
  }, []);

  return (
    <ChainConfigContext.Provider value={config}>
      <ConnectionProvider endpoint={config.rpcUrl} config={CONN_CONFIG}>
        <SolanaWalletProvider wallets={[]} autoConnect onError={onError}>
          <WalletErrorContext.Provider value={errCtx}>
            <DisconnectWatcher onDisconnect={onDisconnect} />
            <BalanceProvider>{children}</BalanceProvider>
          </WalletErrorContext.Provider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </ChainConfigContext.Provider>
  );
}
