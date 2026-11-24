// Client-safe chain/privacy config. Only NEXT_PUBLIC_* values; never put API keys here.
// The RPC URL must be a public or key-less endpoint (a keyed Helius URL belongs on the server).

export type PrivacyMode = "mock" | "helius";
export type SolanaCluster = "devnet" | "mainnet-beta" | "testnet";
export type AppMode = "treasury" | "mock" | "helius";

export interface ChainConfig {
  privacyMode: PrivacyMode;
  /** "treasury" = real mainnet USDC to the company treasury wallet (v4). */
  mode: AppMode;
  cluster: SolanaCluster;
  /** Always {API}/rpc — the API proxies JSON-RPC so no key reaches the browser. */
  rpcUrl: string;
  treasuryWallet: string | null;
  treasuryUsdcAta: string | null;
  usdcMint: string;
}

const API = (process.env.NEXT_PUBLIC_HARVESTIA_API ?? "http://localhost:8787").replace(/\/$/, "");
export const PROXY_RPC = `${API}/rpc`;
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const TREASURY_DEFAULT = "DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx";
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function asMode(v: unknown): PrivacyMode | undefined {
  return v === "helius" || v === "mock" ? v : undefined;
}
function asCluster(v: unknown): SolanaCluster | undefined {
  if (v === "mainnet" || v === "mainnet-beta") return "mainnet-beta";
  return v === "devnet" || v === "testnet" ? v : undefined;
}
const asAddr = (v: unknown) => (typeof v === "string" && BASE58.test(v) ? v : undefined);

const envCluster = asCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) ?? "mainnet-beta";
const envTreasury = asAddr(process.env.NEXT_PUBLIC_TREASURY_WALLET) ?? null;
const envPrivacy = asMode(process.env.NEXT_PUBLIC_PRIVACY_MODE) ?? "mock";

export const ENV_CHAIN_CONFIG: ChainConfig = {
  privacyMode: envPrivacy,
  mode: envTreasury ? "treasury" : envPrivacy,
  cluster: envCluster,
  rpcUrl: PROXY_RPC,
  // Public company treasury (SPEC v4). Shown for transparency; it only enables real
  // investing when the API reports mode "treasury" or NEXT_PUBLIC_TREASURY_WALLET is set.
  treasuryWallet: envTreasury ?? TREASURY_DEFAULT,
  treasuryUsdcAta: null,
  usdcMint: asAddr(process.env.NEXT_PUBLIC_USDC_MINT) ?? USDC_MAINNET,
};

/** Helius Privacy Rings default ring (devnet beta). Public program ids. */
export const HELIUS_RING = {
  shieldedPoolProgram: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
  registry: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
} as const;

/** Try GET {api}/config; fall back to env for any missing/invalid field. Browser-only. */
export async function fetchChainConfig(apiBase: string, signal?: AbortSignal): Promise<ChainConfig> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/config`, { signal, cache: "no-store" });
    if (!res.ok) return ENV_CHAIN_CONFIG;
    const j = (await res.json()) as Record<string, unknown>;
    const privacyMode = asMode(j.privacyMode) ?? asMode(j.mode) ?? ENV_CHAIN_CONFIG.privacyMode;
    const treasuryWallet = asAddr(j.treasuryWallet) ?? ENV_CHAIN_CONFIG.treasuryWallet;
    const mode: AppMode = (j.mode === "treasury" || j.treasuryMode === true || ENV_CHAIN_CONFIG.mode === "treasury") && treasuryWallet ? "treasury" : privacyMode;
    return {
      privacyMode,
      mode,
      cluster: asCluster(j.cluster ?? j.solanaCluster) ?? ENV_CHAIN_CONFIG.cluster,
      rpcUrl: PROXY_RPC,
      treasuryWallet,
      treasuryUsdcAta: asAddr(j.treasuryUsdcAta) ?? null,
      usdcMint: asAddr(j.usdcMint) ?? ENV_CHAIN_CONFIG.usdcMint,
    };
  } catch {
    return ENV_CHAIN_CONFIG;
  }
}

export const shortAddress = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
