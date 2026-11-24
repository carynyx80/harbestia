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

/**
 * Minimal structural view of the Helius SDK `@heliuslabs/spr` (v0.9.0-alpha)
 * as documented at https://www.helius.dev/docs/privacy/guides/deposit.md and
 * .../guides/transfer.md. We do not depend on the package at build time; the
 * caller injects the loaded modules. Shapes are from docs, UNVERIFIED on devnet.
 */
export interface HeliusSprModules {
  /** `import * as spr from "@heliuslabs/spr"` → createSprClient, ShieldedKeypair, decryptToBalances, ... */
  spr: any;
  /** `import * as iface from "@heliuslabs/spr/interface"` → depositInstruction, DepositAsset, transactInstruction, ... */
  iface: any;
}

export interface HeliusRingsConfig {
  modules: HeliusSprModules;
  /** e.g. https://devnet.helius-rpc.com/?api-key=... (never hard-code the key). */
  solanaRpcUrl?: string;
  /** spr.ShieldedKeypair for the acting wallet. */
  shieldedKeypair: any;
  /** Sends ixs and confirms; returns { signature, slot }. From zolana-examples `sendAndConfirmFactory`. */
  sendAndConfirm: (ixs: unknown[]) => Promise<TxResult>;
}

export class HeliusRingsAdapter implements RingsAdapter {
  readonly kind = "helius-rings";
  private client: any | undefined;

  constructor(private readonly cfg: HeliusRingsConfig) {}

  private async getClient(): Promise<any> {
    if (!this.client) {
      const opts = this.cfg.solanaRpcUrl ? { solanaRpcUrl: this.cfg.solanaRpcUrl } : {};
      this.client = await this.cfg.modules.spr.createSprClient(opts);
    }
    return this.client;
  }

  /** Deposit (public -> private). Follows the documented depositInstruction shape. */
  async shield(p: ShieldParams): Promise<TxResult> {
    if (p.recipientShieldedAddress) {
      throw new NotImplementedAdapterError(
        "shield to third-party shielded address",
        "docs only show depositing to own address; need ShieldedAddress parsing API",
      );
    }
    const client = await this.getClient();
    const { iface } = this.cfg.modules;
    const kp = this.cfg.shieldedKeypair;
    const signer = kp.toSolanaSigner();
    const addr = kp.shieldedAddress();
    // TODO(adapter): SPL deposits need { mint, sourceTokenAccount, tokenProgram }; ATA derivation
    // via @solana/kit is the caller's job until we add it.
    const asset = iface.DepositAsset.spl({ mint: p.mint, sourceTokenAccount: undefined, tokenProgram: undefined });
    const ix = await iface.depositInstruction({
      tree: client.tree,
      depositor: signer,
      deposits: [
        {
          asset,
          viewTag: addr.confidentialViewTag(),
          recipientOwnerHash: addr.ownerHash(),
          amount: p.amount,
        },
      ],
    });
    return this.cfg.sendAndConfirm([ix]);
  }

  /**
   * Private transfer. Documented sequence (guides/transfer.md):
   *   ProofInputUtxo.fromKeypair(utxo, sender) -> new ConfidentialTransfer(...)
   *   -> transfer.send(recipient, mint, amount) -> transfer.sign(sender, assets)
   *   -> client.proveTransact(inputs, LocalKeys.fromKeypair(...)) -> transactInstruction({...})
   * Missing from docs: UTXO selection, asset registry construction, input/output tree selection.
   */
  async privateTransfer(_p: PrivateTransferParams): Promise<TxResult> {
    throw new NotImplementedAdapterError("privateTransfer", "UTXO selection + asset registry not documented; see RESEARCH.md");
  }

  /** Withdraw (private -> public) via ConfidentialTransfer.withdraw + TransactWithdrawal. Same gaps as privateTransfer. */
  async unshield(_p: UnshieldParams): Promise<TxResult> {
    throw new NotImplementedAdapterError("unshield", "withdraw uses the transact path; same undocumented inputs as privateTransfer");
  }

  /**
   * Docs show balances via decryptToBalances({ keypair, registry, transactions }) over
   * client.getShieldedTransactionsBySignature(sig, atSlot(slot)) — i.e. per known tx.
   * A "scan all my UTXOs" call is not documented (delegated/indexer mode likely provides it).
   */
  async getEncryptedBalance(_owner: string, _mint: Address): Promise<EncryptedBalance> {
    throw new NotImplementedAdapterError("getEncryptedBalance", "no documented owner-wide UTXO scan; needs indexer endpoint");
  }
}
