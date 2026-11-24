import type { Address, Amount, Hex } from "./types.js";
import { NotImplementedAdapterError } from "./types.js";

/**
 * Private balances for deposits, refunds and exits.
 * Backed by Helius Privacy / Solana Privacy Rings (devnet beta).
 * Terminology: Helius calls these deposit (public->private), transfer
 * (private->private) and withdraw (private->public). We keep shield/unshield
 * names for the app and map them 1:1.
 */
export interface ShieldParams {
  /** Public wallet paying in (its address and the amount are PUBLIC on deposit). */
  from: Address;
  mint: Address;
  amount: Amount;
  /** Shielded address to credit; defaults to the depositor's own. */
  recipientShieldedAddress?: string;
  /** SPL only: depositor's source token account (ATA). */
  splTokenAccount?: Address;
  /** PUBLIC on-chain deposit memo. Never put secrets here. */
  publicMemo?: Uint8Array;
}

export interface PrivateTransferParams {
  mint: Address;
  amount: Amount;
  /** Recipient shielded address (e.g. campaign vault's). */
  toShieldedAddress: string;
  /** Encrypted memo, e.g. campaign id + position commitment. */
  memo?: Uint8Array;
}

export interface UnshieldParams {
  mint: Address;
  amount: Amount;
  /** Public wallet that receives funds (address + amount become PUBLIC). */
  to: Address;
}

export interface TxResult {
  signature: string;
  slot?: bigint;
}

export interface EncryptedBalance {
  mint: Address;
  /** Decrypted locally with the viewing key; undefined if caller lacks it. */
  amount?: Amount;
  /** Count of UTXOs (Private Solana Token Accounts) backing the balance. */
  utxoCount: number;
  /** Opaque ciphertext refs when not decryptable here. */
  ciphertexts?: Hex[];
}

export interface RingsAdapter {
  readonly kind: string;
  shield(p: ShieldParams): Promise<TxResult>;
  privateTransfer(p: PrivateTransferParams): Promise<TxResult>;
  unshield(p: UnshieldParams): Promise<TxResult>;
  getEncryptedBalance(owner: string, mint: Address): Promise<EncryptedBalance>;
}

export * from "./helius.js";
