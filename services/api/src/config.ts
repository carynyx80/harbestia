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
}

export function loadConfig(env: Record<string, string | undefined> = process.env): PrivacyConfig {
  const mode = (env.PRIVACY_MODE ?? "mock").trim().toLowerCase() || "mock";
  if (mode !== "mock" && mode !== "helius") throw new Error(`PRIVACY_MODE must be "mock" or "helius" (got "${mode}")`);
  const cluster = (env.SOLANA_CLUSTER ?? "devnet").trim().toLowerCase() || "devnet";
  if (cluster !== "devnet" && cluster !== "mainnet") throw new Error(`SOLANA_CLUSTER must be "devnet" or "mainnet" (got "${cluster}")`);
  const base: PrivacyConfig = {
    privacyMode: mode, cluster, ringProgramId: RING_PROGRAM_IDS[cluster], userRegistryId: USER_REGISTRY_IDS[cluster],
  };
  if (mode === "mock") return base;
  const key = env.HELIUS_API_KEY?.trim();
  if (!key) throw new Error("HELIUS_API_KEY must be set when PRIVACY_MODE=helius (refusing to start)");
  return { ...base, heliusApiKey: key, rpcUrl: `https://${cluster}.helius-rpc.com/?api-key=${encodeURIComponent(key)}` };
}

/** Scrub an API key (and any api-key query param) from text before it is logged or returned. */
export function redact(text: string, secret?: string): string {
  let out = String(text);
  if (secret) out = out.split(secret).join("[REDACTED]").split(encodeURIComponent(secret)).join("[REDACTED]");
  return out.replace(/api-key=[^&\s"']+/gi, "api-key=[REDACTED]");
}
