import { test } from "node:test";
import assert from "node:assert/strict";
import * as R from "./rules.js";
import type { Milestone } from "@harvestia/sdk/types";

const ms = (over: Partial<Milestone> = {}): Milestone => ({
  index: 0, title: "t", description: "d", releaseUsdc: 150_000, deadline: new Date(0).toISOString(),
  status: "Voting", evidenceUri: "ipfs://x", resubmitUsed: false, ...over,
});
const round = { quorumFailures: 0, appealToReviewer: false };

test("tally: quorum 20% of stake required", () => {
  assert.equal(R.tally([{ choice: "yes", weight: 19 }], 100).outcome, "QuorumFailed");
  assert.equal(R.tally([{ choice: "yes", weight: 10 }, { choice: "yes", weight: 10 }], 100).outcome, "Approved");
});

test("tally: whale capped at 10% of total weight", () => {
  // whale 40 yes (capped to 10), three voters 6 no each = 18 no -> Rejected
  const r = R.tally([{ choice: "yes", weight: 40 }, { choice: "no", weight: 6 }, { choice: "no", weight: 6 }, { choice: "no", weight: 6 }], 100);
  assert.equal(r.outcome, "Rejected");
  assert.ok(Math.abs(r.turnout - 0.58) < 1e-9);
});

test("tally: tie is not approval", () => {
  assert.equal(R.tally([{ choice: "yes", weight: 10 }, { choice: "no", weight: 10 }], 100).outcome, "Rejected");
});

test("approve releases milestone; last one completes campaign", () => {
  const c = { status: "Active" as const, milestones: [ms({ status: "Released" }), ms({ index: 1 })] };
  const t = R.applyOutcome(c, 1, "Approved", round, 0);
  assert.equal(t.milestone.status, "Released");
  assert.equal(t.campaignStatus, "Completed");
  assert.equal(t.releasedUsdc, 150_000);
});

test("first No -> Resubmitted with 30-day window; second No -> Refunded + Refunding", () => {
  const now = Date.parse("2026-01-01");
  const c = { status: "Active" as const, milestones: [ms()] };
  const t1 = R.applyOutcome(c, 0, "Rejected", round, now);
  assert.equal(t1.milestone.status, "Resubmitted");
  assert.equal(t1.milestone.resubmitUsed, true);
  assert.equal(Date.parse(t1.milestone.deadline), now + 30 * R.DAY_MS);
  assert.equal(t1.campaignStatus, "Active");
  const c2 = { status: "Active" as const, milestones: [{ ...t1.milestone, status: "Voting" as const }] };
  const t2 = R.applyOutcome(c2, 0, "Rejected", round, now);
  assert.equal(t2.milestone.status, "Refunded");
  assert.equal(t2.campaignStatus, "Refunding");
});

test("quorum fails once -> extend 3 days; twice -> appeal to reviewer", () => {
  const c = { status: "Active" as const, milestones: [ms()] };
  const t1 = R.applyOutcome(c, 0, "QuorumFailed", round, 0);
  assert.equal(t1.reopenVote, true);
  assert.equal(t1.extendVoteMs, 3 * R.DAY_MS);
  assert.equal(t1.milestone.status, "Voting");
  const t2 = R.applyOutcome(c, 0, "QuorumFailed", t1.round, 0);
  assert.equal(t2.reopenVote, false);
  assert.equal(t2.round.appealToReviewer, true);
  assert.equal(t2.extendVoteMs, 0);
  assert.equal(R.applyReviewerRuling(c, 0, true, 0).milestone.status, "Released");
});

test("cannot finalize non-voting milestone", () => {
  assert.throws(() => R.applyOutcome({ status: "Active", milestones: [ms({ status: "Pending" })] }, 0, "Approved", round, 0), R.RuleError);
});

test("evidence gating", () => {
  assert.equal(R.canSubmitEvidence(ms({ status: "Pending" }), "Active", 0), null);
  assert.match(R.canSubmitEvidence(ms({ status: "Pending" }), "Raising", 0)!, /not Active/);
  assert.match(R.canSubmitEvidence(ms({ status: "Resubmitted", deadline: new Date(10).toISOString() }), "Active", 11)!, /closed/);
  assert.equal(R.canSubmitEvidence(ms({ status: "Resubmitted", deadline: new Date(10).toISOString() }), "Active", 9), null);
});

test("finalize only after 7-day window unless forced", () => {
  assert.ok(R.canFinalize(1000, 999));
  assert.equal(R.canFinalize(1000, 1000), null);
  assert.equal(R.canFinalize(1000, 0, true), null);
});

test("exit window is 7 days after a vote", () => {
  assert.equal(R.canExit(null, 0), false);
  assert.equal(R.canExit(0, 7 * R.DAY_MS - 1), true);
  assert.equal(R.canExit(0, 7 * R.DAY_MS), false);
});

test("money math: FreshBox upfront, fee, locked, pro-rata", () => {
  const c = { goalUsdc: 500_000, raisedUsdc: 500_000, upfrontBps: 2000, milestones: [ms({ status: "Released" }), ms(), ms({ releaseUsdc: 100_000 })] };
  assert.equal(R.upfrontUsdc(c), 100_000);
  assert.equal(R.successFeeUsdc(500_000), 25_000);
  assert.equal(R.lockedUsdc(c), 500_000 - 100_000 - 150_000); // fee NOT taken from locked funds
  assert.equal(R.founderUpfrontUsdc(c), 100_000 - 25_000); // fee taken from upfront tranche
  assert.equal(R.proRataShare(10, 100, 225_000), 22_500);
  assert.equal(R.milestoneSumValid(c), true);
});

test("raise settles Active only with goal and min investors", () => {
  assert.equal(R.settleRaise({ raisedUsdc: 500_000, goalUsdc: 500_000, minInvestors: 25 }, 25), "Active");
  assert.equal(R.settleRaise({ raisedUsdc: 500_000, goalUsdc: 500_000, minInvestors: 25 }, 24), "Failed");
  assert.equal(R.settleRaise({ raisedUsdc: 499_999, goalUsdc: 500_000, minInvestors: 25 }, 99), "Failed");
});

// ---------------- Boundary tests for canonical rules ----------------

test("rule 1+2: quorum boundary at exactly 20% of RAW stake", () => {
  // 1999 / 10000 = 19.99% -> fail; 2000 -> pass
  assert.equal(R.tally([{ choice: "yes", weight: 1999 }], 10_000).outcome, "QuorumFailed");
  assert.equal(R.tally([{ choice: "yes", weight: 2000 }], 10_000).outcome, "Approved");
  // one whale with 20% raw stake meets quorum even though capped weight is only 10%
  const r = R.tally([{ choice: "yes", weight: 2000 }], 10_000);
  assert.equal(r.outcome, "Approved");
  assert.equal(r.turnout, 0.2);
  assert.equal(R.tally([], 10_000).outcome, "QuorumFailed");
  assert.equal(R.tally([{ choice: "yes", weight: 5 }], 0).outcome, "QuorumFailed");
});

test("rule 2: 10% cap only on Yes/No split; strict capped_yes > capped_no", () => {
  // yes whale 50 capped to 10 vs no 10 -> tie -> Rejected
  assert.equal(R.tally([{ choice: "yes", weight: 50 }, { choice: "no", weight: 10 }], 100).outcome, "Rejected");
  // yes 10 (at cap) + 1 vs no whale 80 capped to 10 -> 11 > 10 -> Approved
  assert.equal(R.tally([{ choice: "yes", weight: 10 }, { choice: "yes", weight: 1 }, { choice: "no", weight: 80 }], 100).outcome, "Approved");
  // weight exactly at cap is not reduced
  const r = R.tally([{ choice: "yes", weight: 10 }, { choice: "no", weight: 9 }, { choice: "no", weight: 1 }], 100);
  assert.equal(r.outcome, "Rejected"); // 10 vs 10
  // turnout uses raw weight
  assert.equal(R.tally([{ choice: "no", weight: 90 }], 100).turnout, 0.9);
});

test("rule 1: second quorum failure goes to reviewer, no further extension", () => {
  const c = { status: "Active" as const, milestones: [ms()] };
  const t2 = R.applyOutcome(c, 0, "QuorumFailed", { quorumFailures: 1, appealToReviewer: false }, 0);
  assert.equal(t2.reopenVote, false);
  assert.equal(t2.round.appealToReviewer, true);
  assert.equal(t2.milestone.status, "Voting");
});

test("rule 3: fee from upfront only; refund uses full locked amount", () => {
  const c = { goalUsdc: 500_000, raisedUsdc: 500_000, upfrontBps: 2000, milestones: [ms(), ms(), ms({ releaseUsdc: 100_000 })] };
  assert.equal(R.founderUpfrontUsdc(c), 75_000);
  assert.equal(R.lockedUsdc(c), 400_000);
  assert.equal(R.proRataShare(50_000, 500_000, R.lockedUsdc(c)), 40_000);
  // boundary: upfront exactly equal to fee -> founder gets 0, still valid
  assert.equal(R.upfrontCoversFee({ goalUsdc: 100_000, upfrontBps: 500 }), true);
  assert.equal(R.founderUpfrontUsdc({ goalUsdc: 100_000, raisedUsdc: 100_000, upfrontBps: 500 }), 0);
  assert.equal(R.upfrontCoversFee({ goalUsdc: 100_000, upfrontBps: 499 }), false);
});

test("rule 4: 12-month lockup boundary and allowlists", () => {
  const close = Date.parse("2026-01-01T00:00:00Z");
  const end = R.lockupEndsAt(close);
  assert.equal(end, close + 365 * R.DAY_MS);
  assert.equal(R.isTransferAllowed(end - 1, end, true, true), false);
  assert.equal(R.isTransferAllowed(end, end, true, true), true);
  assert.equal(R.isTransferAllowed(end, end, false, true), false);
  assert.equal(R.isTransferAllowed(end, end, true, false), false);
});

test("rule 5: vote window [open, open+7d) end exclusive", () => {
  const open = 1_000, close = open + R.VOTE_WINDOW_MS;
  assert.equal(R.isVoteOpen(open, close, open - 1), false);
  assert.equal(R.isVoteOpen(open, close, open), true);
  assert.equal(R.isVoteOpen(open, close, close - 1), true);
  assert.equal(R.isVoteOpen(open, close, close), false);
  assert.ok(R.canFinalize(close, close - 1));
  assert.equal(R.canFinalize(close, close), null);
});

test("rule 5: exit window [finalized, finalized+7d) end exclusive", () => {
  const f = 5_000;
  assert.equal(R.canExit(f, f - 1), false);
  assert.equal(R.canExit(f, f), true);
  assert.equal(R.canExit(f, f + R.EXIT_WINDOW_MS - 1), true);
  assert.equal(R.canExit(f, f + R.EXIT_WINDOW_MS), false);
});

test("rule 5: resubmission window [rejected, rejected+30d) end exclusive", () => {
  const now = Date.parse("2026-03-01T00:00:00Z");
  const t = R.applyOutcome({ status: "Active", milestones: [ms()] }, 0, "Rejected", round, now);
  const end = Date.parse(t.milestone.deadline);
  assert.equal(end, now + R.RESUBMIT_WINDOW_MS);
  assert.equal(R.canSubmitEvidence(t.milestone, "Active", end - 1), null);
  assert.match(R.canSubmitEvidence(t.milestone, "Active", end)!, /closed/);
  assert.equal(R.isMilestoneMissed(t.milestone, end - 1), false);
  assert.equal(R.isMilestoneMissed(t.milestone, end), true);
});

// ================= Offerings (v2) =================
const D = R.DAY_MS;

test("payout amount = basis x shareBps, floored to the cent", () => {
  assert.equal(R.payoutAmountUsdc(12_500, 800), 1000);
  assert.equal(R.payoutAmountUsdc(10_000.37, 1200), 1200.04);
});

test("payout periods: due date = period end + 15 days, after startsAfterDays grace", () => {
  const p1 = R.payoutPeriod(0, 90, 1);
  assert.equal(p1.start, 90 * D);
  assert.equal(p1.end, 120 * D);
  assert.equal(p1.due, 135 * D);
  assert.equal(R.payoutPeriod(0, 90, 2).due, 165 * D);
  assert.equal(R.endedPeriods(0, 90, 120 * D - 1), 0);
  assert.equal(R.endedPeriods(0, 90, 120 * D), 1);
});

test("period status: ON_TIME at due boundary, LATE after; unpaid DUE then LATE", () => {
  assert.equal(R.periodStatus(135 * D, 135 * D, 200 * D), "ON_TIME");
  assert.equal(R.periodStatus(135 * D + 1, 135 * D, 200 * D), "LATE");
  assert.equal(R.periodStatus(null, 135 * D, 135 * D), "DUE");
  assert.equal(R.periodStatus(null, 135 * D, 135 * D + 1), "LATE");
});

test("3 consecutive LATE -> payoutDefault; ON_TIME resets the streak", () => {
  assert.equal(R.isPayoutDefault(["LATE", "LATE", "ON_TIME", "LATE", "LATE"]), false);
  assert.equal(R.isPayoutDefault(["ON_TIME", "LATE", "LATE", "LATE", "ON_TIME"]), true); // sticky
  assert.equal(R.consecutiveLate(["ON_TIME", "LATE", "LATE", "DUE"]), 2);
  const st = R.computePayoutStatus(0, 90, new Map(), 220 * D); // P1..P3 ended (ends 120,150,180), all past due by 220
  assert.equal(st.consecutiveLate, 3);
  assert.equal(st.defaulted, true);
  assert.equal(st.lastPaidPeriod, null);
  assert.equal(st.nextDueDate, new Date(135 * D).toISOString());
});

test("payout status with on-time deposits", () => {
  const st = R.computePayoutStatus(0, 90, new Map([[1, 125 * D], [2, 155 * D]]), 160 * D);
  assert.deepEqual(st.statuses, ["ON_TIME", "ON_TIME"]);
  assert.equal(st.lastPaidPeriod, 2);
  assert.equal(st.nextDueDate, new Date(195 * D).toISOString());
  assert.equal(st.defaulted, false);
});

test("accumulator: pro-rata payouts, debt prevents double claim, late entrant gets nothing past", () => {
  const total = 1000n;
  let acc = R.accruePayout(0n, R.toMicro(100), total); // 100 USDC over 1000 shares
  assert.equal(R.claimablePayout(250n, acc, 0n), R.toMicro(25));
  const debt = R.payoutDebtFor(250n, acc); // after claim
  assert.equal(R.claimablePayout(250n, acc, debt), 0n);
  acc = R.accruePayout(acc, R.toMicro(40), total);
  assert.equal(R.claimablePayout(250n, acc, debt), R.toMicro(10));
  assert.equal(R.claimablePayout(750n, acc, 0n), R.toMicro(105));
  assert.throws(() => R.accruePayout(0n, 1n, 0n), R.RuleError);
});

test("token vesting: nothing before cliff, linear after, capped at 1", () => {
  const M = R.MONTH_MS;
  const v = { cliffMonths: 3, months: 12 };
  assert.equal(R.vestedFraction(null, 10 * M, v), 0);
  assert.equal(R.vestedFraction(0, 3 * M - 1, v), 0);
  assert.equal(R.vestedFraction(0, 3 * M, v), 0.25);
  assert.equal(R.vestedFraction(0, 6 * M, v), 0.5);
  assert.equal(R.vestedFraction(0, 24 * M, v), 1);
  assert.equal(R.vestedFraction(0, 0, { cliffMonths: 0, months: 0 }), 1);
  const alloc = R.investorTokenAllocation(1_000_000_000, 2000);
  assert.equal(alloc, 200_000_000);
  assert.equal(R.claimableTokens(alloc, 25_000, 250_000, 0.5, 0), 10_000_000);
  assert.equal(R.claimableTokens(alloc, 25_000, 250_000, 0.5, 10_000_000), 0);
});

test("tokenOverdue = not launched by target + 180 days", () => {
  assert.equal(R.isTokenOverdue(0, false, 180 * D - 1), false);
  assert.equal(R.isTokenOverdue(0, false, 180 * D), true);
  assert.equal(R.isTokenOverdue(0, true, 400 * D), false);
  assert.deepEqual(R.computeTokenStatus(0, { mint: "m", launchedAt: 5 }, 400 * D), { launched: true, mint: "m", overdue: false });
});
