// Pure Harvestia governance state machine (SPEC.md "Vote" / "Exit" / "Fees").
// No I/O, no clock reads: callers pass `now`. Mirrors the on-chain program logic.
import type { Campaign, Milestone, MilestoneStatus, TallyResult, VoteOutcome } from "@harvestia/sdk/types";

export const DAY_MS = 86_400_000;
export const VOTER_CAP_BPS = 1000; // a single voter counts for at most 10% of total weight
export const QUORUM_BPS = 2000; // 20% of total stake must participate
export const VOTE_WINDOW_MS = 7 * DAY_MS;
export const RESUBMIT_WINDOW_MS = 30 * DAY_MS;
export const EXIT_WINDOW_MS = 7 * DAY_MS;
export const QUORUM_EXTENSION_MS = 3 * DAY_MS; // first quorum failure -> extend the vote window ONCE by 3 days
export const MAX_QUORUM_FAILURES = 2; // second failure on the same vote -> reviewer decides
export const LOCKUP_MS = 365 * DAY_MS; // 12-month share lockup from raise close
export const SUCCESS_FEE_BPS = 500; // 5%
export const DEFAULT_UPFRONT_BPS = 2000;
export const DEFAULT_MIN_INVESTORS = 25;

export interface Ballot { choice: "yes" | "no"; weight: number }

/**
 * Weighted tally. Runs inside Arcium MPC in production.
 * - Quorum counts RAW (uncapped) stake that voted: participating * 10_000 >= totalStake * QUORUM_BPS.
 * - The 10% per-voter cap applies ONLY to the Yes/No split: Yes wins iff capped_yes > capped_no (tie = Rejected).
 */
export function tally(ballots: Ballot[], totalStake: number): TallyResult {
  if (totalStake <= 0) return { outcome: "QuorumFailed", turnout: 0, yesShare: 0 };
  const cap = (totalStake * VOTER_CAP_BPS) / 10_000;
  let participating = 0, yes = 0, no = 0;
  for (const b of ballots) {
    const w = Number.isFinite(b.weight) ? Math.max(0, b.weight) : 0;
    participating += w;
    const capped = Math.min(w, cap);
    if (b.choice === "yes") yes += capped; else no += capped;
  }
  const turnout = participating / totalStake;
  const counted = yes + no;
  const yesShare = counted > 0 ? yes / counted : 0;
  if (participating * 10_000 < totalStake * QUORUM_BPS) return { outcome: "QuorumFailed", turnout, yesShare };
  return { outcome: yes > no ? "Approved" : "Rejected", turnout, yesShare };
}

export interface RoundState { quorumFailures: number; appealToReviewer: boolean }

export interface TransitionResult {
  milestone: Milestone;
  campaignStatus: Campaign["status"];
  round: RoundState;
  /**
   * true on the FIRST quorum failure: the same vote window is extended once by
   * `extendVoteMs` (3 days); ballots cast so far are kept. Name kept for compatibility.
   */
  reopenVote: boolean;
  /** Milliseconds to add to the current vote window's end (0 unless reopenVote). */
  extendVoteMs: number;
  /** USDC released to founder by this transition. */
  releasedUsdc: number;
}

/** Apply a finalized vote outcome to a milestone. */
export function applyOutcome(
  campaign: Pick<Campaign, "status" | "milestones">,
  milestoneIndex: number,
  outcome: VoteOutcome,
  round: RoundState,
  now: number,
): TransitionResult {
  const m = campaign.milestones[milestoneIndex];
  if (!m) throw new RuleError("milestone not found");
  if (m.status !== "Voting") throw new RuleError(`milestone is ${m.status}, not Voting`);
  const next: Milestone = { ...m };
  const r = { ...round };
  let status = campaign.status;
  let reopenVote = false;
  let extendVoteMs = 0;
  let releasedUsdc = 0;

  if (outcome === "Approved") {
    next.status = "Released";
    releasedUsdc = m.releaseUsdc;
    const allDone = campaign.milestones.every((x, i) => (i === milestoneIndex ? true : x.status === "Released"));
    if (allDone) status = "Completed";
  } else if (outcome === "Rejected") {
    if (!m.resubmitUsed) {
      next.status = "Resubmitted";
      next.resubmitUsed = true;
      next.evidenceUri = null;
      next.deadline = new Date(now + RESUBMIT_WINDOW_MS).toISOString();
    } else {
      next.status = "Refunded";
      status = "Refunding";
    }
  } else {
    r.quorumFailures += 1;
    if (r.quorumFailures >= MAX_QUORUM_FAILURES) {
      r.appealToReviewer = true; // stays Voting until reviewer rules
    } else {
      reopenVote = true;
      extendVoteMs = QUORUM_EXTENSION_MS;
    }
  }
  return { milestone: next, campaignStatus: status, round: r, reopenVote, extendVoteMs, releasedUsdc };
}

/** Reviewer ruling after an appeal (quorum failed twice). */
export function applyReviewerRuling(campaign: Pick<Campaign, "status" | "milestones">, idx: number, approve: boolean, now: number) {
  return applyOutcome(campaign, idx, approve ? "Approved" : "Rejected", { quorumFailures: 0, appealToReviewer: false }, now);
}

export function canSubmitEvidence(m: Milestone, campaignStatus: Campaign["status"], now: number): string | null {
  if (campaignStatus !== "Active") return `campaign is ${campaignStatus}, not Active`;
  if (m.status !== "Pending" && m.status !== "Resubmitted") return `milestone is ${m.status}`;
  // Half-open window [start, start + 30d): closed AT the deadline.
  if (m.status === "Resubmitted" && now >= Date.parse(m.deadline)) return "resubmission window (30 days) has closed";
  return null;
}

/** Milestones must be voted in order. */
export function previousReleased(c: Pick<Campaign, "milestones">, idx: number): boolean {
  return c.milestones.slice(0, idx).every((m) => m.status === "Released");
}

/** Vote window is [opensAt, closesAt); finalization is allowed from closesAt on. */
export function canFinalize(closesAt: number, now: number, force = false): string | null {
  if (!force && now < closesAt) return "vote window (7 days) still open";
  return null;
}

export function isVoteOpen(opensAt: number, closesAt: number, now: number): boolean {
  return now >= opensAt && now < closesAt;
}

/** Missed deadline with no evidence -> refund remaining. */
export function isMilestoneMissed(m: Milestone, now: number): boolean {
  return (m.status === "Pending" || m.status === "Resubmitted") && now >= Date.parse(m.deadline);
}

/** Outcome at raise deadline. */
export function settleRaise(c: Pick<Campaign, "raisedUsdc" | "goalUsdc" | "minInvestors">, investorCount: number): "Active" | "Failed" {
  return c.raisedUsdc >= c.goalUsdc && investorCount >= c.minInvestors ? "Active" : "Failed";
}

export function upfrontUsdc(c: Pick<Campaign, "goalUsdc" | "upfrontBps">): number {
  return Math.floor((c.goalUsdc * c.upfrontBps) / 10_000);
}

export function successFeeUsdc(raisedUsdc: number): number {
  return Math.floor((raisedUsdc * SUCCESS_FEE_BPS) / 10_000);
}

/**
 * Founder's net upfront payout at raise close: upfront tranche minus the 5% success fee
 * on the TOTAL raise. The fee is taken only from the upfront tranche.
 */
export function founderUpfrontUsdc(c: Pick<Campaign, "raisedUsdc" | "goalUsdc" | "upfrontBps">): number {
  return Math.max(0, upfrontUsdc(c) - successFeeUsdc(c.raisedUsdc));
}

/** The upfront tranche must be able to cover the success fee. */
export function upfrontCoversFee(c: Pick<Campaign, "goalUsdc" | "upfrontBps">, raisedUsdc = c.goalUsdc): boolean {
  return upfrontUsdc(c) >= successFeeUsdc(raisedUsdc);
}

/** Funds still locked in the safe (not yet released). Never reduced by the fee; refunds use this full amount. */
export function lockedUsdc(c: Pick<Campaign, "raisedUsdc" | "goalUsdc" | "upfrontBps" | "milestones">): number {
  const released = c.milestones.filter((m) => m.status === "Released").reduce((s, m) => s + m.releaseUsdc, 0);
  return Math.max(0, c.raisedUsdc - upfrontUsdc(c) - released);
}

/** 12-month lockup end (ms) from the raise close time. */
export function lockupEndsAt(raiseClosedAt: number): number {
  return raiseClosedAt + LOCKUP_MS;
}

/**
 * Share transfer/resale gate. Lockup is half-open [close, close + 365d): transfers are
 * blocked while now < lockupEndsAt; afterwards both parties must be allowlisted (KYC'd).
 */
export function isTransferAllowed(now: number, lockupEnds: number, senderAllowlisted: boolean, receiverAllowlisted: boolean): boolean {
  return now >= lockupEnds && senderAllowlisted && receiverAllowlisted;
}

/** Pro-rata refund/exit share. Runs in Arcium MPC in production (stake is hidden). */
export function proRataShare(stake: number, totalStake: number, locked: number): number {
  if (totalStake <= 0) return 0;
  return Math.floor((stake * locked) / totalStake);
}

/** Exit allowed only within [finalizedAt, finalizedAt + 7d) (end exclusive). */
export function canExit(lastVoteFinalizedAt: number | null, now: number): boolean {
  return lastVoteFinalizedAt !== null && now >= lastVoteFinalizedAt && now < lastVoteFinalizedAt + EXIT_WINDOW_MS;
}

export function milestoneSumValid(c: Pick<Campaign, "goalUsdc" | "upfrontBps" | "milestones">): boolean {
  const sum = c.milestones.reduce((s, m) => s + m.releaseUsdc, 0);
  return sum + upfrontUsdc(c) <= c.goalUsdc;
}

export class RuleError extends Error {}

export const TERMINAL_MILESTONE: MilestoneStatus[] = ["Released", "Refunded"];
