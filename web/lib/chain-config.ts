// Client-safe chain/privacy config. Only NEXT_PUBLIC_* values; never put API keys here.
// The RPC URL must be a public or key-less endpoint (a keyed Helius URL belongs on the server).

export type PrivacyMode = "mock" | "helius";
export type SolanaCluster = "devnet" | "mainnet-beta" | "testnet";

export interface ChainConfig {
  privacyMode: PrivacyMode;
  cluster: SolanaCluster;
  rpcUrl: string;
}

const DEFAULT_RPC: Record<SolanaCluster, string> = {
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

function asMode(v: unknown): PrivacyMode | undefined {
  return v === "helius" || v === "mock" ? v : undefined;
}
function asCluster(v: unknown): SolanaCluster | undefined {
  return v === "devnet" || v === "testnet" || v === "mainnet-beta" ? v : undefined;
}
/** Reject URLs that look like they carry a secret (e.g. ?api-key=) so they never reach the bundle's runtime. */
function safeRpc(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^https?:\/\//.test(v)) return undefined;
  return /api[-_]?key=/i.test(v) ? undefined : v;
}

const envCluster = asCluster(process.env.NEXT_PUBLIC_SOLANA_CLUSTER) ?? "devnet";

export const ENV_CHAIN_CONFIG: ChainConfig = {
  privacyMode: asMode(process.env.NEXT_PUBLIC_PRIVACY_MODE) ?? "mock",
  cluster: envCluster,
  rpcUrl: safeRpc(process.env.NEXT_PUBLIC_SOLANA_RPC_URL) ?? DEFAULT_RPC[envCluster],
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
    const cluster = asCluster(j.cluster ?? j.solanaCluster) ?? ENV_CHAIN_CONFIG.cluster;
    return {
      privacyMode: asMode(j.privacyMode ?? j.mode) ?? ENV_CHAIN_CONFIG.privacyMode,
      cluster,
      rpcUrl: safeRpc(j.rpcUrl ?? j.solanaRpcUrl) ?? (cluster === ENV_CHAIN_CONFIG.cluster ? ENV_CHAIN_CONFIG.rpcUrl : DEFAULT_RPC[cluster]),
    };
  } catch {
    return ENV_CHAIN_CONFIG;
  }
}

export const shortAddress = (a: string) => (a.length > 10 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);
