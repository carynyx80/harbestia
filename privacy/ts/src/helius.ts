// Real Helius Privacy Rings adapter, built against @heliuslabs/spr@0.9.0-alpha
// (.d.ts in node_modules/@heliuslabs/spr/dist are the source of truth) and @solana/kit@8.
//
// Every SDK call goes through the injected `HeliusSdk` object so tests can mock the
// module boundary. By default it is loaded with dynamic `import()`, so consumers who
// only use MockPrivacy never load the SDK.
import type * as SprRoot from "@heliuslabs/spr";
import type * as SprKeypair from "@heliuslabs/spr/keypair";
import type * as Kit from "@solana/kit";
import type { Address, Amount } from "./types.js";
import { NotImplementedAdapterError } from "./types.js";
import type {
  EncryptedBalance,
  PrivateTransferParams,
  RingsAdapter,
  ShieldParams,
  TxResult,
  UnshieldParams,
} from "./rings.js";

export type Cluster = "mainnet" | "devnet";

/** Program IDs per cluster (identical on both today; matches SHIELDED_POOL_PROGRAM_ID / USER_REGISTRY_PROGRAM_ID in the SDK). */
export const HELIUS_RINGS_PROGRAM_IDS: Readonly<Record<Cluster, { shieldedPool: string; userRegistry: string }>> = {
  mainnet: {
    shieldedPool: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
    userRegistry: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
  },
  devnet: {
    shieldedPool: "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW",
    userRegistry: "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ",
  },
};

/** Compiled, UNSIGNED (or partially signed) @solana/kit transaction, as returned by the SDK builders. */
export type UnsignedTx = Kit.Transaction;

/** The subset of the SDK we use. Mock this in tests. */
export interface HeliusSdk {
  spr: Pick<
    typeof SprRoot,
    | "createSprClient"
    | "buildDepositTransaction"
    | "buildTransferTransaction"
    | "buildWithdrawalTransaction"
    | "buildRegistrationTransaction"
    | "buildSetMergeEncryptionTransaction"
    | "syncWallet"
    | "getPrivateTokenBalances"
    | "Wallet"
    | "LocalKeys"
    | "ShieldedAddress"
    | "MergeEncryptionScheme"
    | "SOL_MINT"
  >;
  keypair: Pick<typeof SprKeypair, "ed25519DerivationMessage">;
  kit: Pick<typeof Kit, "getBase64EncodedWireTransaction" | "partiallySignTransaction" | "getAddressFromPublicKey">;
}

export async function loadHeliusSdk(): Promise<HeliusSdk> {
  const [spr, keypair, kit] = await Promise.all([
    import("@heliuslabs/spr"),
    import("@heliuslabs/spr/keypair"),
    import("@solana/kit"),
  ]);
  return { spr, keypair, kit };
}

/** Wallet abstraction: a browser wallet (Phantom/Backpack via wallet-standard) or a server key. */
export interface RingsSigner {
  /** Base58 public key; it is the fee payer and the shielded owner. */
  readonly address: string;
  /** Returns the transaction with this signer's signature added. */
  signTransaction(tx: UnsignedTx): Promise<UnsignedTx>;
  /**
   * Signs the Solana off-chain message produced by `derivationMessage(address)`.
   * The 64-byte signature is the shielded-key derivation seed (SECRET: whoever
   * holds it can decrypt the history). Needed when `keys` is not provided.
   */
  signMessage?(message: Uint8Array): Promise<Uint8Array>;
}

/** Server-side signer from a WebCrypto Ed25519 key pair (e.g. kit `createKeyPairFromBytes`). */
export async function serverSigner(
  keyPair: CryptoKeyPair,
  sdk?: HeliusSdk,
  signMessage?: (m: Uint8Array) => Promise<Uint8Array>,
): Promise<RingsSigner> {
  const s = sdk ?? (await loadHeliusSdk());
  const address = await s.kit.getAddressFromPublicKey(keyPair.publicKey);
  return {
    address,
    signTransaction: (tx) => s.kit.partiallySignTransaction([keyPair], tx),
    signMessage:
      signMessage ??
      (async (m) => new Uint8Array(await crypto.subtle.sign("Ed25519", keyPair.privateKey, m as BufferSource))),
  };
}

/** Bytes a wallet must sign (off-chain message v0, payload "TSPP/derive/v1") to derive shielded keys. */
export async function derivationMessage(signerAddress: string, sdk?: HeliusSdk): Promise<Uint8Array> {
  const s = sdk ?? (await loadHeliusSdk());
  return s.keypair.ed25519DerivationMessage(decodeBase58(signerAddress) as Parameters<HeliusSdk["keypair"]["ed25519DerivationMessage"]>[0]);
}

export interface HeliusRingsConfig {
  cluster: Cluster;
  /** Helius RPC URL from the caller (it serves indexer + prover too). Never logged. */
  rpcUrl: string;
  signer: RingsSigner;
  /** Optional precomputed derivation seed (64 bytes); otherwise `signer.signMessage` is asked once. */
  derivationSeed?: Uint8Array;
  /** Inject for tests; defaults to dynamic import of the real SDK. */
  sdk?: HeliusSdk;
}

type Client = Awaited<ReturnType<HeliusSdk["spr"]["createSprClient"]>>;
type Keys = ReturnType<HeliusSdk["spr"]["LocalKeys"]["fromDerivationSeed"]>;
type WalletT = InstanceType<HeliusSdk["spr"]["Wallet"]>;
type ShieldedAddressT = SprRoot.ShieldedAddress;

const HEX_RE = /^(0x)?[0-9a-fA-F]+$/;
const asAddr = (s: string) => s as Kit.Address;
const toHex = (b: Uint8Array) => Buffer.from(b).toString("hex");

/** Removes anything that looks like an api-key from error text before it propagates. */
function scrub(e: unknown, rpcUrl: string): Error {
  const msg = String((e as Error)?.message ?? e).split(rpcUrl).join("<rpc-url>").replace(/api-key=[^&\s"']+/g, "api-key=<redacted>");
  const out = new Error(msg);
  out.name = (e as Error)?.name ?? "Error";
  return out;
}

export class HeliusRingsAdapter implements RingsAdapter {
  readonly kind = "helius-rings";
  readonly programIds: { shieldedPool: string; userRegistry: string };
  #sdk?: HeliusSdk;
  #client?: Client;
  #keys?: Keys;
  #wallet?: WalletT;
  readonly #cfg: HeliusRingsConfig;

  constructor(cfg: HeliusRingsConfig) {
    if (!cfg.rpcUrl) throw new Error("rpcUrl is required");
    if (cfg.cluster !== "mainnet" && cfg.cluster !== "devnet") throw new Error(`unknown cluster ${String(cfg.cluster)}`);
    this.#cfg = cfg;
    this.#sdk = cfg.sdk;
    this.programIds = HELIUS_RINGS_PROGRAM_IDS[cfg.cluster];
  }

  get signerAddress(): string {
    return this.#cfg.signer.address;
  }

  private async sdk(): Promise<HeliusSdk> {
    return (this.#sdk ??= await loadHeliusSdk());
  }

  private async client(): Promise<Client> {
    if (!this.#client) {
      const sdk = await this.sdk();
      this.#client = await withRetry(() => sdk.spr.createSprClient({ solanaRpcUrl: this.#cfg.rpcUrl }), this.#cfg.rpcUrl);
    }
    return this.#client;
  }

  /** Shielded keys (viewing + nullifier) derived from the wallet signature over "TSPP/derive/v1". */
  private async keys(): Promise<Keys> {
    if (this.#keys) return this.#keys;
    const sdk = await this.sdk();
    const client = await this.client();
    let seed = this.#cfg.derivationSeed;
    if (!seed) {
      if (!this.#cfg.signer.signMessage) throw new Error("signer.signMessage or derivationSeed is required to derive shielded keys");
      seed = await this.#cfg.signer.signMessage(await derivationMessage(this.#cfg.signer.address, sdk));
    }
    this.#keys = sdk.spr.LocalKeys.fromDerivationSeed(
      { solanaPublicKey: asAddr(this.#cfg.signer.address), derivationSeed: seed },
      client.proofService,
    );
    return this.#keys;
  }

  private async wallet(): Promise<WalletT> {
    if (!this.#wallet) {
      const sdk = await this.sdk();
      this.#wallet = new sdk.spr.Wallet({ identity: (await this.keys()).address() });
    }
    return this.#wallet;
  }

  /** This wallet's shielded address, hex of `ShieldedAddress.toBytes()` (shareable, public). */
  async shieldedAddress(): Promise<string> {
    return toHex((await this.keys()).address().toBytes());
  }

  private async parseRecipient(s: string): Promise<Kit.Address | ShieldedAddressT> {
    const sdk = await this.sdk();
    if (HEX_RE.test(s) && s.replace(/^0x/, "").length > 88) {
      return sdk.spr.ShieldedAddress.fromBytes(Buffer.from(s.replace(/^0x/, ""), "hex"));
    }
    return asAddr(s); // registered Solana address; the SDK resolves it via the user registry
  }

  private mintOrSol(sdk: HeliusSdk, mint: Address): Kit.Address {
    return mint === "SOL" || mint === sdk.spr.SOL_MINT ? sdk.spr.SOL_MINT : asAddr(mint);
  }

  private async syncedWallet(): Promise<WalletT> {
    const sdk = await this.sdk();
    const wallet = await this.wallet();
    const client = await this.client();
    const keys = await this.keys();
    await withRetry(() => sdk.spr.syncWallet({ wallet, keys, client }), this.#cfg.rpcUrl);
    return wallet;
  }

  // --------------------------------------------------------------- builders (UNSIGNED)

  /**
   * Onboarding: registry record (nullifier + viewing public key) plus merge encryption.
   * Returns [] when already registered. Required so others can send to this Solana address.
   */
  async buildRegisterTxs(): Promise<UnsignedTx[]> {
    const sdk = await this.sdk();
    const client = await this.client();
    const owner = asAddr(this.#cfg.signer.address);
    const reg = await sdk.spr.buildRegistrationTransaction({ client, owner, address: (await this.keys()).address() });
    if (!reg) return [];
    const merge = await sdk.spr.buildSetMergeEncryptionTransaction({
      client,
      owner,
      scheme: sdk.spr.MergeEncryptionScheme.PoseidonCtrV1,
    });
    return [reg, merge];
  }

  /** Deposit (public -> private). No proof needed. Depositor address, mint and amount are PUBLIC. */
  async buildShieldTx(p: ShieldParams): Promise<UnsignedTx> {
    if (p.amount <= 0n) throw new Error("amount must be positive");
    const sdk = await this.sdk();
    const client = await this.client();
    const recipient = p.recipientShieldedAddress
      ? await this.parseRecipient(p.recipientShieldedAddress)
      : (await this.keys()).address();
    return sdk.spr.buildDepositTransaction({
      client,
      feePayer: asAddr(this.#cfg.signer.address),
      depositor: asAddr(p.from),
      recipient,
      asset: this.mintOrSol(sdk, p.mint),
      amount: p.amount,
      ...(p.splTokenAccount ? { splTokenAccount: asAddr(p.splTokenAccount) } : {}),
      ...(p.publicMemo ? { memo: p.publicMemo } : {}),
    });
  }

  /** Private transfer: SDK syncs UTXOs, selects inputs, asks the Helius prover, returns an unsigned tx. */
  async buildPrivateTransferTx(p: PrivateTransferParams): Promise<UnsignedTx> {
    if (p.amount <= 0n) throw new Error("amount must be positive");
    if (p.memo) {
      throw new NotImplementedAdapterError("privateTransfer memo", "buildTransferTransaction in @heliuslabs/spr 0.9.0-alpha has no memo field");
    }
    const sdk = await this.sdk();
    const wallet = await this.syncedWallet();
    return withRetry(
      async () =>
        sdk.spr.buildTransferTransaction({
          client: await this.client(),
          wallet,
          keys: await this.keys(),
          feePayer: asAddr(this.#cfg.signer.address),
          recipient: await this.parseRecipient(p.toShieldedAddress),
          asset: this.mintOrSol(sdk, p.mint),
          amount: p.amount,
        }),
      this.#cfg.rpcUrl,
    );
  }

  /** Withdraw (private -> public). Recipient, mint and amount become PUBLIC. */
  async buildUnshieldTx(p: UnshieldParams): Promise<UnsignedTx> {
    if (p.amount <= 0n) throw new Error("amount must be positive");
    const sdk = await this.sdk();
    const wallet = await this.syncedWallet();
    return withRetry(
      async () =>
        sdk.spr.buildWithdrawalTransaction({
          client: await this.client(),
          wallet,
          keys: await this.keys(),
          feePayer: asAddr(this.#cfg.signer.address),
          recipient: asAddr(p.to),
          asset: this.mintOrSol(sdk, p.mint),
          amount: p.amount,
        }),
      this.#cfg.rpcUrl,
    );
  }

  // --------------------------------------------------------------- sign + send (server or wallet)

  /** Signs with `signer`, submits, and waits for confirmation. Works server-side or with a browser wallet signer. */
  async signAndSend(tx: UnsignedTx): Promise<TxResult> {
    const sdk = await this.sdk();
    const client = await this.client();
    try {
      const signed = await this.#cfg.signer.signTransaction(tx);
      const wire = sdk.kit.getBase64EncodedWireTransaction(signed);
      const signature = await withRetry(
        () => client.solanaRpc.sendTransaction(wire, { encoding: "base64" }).send(),
        this.#cfg.rpcUrl,
      );
      const slot = await client.confirmTransaction(signature);
      return { signature, slot };
    } catch (e) {
      throw scrub(e, this.#cfg.rpcUrl);
    }
  }

  /** Registers if needed; returns the signatures sent (empty when already registered). */
  async register(): Promise<TxResult[]> {
    const out: TxResult[] = [];
    for (const tx of await this.buildRegisterTxs()) out.push(await this.signAndSend(tx));
    return out;
  }

  // --------------------------------------------------------------- RingsAdapter
  async shield(p: ShieldParams): Promise<TxResult> {
    return this.signAndSend(await this.buildShieldTx(p));
  }
  async privateTransfer(p: PrivateTransferParams): Promise<TxResult> {
    return this.signAndSend(await this.buildPrivateTransferTx(p));
  }
  async unshield(p: UnshieldParams): Promise<TxResult> {
    return this.signAndSend(await this.buildUnshieldTx(p));
  }

  /**
   * Syncs the owner's UTXOs from the Helius indexer (by view tag / nullifiers) and decrypts
   * locally with the viewing key. Only the adapter's own wallet can be decrypted.
   * `owner` may be the signer's Solana address or this wallet's shielded address hex.
   */
  async getEncryptedBalance(owner: string, mint: Address): Promise<EncryptedBalance> {
    const own = owner === this.#cfg.signer.address || owner.replace(/^0x/, "").toLowerCase() === (await this.shieldedAddress());
    if (!own) {
      throw new NotImplementedAdapterError("getEncryptedBalance(other owner)", "decryption needs that owner's viewing key; only own wallet supported");
    }
    const sdk = await this.sdk();
    const wallet = await this.syncedWallet();
    const want = this.mintOrSol(sdk, mint);
    const bal = sdk.spr.getPrivateTokenBalances(wallet).find((b) => b.mint === want);
    return { mint, amount: (bal?.amount ?? 0n) as Amount, utxoCount: bal?.utxos.length ?? 0 };
  }
}

/** Retries transient network failures (2 retries, linear backoff). */
export async function withRetry<T>(fn: () => Promise<T>, rpcUrl = "", attempts = 3, delayMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransient(e) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw scrub(last, rpcUrl);
}

function isTransient(e: unknown): boolean {
  const m = String((e as Error)?.message ?? e);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|429|502|503|504|timeout/i.test(m);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Minimal base58 decode (32-byte Solana public keys). */
export function decodeBase58(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error("invalid base58");
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== "1") break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}
