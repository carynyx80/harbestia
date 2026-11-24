// Runtime privacy configuration. HELIUS_API_KEY is a secret: it is read from env only,
// never returned by any endpoint and never logged (use redact() on any error text).
export type PrivacyMode = "mock" | "helius";
export type SolanaCluster = "devnet" | "mainnet";

/** Helius Privacy Rings default ring (same program id on mainnet and devnet). */
export const RING_PROGRAM_IDS: Record<SolanaCluster, string> = {
  devnet: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
  mainnet: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
};
export const USER_REGISTRY_IDS: Record<SolanaCluster, string> = {
  devnet: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
  mainnet: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
};

export interface PrivacyConfig {
  privacyMode: PrivacyMode;
  cluster: SolanaCluster;
  ringProgramId: string;
  userRegistryId: string;
  /** Only set in helius mode. Contains the API key: never log or return it. */
  rpcUrl?: string;
  /** Secret. Kept so redact() can scrub it. */
  heliusApiKey?: string;
  /** Treasury mode (v4): company-controlled treasury wallet (custodial). */
  treasuryMode: boolean;
  treasuryWallet: string;
  usdcMint: string;
  /** Upstream JSON-RPC for /rpc proxy and tx verification. May contain the API key: never log or return it. */
  upstreamRpcUrl: string;
}

export const DEFAULT_TREASURY_WALLET = "DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx";
export const USDC_MINTS: Record<SolanaCluster, string> = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};
export const PUBLIC_RPC_URLS: Record<SolanaCluster, string> = {
  mainnet: "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
};
const heliusRpc = (cluster: SolanaCluster, key: string) => `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;

export function loadConfig(env: Record<string, string | undefined> = process.env): PrivacyConfig {
  const mode = (env.PRIVACY_MODE ?? "mock").trim().toLowerCase() || "mock";
  const tm = (env.TREASURY_MODE ?? "off").trim().toLowerCase() || "off";
  if (!["on", "off", "true", "false", "1", "0"].includes(tm)) throw new Error(`TREASURY_MODE must be "on" or "off" (got "${tm}")`);
  const treasuryMode = tm === "on" || tm === "true" || tm === "1";
  if (mode !== "mock" && mode !== "helius") throw new Error(`PRIVACY_MODE must be "mock" or "helius" (got "${mode}")`);
  const defCluster = treasuryMode ? "mainnet" : "devnet";
  const cluster = (env.SOLANA_CLUSTER ?? defCluster).trim().toLowerCase() || defCluster;
  if (cluster !== "devnet" && cluster !== "mainnet") throw new Error(`SOLANA_CLUSTER must be "devnet" or "mainnet" (got "${cluster}")`);
  const key = env.HELIUS_API_KEY?.trim() || undefined;
  const b58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const treasuryWallet = env.TREASURY_WALLET?.trim() || DEFAULT_TREASURY_WALLET;
  const usdcMint = env.USDC_MINT?.trim() || USDC_MINTS[cluster];
  if (!b58.test(treasuryWallet)) throw new Error("TREASURY_WALLET must be a base58 Solana address");
  if (!b58.test(usdcMint)) throw new Error("USDC_MINT must be a base58 Solana address");
  const base: PrivacyConfig = {
    privacyMode: mode, cluster, ringProgramId: RING_PROGRAM_IDS[cluster], userRegistryId: USER_REGISTRY_IDS[cluster],
    treasuryMode, treasuryWallet, usdcMint, upstreamRpcUrl: key ? heliusRpc(cluster, key) : PUBLIC_RPC_URLS[cluster],
    ...(key ? { heliusApiKey: key } : {}),
  };
  if (mode === "mock") return base;
  if (!key) throw new Error("HELIUS_API_KEY must be set when PRIVACY_MODE=helius (refusing to start)");
  return { ...base, rpcUrl: heliusRpc(cluster, key) };
}

/** Scrub an API key (and any api-key query param) from text before it is logged or returned. */
export function redact(text: string, secret?: string): string {
  let out = String(text);
  if (secret) out = out.split(secret).join("[REDACTED]").split(encodeURIComponent(secret)).join("[REDACTED]");
  return out.replace(/api-key=[^&\s"']+/gi, "api-key=[REDACTED]");
}
