// Pluggable privacy backends. The API layer only ever sees ciphertexts, commitments,
// nullifiers and proofs; plaintext amounts/votes exist only inside the provider
// (Arcium MXE in production; this in-process mock locally).
import { createHash } from "node:crypto";
import { tally, type Ballot } from "./rules.js";
import type { TallyResult } from "@harvestia/sdk/types";

/** Opaque encrypted ballot as stored by the API. */
export interface SealedBallot { nullifier: string; encryptedVote: string }

export interface TallyProvider {
  readonly name: string;
  /** Tally encrypted ballots weighted by hidden stake; reveals only outcome + aggregates. */
  tally(ballots: SealedBallot[], totalStake: number): Promise<TallyResult>;
}

export interface SumProvider {
  readonly name: string;
  /** Add an encrypted amount into a campaign's encrypted running sum; returns ONLY the revealed public total. */
  addToSum(campaignId: string, ciphertext: string, commitment: string): Promise<{ amountRevealedTotal: number }>;
  seed(campaignId: string, total: number): void;
}

export type ProofKind = "invest" | "vote" | "payoutClaim" | "tokenClaim";

export interface ProofVerifier {
  verify(kind: ProofKind, proof: string, publicInputs: Record<string, string>): Promise<boolean>;
}

// ---------------- Mock implementations ----------------
// WARNING: MOCK PRIVACY. "mockenc1:" is plain base64 JSON, NOT encryption. The prefix is kept
// only for wire compatibility with the SDK; anyone can read amounts and votes.
const PREFIX = "mockenc1:";
/** Decryption happens ONLY inside the mock MPC "cluster". */
function mpcDecrypt<T>(ciphertext: string): T {
  if (!ciphertext.startsWith(PREFIX)) throw new Error("ciphertext not addressed to mock Arcium cluster");
  return JSON.parse(Buffer.from(ciphertext.slice(PREFIX.length), "base64").toString("utf8")) as T;
}

export class MockArciumSum implements SumProvider {
  readonly name = "mock-arcium-sum";
  private totals = new Map<string, number>();
  seed(campaignId: string, total: number) { this.totals.set(campaignId, total); }
  async addToSum(campaignId: string, ciphertext: string, commitment: string) {
    const { amountUsdc, salt } = mpcDecrypt<{ amountUsdc: number; salt: string }>(ciphertext);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) throw new Error("invalid encrypted amount");
    const expected = createHash("sha256").update(`${amountUsdc}|${salt}`).digest("hex");
    if (expected !== commitment) throw new Error("commitment does not open to ciphertext");
    const t = (this.totals.get(campaignId) ?? 0) + amountUsdc;
    this.totals.set(campaignId, t);
    return { amountRevealedTotal: t };
  }
}

/**
 * MOCK: ballots are base64 JSON, NOT encrypted. Applies the canonical rules via rules.tally:
 * quorum on RAW participating stake (>= 20% of total invested stake); 10% per-voter cap only
 * on the Yes/No split (Yes iff capped_yes > capped_no). Malformed ballots are rejected.
 */
export class MockArciumTally implements TallyProvider {
  readonly name = "mock-arcium-tally";
  async tally(ballots: SealedBallot[], totalStake: number) {
    const plain: Ballot[] = ballots.map((b) => {
      const v = mpcDecrypt<Ballot>(b.encryptedVote);
      if ((v?.choice !== "yes" && v?.choice !== "no") || typeof v.weight !== "number" || !Number.isFinite(v.weight) || v.weight < 0) {
        throw new Error("malformed ballot");
      }
      return { choice: v.choice, weight: v.weight };
    });
    return tally(plain, totalStake);
  }
}

export class MockProofVerifier implements ProofVerifier {
  async verify(_kind: ProofKind, proof: string) {
    return typeof proof === "string" && proof.startsWith("mockproof:") && proof.length >= 14;
  }
}

/**
 * Private claim math (Arcium MPC in production): reads a position's hidden stake from its
 * investment ciphertext and returns the claim amount encrypted for the investor.
 */
export interface ClaimProvider {
  readonly name: string;
  /** Hidden stake (shares) of a position. Never returned to API callers. */
  sharesOf(investCiphertext: string): Promise<number>;
  /** Encrypt a claim amount for the investor. */
  sealClaim(amount: number, unit: string): Promise<string>;
}

export class MockArciumClaims implements ClaimProvider {
  readonly name = "mock-arcium-claims";
  async sharesOf(investCiphertext: string) {
    const { amountUsdc } = mpcDecrypt<{ amountUsdc: number }>(investCiphertext);
    if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) throw new Error("invalid position");
    return Math.floor(amountUsdc);
  }
  async sealClaim(amount: number, unit: string) {
    return PREFIX + Buffer.from(JSON.stringify({ amount, unit }), "utf8").toString("base64");
  }
}
