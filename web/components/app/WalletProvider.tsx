"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { WalletError } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react";
import { ENV_CHAIN_CONFIG, fetchChainConfig, type ChainConfig } from "@/lib/chain-config";
import { API_BASE } from "@/lib/data";

const ChainConfigContext = createContext<ChainConfig>(ENV_CHAIN_CONFIG);
export const useChainConfig = () => useContext(ChainConfigContext);

const WalletErrorContext = createContext<{ error: string | null; clear: () => void }>({ error: null, clear: () => {} });
export const useWalletError = () => useContext(WalletErrorContext);

/**
 * Wallet Standard auto-detection: passing `wallets={[]}` lets the adapter discover
 * every installed standard wallet (Phantom, Solflare, Backpack, ...).
 */
export default function WalletProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ChainConfig>(ENV_CHAIN_CONFIG);
  const [error, setError] = useState<string | null>(null);
  const clear = useCallback(() => setError(null), []);
  const onError = useCallback((e: WalletError) => setError(e.message || e.name), []);

  useEffect(() => {
    const ac = new AbortController();
    fetchChainConfig(API_BASE, ac.signal).then((c) => {
      if (!ac.signal.aborted) setConfig(c);
    });
    return () => ac.abort();
  }, []);

  return (
    <ChainConfigContext.Provider value={config}>
      <ConnectionProvider endpoint={config.rpcUrl} config={{ commitment: "confirmed" }}>
        <SolanaWalletProvider wallets={[]} autoConnect onError={onError}>
          <WalletErrorContext.Provider value={{ error, clear }}>{children}</WalletErrorContext.Provider>
        </SolanaWalletProvider>
      </ConnectionProvider>
    </ChainConfigContext.Provider>
  );
}
