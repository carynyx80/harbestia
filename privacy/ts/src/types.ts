/** Amounts are base units (USDC = 6 decimals) as bigint. */
export type Amount = bigint;
/** Base58 Solana address (public wallet). */
export type Address = string;
/** Opaque bytes, hex-encoded. */
export type Hex = string;

export class NotImplementedAdapterError extends Error {
  constructor(what: string, detail: string) {
    super(`[@harvestia/privacy] ADAPTER TODO: ${what} — ${detail}`);
    this.name = "NotImplementedAdapterError";
  }
}
