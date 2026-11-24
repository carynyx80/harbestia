import type { Amount, Hex } from "./types.js";
import { NotImplementedAdapterError } from "./types.js";
import type { TallyResult } from "./math.js";

/** A ballot encrypted for the MXE (Enc<Shared, Ballot> in Arcis). */
export interface EncryptedBallot {
  /** Client x25519 public key (MXE derives the shared secret from it). */
  clientPublicKey: Hex;
  nonce: Hex;
  /** Rescue ciphertexts, one 32-byte element per field of the struct. */
  ciphertexts: Hex[];
}

export interface EncryptedAmount {
  clientPublicKey: Hex;
  nonce: Hex;
  ciphertext: Hex;
}

export interface QueuedComputation {
  computationOffset: string;
  signature: string;
}

export interface ArciumVoteClient {
  readonly kind: string;
  /** Encrypt vote choice for `cast_weighted_vote`. Stake is NOT sent: the MXE reads the investor's Enc<Mxe> stake. */
  encryptBallot(voteYes: boolean): Promise<EncryptedBallot>;
  /** Encrypt a contribution amount for `record_contribution`. */
  encryptAmount(amount: Amount): Promise<EncryptedAmount>;
  /**
   * Queue cast_weighted_vote for (campaign, milestone). `positionRef` is the on-chain
   * position account holding the investor's Enc<Mxe> stake; `nullifier` comes from the
   * vote_nullifier proof and is rejected if seen before.
   */
  queueVote(
    campaignId: string,
    milestoneIndex: number,
    positionRef: string,
    ballot: EncryptedBallot,
    nullifier: Hex,
  ): Promise<QueuedComputation>;
  /** Queue weighted_vote_tally (reveal). */
  queueTally(campaignId: string, milestoneIndex: number): Promise<QueuedComputation>;
  /** Wait for the callback and return the revealed result. */
  awaitTally(q: QueuedComputation): Promise<TallyResult>;
}

/**
 * Injected pieces of `@arcium-hq/client` (documented at
 * https://docs.arcium.com/developers/js-client-library/encryption.md):
 * x25519.utils.randomSecretKey, x25519.getPublicKey, x25519.getSharedSecret,
 * new RescueCipher(sharedSecret).encrypt(plaintexts: bigint[], nonce: Uint8Array).
 */
export interface ArciumClientDeps {
  x25519: {
    utils: { randomSecretKey(): Uint8Array };
    getPublicKey(sk: Uint8Array): Uint8Array;
    getSharedSecret(sk: Uint8Array, pk: Uint8Array): Uint8Array;
  };
  RescueCipher: new (sharedSecret: Uint8Array) => {
    encrypt(plaintexts: bigint[], nonce: Uint8Array): number[][] | Uint8Array[];
    decrypt(ciphertexts: unknown, nonce: Uint8Array): bigint[];
  };
  randomBytes(n: number): Uint8Array;
  /** Result of getMXEPublicKey(WithRetry)(provider, programId). */
  mxePublicKey: Uint8Array;
}

const hex = (b: ArrayLike<number>): Hex => Buffer.from(Array.from(b)).toString("hex");

/** Implementation sketch: encryption is real (given deps); queue/await need the chain program. */
export class ArciumMxeVoteClient implements ArciumVoteClient {
  readonly kind = "arcium-mxe";
  constructor(private readonly deps: ArciumClientDeps) {}

  private encrypt(values: bigint[]) {
    const sk = this.deps.x25519.utils.randomSecretKey();
    const pk = this.deps.x25519.getPublicKey(sk);
    const shared = this.deps.x25519.getSharedSecret(sk, this.deps.mxePublicKey);
    const cipher = new this.deps.RescueCipher(shared);
    const nonce = this.deps.randomBytes(16);
    const cts = cipher.encrypt(values, nonce) as ArrayLike<number>[];
    return { clientPublicKey: hex(pk), nonce: hex(nonce), ciphertexts: cts.map(hex) };
  }

  async encryptBallot(voteYes: boolean): Promise<EncryptedBallot> {
    return this.encrypt([voteYes ? 1n : 0n]);
  }

  async encryptAmount(amount: Amount): Promise<EncryptedAmount> {
    const e = this.encrypt([amount]);
    return { clientPublicKey: e.clientPublicKey, nonce: e.nonce, ciphertext: e.ciphertexts[0]! };
  }

  async queueVote(): Promise<QueuedComputation> {
    throw new NotImplementedAdapterError("queueVote", "needs harvestia Anchor program queue_computation ix (chain agent) + comp-def offsets");
  }
  async queueTally(): Promise<QueuedComputation> {
    throw new NotImplementedAdapterError("queueTally", "needs harvestia Anchor program queue_computation ix");
  }
  async awaitTally(): Promise<TallyResult> {
    throw new NotImplementedAdapterError("awaitTally", "await finalization + parse callback event; API name unverified (see RESEARCH.md)");
  }
}
