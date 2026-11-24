// Mirrors privacy/arcium/reference/src/lib.rs exactly (bigint, floor division).
export const BPS = 10_000n;
export const VOTER_CAP_BPS = 1_000n; // 10%
export const QUORUM_BPS = 2_000n; // 20%

export interface Tally {
  yesWeight: bigint;
  noWeight: bigint;
  turnoutStake: bigint;
}

export interface TallyResult {
  yesBps: number;
  noBps: number;
  turnoutBps: number;
  quorumMet: boolean;
}

export const emptyTally = (): Tally => ({ yesWeight: 0n, noWeight: 0n, turnoutStake: 0n });

export const voterCap = (totalStake: bigint): bigint => (totalStake * VOTER_CAP_BPS) / BPS;

export const cappedWeight = (stake: bigint, totalStake: bigint): bigint => {
  const cap = voterCap(totalStake);
  return stake > cap ? cap : stake;
};

export function castWeightedVote(t: Tally, stake: bigint, voteYes: boolean, totalStake: bigint): Tally {
  const w = cappedWeight(stake, totalStake);
  return {
    yesWeight: t.yesWeight + (voteYes ? w : 0n),
    noWeight: t.noWeight + (voteYes ? 0n : w),
    turnoutStake: t.turnoutStake + stake,
  };
}

export function weightedVoteTally(t: Tally, totalStake: bigint): TallyResult {
  const cast = t.yesWeight + t.noWeight;
  const castDenom = cast === 0n ? 1n : cast;
  const totalDenom = totalStake === 0n ? 1n : totalStake;
  const turnoutRaw = (t.turnoutStake * BPS) / totalDenom;
  return {
    yesBps: Number((t.yesWeight * BPS) / castDenom),
    noBps: Number((t.noWeight * BPS) / castDenom),
    turnoutBps: Number(turnoutRaw > BPS ? BPS : turnoutRaw),
    quorumMet: totalStake > 0n && t.turnoutStake * BPS >= totalStake * QUORUM_BPS,
  };
}

export function prorataRefund(stake: bigint, remainingLocked: bigint, totalStake: bigint): bigint {
  const denom = totalStake === 0n ? 1n : totalStake;
  const r = (stake * remainingLocked) / denom;
  return r > remainingLocked ? remainingLocked : r;
}
