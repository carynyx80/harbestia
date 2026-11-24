// MockPrivacy: in-memory stand-in for Rings + Arcium + ZK for local dev/tests.
// INSECURE BY DESIGN: "ciphertexts" are plaintext-encoded, "proofs" are hashes.
// It exists so web/ and services/ can run the full flow without devnet.
import { createHash, randomBytes } from "node:crypto";
import type { Address, Amount, Hex } from "./types.js";
import type {
  EncryptedBalance,
  PrivateTransferParams,
  RingsAdapter,
  ShieldParams,
  TxResult,
  UnshieldParams,
} from "./rings.js";
import type { ArciumVoteClient, EncryptedAmount, EncryptedBallot, QueuedComputation } from "./arcium.js";
import type { CircuitName, ZkProof, ZkProver } from "./zk.js";
import { castWeightedVote, emptyTally, prorataRefund, weightedVoteTally, type Tally, type TallyResult } from "./math.js";

const sha = (...parts: unknown[]): Hex =>
  createHash("sha256").update(parts.map((p) => String(p)).join("|")).digest("hex");

export class MockPrivacy implements RingsAdapter, ArciumVoteClient, ZkProver {
  readonly kind = "mock";
  /** Public token balances: `${wallet}:${mint}` */
  readonly publicBalances = new Map<string, bigint>();
  /** Shielded balances: `${shieldedOwner}:${mint}` */
  private readonly shielded = new Map<string, bigint>();
  /** Enc<Mxe> stake per position account. */
  private readonly positions = new Map<string, { campaignId: string; stake: bigint }>();
  private readonly raised = new Map<string, bigint>();
  private readonly tallies = new Map<string, Tally>();
  private readonly nullifiers = new Set<Hex>();
  private readonly pending = new Map<string, TallyResult>();
  private slot = 0n;

  /** The acting wallet; in the real adapter this is the signer. */
  constructor(public actor: Address = "mock-wallet") {}

  private tx(): TxResult {
    this.slot += 1n;
    return { signature: randomBytes(32).toString("hex"), slot: this.slot };
  }
  private static key(a: string, m: string) {
    return `${a}:${m}`;
  }
  private add(map: Map<string, bigint>, k: string, d: bigint) {
    const v = (map.get(k) ?? 0n) + d;
    if (v < 0n) throw new Error("insufficient balance");
    map.set(k, v);
  }

  /** Test helper: mint public tokens. */
  fund(wallet: Address, mint: Address, amount: Amount) {
    this.add(this.publicBalances, MockPrivacy.key(wallet, mint), amount);
  }
  shieldedAddressOf(wallet: Address): string {
    return `shielded:${sha("addr", wallet).slice(0, 32)}`;
  }

  // ------------------------------------------------------------- Rings
  async shield(p: ShieldParams): Promise<TxResult> {
    if (p.amount <= 0n) throw new Error("amount must be positive");
    this.add(this.publicBalances, MockPrivacy.key(p.from, p.mint), -p.amount);
    const to = p.recipientShieldedAddress ?? this.shieldedAddressOf(p.from);
    this.add(this.shielded, MockPrivacy.key(to, p.mint), p.amount);
    return this.tx();
  }
  async privateTransfer(p: PrivateTransferParams): Promise<TxResult> {
    if (p.amount <= 0n) throw new Error("amount must be positive");
    const from = this.shieldedAddressOf(this.actor);
    this.add(this.shielded, MockPrivacy.key(from, p.mint), -p.amount);
    this.add(this.shielded, MockPrivacy.key(p.toShieldedAddress, p.mint), p.amount);
    return this.tx();
  }
  async unshield(p: UnshieldParams): Promise<TxResult> {
    const from = this.shieldedAddressOf(this.actor);
    this.add(this.shielded, MockPrivacy.key(from, p.mint), -p.amount);
    this.add(this.publicBalances, MockPrivacy.key(p.to, p.mint), p.amount);
    return this.tx();
  }
  async getEncryptedBalance(owner: string, mint: Address): Promise<EncryptedBalance> {
    const amount = this.shielded.get(MockPrivacy.key(owner, mint)) ?? 0n;
    return { mint, amount, utxoCount: amount > 0n ? 1 : 0 };
  }

  // ------------------------------------------------------------ Arcium
  async encryptBallot(voteYes: boolean): Promise<EncryptedBallot> {
    return { clientPublicKey: "mock", nonce: randomBytes(16).toString("hex"), ciphertexts: [voteYes ? "01" : "00"] };
  }
  async encryptAmount(amount: Amount): Promise<EncryptedAmount> {
    return { clientPublicKey: "mock", nonce: randomBytes(16).toString("hex"), ciphertext: amount.toString(16) };
  }
  /** record_contribution: returns a position ref holding the hidden stake. */
  async recordContribution(campaignId: string, amount: EncryptedAmount): Promise<string> {
    const stake = BigInt("0x" + amount.ciphertext);
    const ref = `position:${sha(campaignId, amount.nonce).slice(0, 32)}`;
    this.positions.set(ref, { campaignId, stake });
    this.raised.set(campaignId, (this.raised.get(campaignId) ?? 0n) + stake);
    return ref;
  }
  /** sum_raised: reveal total only. */
  async sumRaised(campaignId: string): Promise<bigint> {
    return this.raised.get(campaignId) ?? 0n;
  }
  async queueVote(
    campaignId: string,
    milestoneIndex: number,
    positionRef: string,
    ballot: EncryptedBallot,
    nullifier: Hex,
  ): Promise<QueuedComputation> {
    const pos = this.positions.get(positionRef);
    if (!pos || pos.campaignId !== campaignId) throw new Error("unknown position");
    if (this.nullifiers.has(nullifier)) throw new Error("nullifier already used");
    this.nullifiers.add(nullifier);
    const k = `${campaignId}:${milestoneIndex}`;
    const total = this.raised.get(campaignId) ?? 0n;
    this.tallies.set(k, castWeightedVote(this.tallies.get(k) ?? emptyTally(), pos.stake, ballot.ciphertexts[0] === "01", total));
    return { computationOffset: k, ...this.tx() };
  }
  async queueTally(campaignId: string, milestoneIndex: number): Promise<QueuedComputation> {
    const k = `${campaignId}:${milestoneIndex}`;
    const q = { computationOffset: `${k}:tally`, ...this.tx() };
    this.pending.set(q.computationOffset, weightedVoteTally(this.tallies.get(k) ?? emptyTally(), this.raised.get(campaignId) ?? 0n));
    return q;
  }
  async awaitTally(q: QueuedComputation): Promise<TallyResult> {
    const r = this.pending.get(q.computationOffset);
    if (!r) throw new Error("no such computation");
    return r;
  }
  /** prorata_refund: amount visible only to the position owner (here: returned). */
  async prorataRefund(positionRef: string, remainingLocked: bigint): Promise<bigint> {
    const pos = this.positions.get(positionRef);
    if (!pos) throw new Error("unknown position");
    return prorataRefund(pos.stake, remainingLocked, this.raised.get(pos.campaignId) ?? 0n);
  }

  // ---------------------------------------------------------------- ZK
  async prove(circuit: CircuitName, inputs: Record<string, unknown>): Promise<ZkProof> {
    const secret = String(inputs.secret ?? "");
    const scope = [inputs.campaignId, inputs.milestoneIndex, inputs.round, inputs.epoch].map((x) => String(x ?? "")).join(",");
    const nullifier = sha("nullifier", circuit, secret, scope);
    const publicInputs = [sha("pub", circuit, scope), nullifier];
    return { circuit, proof: sha("proof", circuit, ...publicInputs), publicInputs };
  }
  async verify(p: ZkProof): Promise<boolean> {
    return p.proof === sha("proof", p.circuit, ...p.publicInputs);
  }
}
