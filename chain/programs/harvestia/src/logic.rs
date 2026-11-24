//! Harvestia business rules — pure Rust, no Anchor / Solana types.
//!
//! Every rule the on-chain program enforces lives here so it can be unit
//! tested on the host (`cargo test`). The Anchor instructions in `lib.rs`
//! only load accounts, call into this module, move tokens and emit events.
//!
//! Units: all money is USDC base units (6 decimals). Investor shares are
//! minted 1:1 with USDC base units invested. Times are unix seconds.
//!
//! Time windows (SPEC rule 5): every window is half-open `[start, end)` —
//! start inclusive, END EXCLUSIVE. At exactly `end` the window is closed.
//! Applies to the 7-day vote window, the 3-day quorum extension, the 30-day
//! resubmission window and the 7-day exit window.

pub const BPS_DENOM: u64 = 10_000;
pub const DEFAULT_FEE_BPS: u16 = 500; // 5% success fee
pub const MAX_FEE_BPS: u16 = 2_000;
pub const DEFAULT_UPFRONT_BPS: u16 = 2_000;
pub const MAX_MILESTONES: usize = 8;
pub const MAX_URI_LEN: usize = 200;

pub const DAY: i64 = 86_400;
pub const VOTE_WINDOW: i64 = 7 * DAY;
pub const RESUBMIT_WINDOW: i64 = 30 * DAY;
pub const EXIT_WINDOW: i64 = 7 * DAY;
pub const SHARE_LOCKUP: i64 = 365 * DAY; // 12 months (SPEC rule 4)
pub const QUORUM_EXTENSION: i64 = 3 * DAY; // one-time extension on first quorum failure (SPEC rule 1)

pub const VOTER_CAP_BPS: u64 = 1_000; // SPEC rule 2: cap (10% of total) applies ONLY to the Yes/No split weight
pub const QUORUM_BPS: u64 = 2_000; // SPEC rule 1/2: >= 20% of total invested stake, counted as RAW (uncapped) stake
pub const PASS_BPS: u64 = 5_000; // Yes must be strictly > 50% of capped votes cast

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogicError {
    MathOverflow,
    InvalidFee,
    InvalidGoal,
    InvalidEquity,
    InvalidUpfront,
    TooManyMilestones,
    NoMilestones,
    MilestoneSumMismatch,
    InvalidMilestoneAmount,
    InvalidDeadline,
    InvalidMinInvestors,
    InvalidStatus,
    RaiseClosed,
    RaiseStillOpen,
    ZeroAmount,
    ExceedsGoal,
    NothingToRefund,
    WrongMilestone,
    UriTooLong,
    ResubmitWindowClosed,
    VotingClosed,
    VotingStillOpen,
    AlreadyVoted,
    NoVotingWeight,
    ExitWindowClosed,
    InsufficientShares,
    OverSpend,
}

pub type LResult<T> = core::result::Result<T, LogicError>;

// ---------------------------------------------------------------- statuses

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum CampaignStatus {
    Draft = 0,
    Raising = 1,
    Active = 2,
    Completed = 3,
    Failed = 4,
    Refunding = 5,
}

impl CampaignStatus {
    pub fn from_u8(v: u8) -> LResult<Self> {
        Ok(match v {
            0 => Self::Draft,
            1 => Self::Raising,
            2 => Self::Active,
            3 => Self::Completed,
            4 => Self::Failed,
            5 => Self::Refunding,
            _ => return Err(LogicError::InvalidStatus),
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum MilestoneStatus {
    Pending = 0,
    Voting = 1,
    Released = 2,
    Rejected = 3,
    Resubmitted = 4, // second vote in progress after a No
    Refunded = 5,
    AwaitingReviewer = 6, // quorum failed, reviewer must decide
}

impl MilestoneStatus {
    pub fn from_u8(v: u8) -> LResult<Self> {
        Ok(match v {
            0 => Self::Pending,
            1 => Self::Voting,
            2 => Self::Released,
            3 => Self::Rejected,
            4 => Self::Resubmitted,
            5 => Self::Refunded,
            6 => Self::AwaitingReviewer,
            _ => return Err(LogicError::InvalidStatus),
        })
    }
    pub fn is_voting(self) -> bool {
        matches!(self, Self::Voting | Self::Resubmitted)
    }
}

// ---------------------------------------------------------------- math

pub fn mul_div(a: u64, b: u64, d: u64) -> LResult<u64> {
    if d == 0 {
        return Err(LogicError::MathOverflow);
    }
    let r = (a as u128)
        .checked_mul(b as u128)
        .ok_or(LogicError::MathOverflow)?
        / d as u128;
    u64::try_from(r).map_err(|_| LogicError::MathOverflow)
}

pub fn bps_of(amount: u64, bps: u64) -> LResult<u64> {
    mul_div(amount, bps, BPS_DENOM)
}

pub fn add(a: u64, b: u64) -> LResult<u64> {
    a.checked_add(b).ok_or(LogicError::MathOverflow)
}

pub fn sub(a: u64, b: u64) -> LResult<u64> {
    a.checked_sub(b).ok_or(LogicError::MathOverflow)
}

pub fn add_ts(t: i64, d: i64) -> LResult<i64> {
    t.checked_add(d).ok_or(LogicError::MathOverflow)
}

/// Half-open window check `[start, end)` (SPEC rule 5): start inclusive, end exclusive.
pub fn in_window(now: i64, start: i64, end: i64) -> bool {
    now >= start && now < end
}

// ---------------------------------------------------------------- config

pub fn validate_config(fee_bps: u16) -> LResult<()> {
    if fee_bps > MAX_FEE_BPS {
        return Err(LogicError::InvalidFee);
    }
    Ok(())
}

// ---------------------------------------------------------------- campaign creation

pub struct CampaignParams<'a> {
    pub goal: u64,
    pub equity_bps: u16,
    pub upfront_bps: u16,
    pub raise_deadline: i64,
    pub min_investors: u32,
    /// Platform success fee (bps of the total raise) — must fit inside the upfront tranche.
    pub fee_bps: u16,
    pub milestone_releases: &'a [u64],
    pub milestone_deadlines: &'a [i64],
}

pub fn upfront_amount(goal: u64, upfront_bps: u16) -> LResult<u64> {
    bps_of(goal, upfront_bps as u64)
}

/// SPEC rule 3: the success fee is charged on the total raise and taken out of the
/// UPFRONT tranche only. Raise is hard-capped at goal, so on success raised == goal.
pub fn success_fee(raised: u64, fee_bps: u16) -> LResult<u64> {
    bps_of(raised, fee_bps as u64)
}

/// Milestone release amounts plus the upfront tranche must sum exactly to the goal.
/// SPEC rule 3: upfront must cover the success fee (upfront < fee -> InvalidFee).
pub fn validate_campaign(p: &CampaignParams, now: i64) -> LResult<()> {
    if p.goal == 0 {
        return Err(LogicError::InvalidGoal);
    }
    if p.equity_bps == 0 || p.equity_bps as u64 >= BPS_DENOM {
        return Err(LogicError::InvalidEquity);
    }
    if p.upfront_bps as u64 >= BPS_DENOM {
        return Err(LogicError::InvalidUpfront);
    }
    if p.raise_deadline <= now {
        return Err(LogicError::InvalidDeadline);
    }
    if p.min_investors == 0 {
        return Err(LogicError::InvalidMinInvestors);
    }
    if p.milestone_releases.is_empty() {
        return Err(LogicError::NoMilestones);
    }
    if p.milestone_releases.len() > MAX_MILESTONES {
        return Err(LogicError::TooManyMilestones);
    }
    if p.milestone_deadlines.len() != p.milestone_releases.len() {
        return Err(LogicError::InvalidDeadline);
    }
    let mut prev = p.raise_deadline;
    for d in p.milestone_deadlines {
        if *d <= prev {
            return Err(LogicError::InvalidDeadline);
        }
        prev = *d;
    }
    let mut sum = upfront_amount(p.goal, p.upfront_bps)?;
    for r in p.milestone_releases {
        if *r == 0 {
            return Err(LogicError::InvalidMilestoneAmount);
        }
        sum = add(sum, *r)?;
    }
    if sum != p.goal {
        return Err(LogicError::MilestoneSumMismatch);
    }
    if p.fee_bps > MAX_FEE_BPS || success_fee(p.goal, p.fee_bps)? > upfront_amount(p.goal, p.upfront_bps)? {
        return Err(LogicError::InvalidFee);
    }
    Ok(())
}

// ---------------------------------------------------------------- raise

/// Returns (new_raised, new_investor_count). Raise is hard-capped at goal.
/// In the private build `amount` is not visible: it arrives as a commitment and the
/// running total is computed by the MPC layer; this is the plaintext reference rule.
pub fn apply_invest(
    status: CampaignStatus,
    now: i64,
    raise_deadline: i64,
    goal: u64,
    raised: u64,
    investors: u32,
    amount: u64,
    new_investor: bool,
) -> LResult<(u64, u32)> {
    if status != CampaignStatus::Raising {
        return Err(LogicError::InvalidStatus);
    }
    if now >= raise_deadline {
        return Err(LogicError::RaiseClosed);
    }
    if amount == 0 {
        return Err(LogicError::ZeroAmount);
    }
    let r = add(raised, amount)?;
    if r > goal {
        return Err(LogicError::ExceedsGoal);
    }
    let n = if new_investor {
        investors.checked_add(1).ok_or(LogicError::MathOverflow)?
    } else {
        investors
    };
    Ok((r, n))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RaiseOutcome {
    Success {
        upfront_gross: u64,
        fee: u64,
        founder_net: u64,
        locked: u64,
        investor_shares: u64,
        founder_shares_total: u64,
        /// SPEC rule 4: close time + 365 days; stored as `Campaign.lockup_ends_at`.
        lockup_ends_at: i64,
    },
    Failed,
}

/// Close is allowed after the deadline, or early once goal and min investors are met.
pub fn close_raise(
    status: CampaignStatus,
    now: i64,
    raise_deadline: i64,
    goal: u64,
    raised: u64,
    investors: u32,
    min_investors: u32,
    upfront_bps: u16,
    fee_bps: u16,
    equity_bps: u16,
) -> LResult<RaiseOutcome> {
    if status != CampaignStatus::Raising {
        return Err(LogicError::InvalidStatus);
    }
    let success = raised >= goal && investors >= min_investors;
    if !success && now < raise_deadline {
        return Err(LogicError::RaiseStillOpen);
    }
    if !success {
        return Ok(RaiseOutcome::Failed);
    }
    let upfront_gross = upfront_amount(goal, upfront_bps)?;
    // SPEC rule 3: 5% success fee on the whole raise, taken ONLY from the upfront
    // tranche (founder gets upfront - fee). Defence in depth: create_campaign already
    // rejects upfront < fee.
    let fee = success_fee(raised, fee_bps)?;
    if fee > upfront_gross {
        return Err(LogicError::InvalidFee);
    }
    let founder_net = sub(upfront_gross, fee)?;
    // Locked funds are never reduced by the fee; refunds/exits use the full locked amount.
    let locked = sub(raised, upfront_gross)?;
    let investor_shares = raised;
    let founder_shares_total = founder_shares_for(investor_shares, equity_bps)?;
    Ok(RaiseOutcome::Success {
        upfront_gross,
        fee,
        founder_net,
        locked,
        investor_shares,
        founder_shares_total,
        lockup_ends_at: add_ts(now, SHARE_LOCKUP)?,
    })
}

/// Investors hold `equity_bps` of the cap table; the founder pool is the rest.
pub fn founder_shares_for(investor_shares: u64, equity_bps: u16) -> LResult<u64> {
    if equity_bps == 0 {
        return Err(LogicError::InvalidEquity);
    }
    mul_div(investor_shares, BPS_DENOM - equity_bps as u64, equity_bps as u64)
}

/// Founder shares vest pro-rata to the scheduled milestone USDC released so far.
pub fn founder_vested(founder_total: u64, released_scheduled: u64, total_scheduled: u64) -> LResult<u64> {
    if released_scheduled >= total_scheduled {
        return Ok(founder_total);
    }
    mul_div(founder_total, released_scheduled, total_scheduled)
}

// ---------------------------------------------------------------- refunds / exits

/// Failed raise: full deposit back. Refunding (milestone failure): pro-rata of locked funds.
pub fn refund_amount(
    status: CampaignStatus,
    deposit: u64,
    shares: u64,
    locked: u64,
    outstanding_shares: u64,
) -> LResult<u64> {
    let amt = match status {
        CampaignStatus::Failed => deposit,
        CampaignStatus::Refunding => {
            if outstanding_shares == 0 {
                0
            } else {
                mul_div(locked, shares, outstanding_shares)?
            }
        }
        _ => return Err(LogicError::InvalidStatus),
    };
    if amt == 0 {
        return Err(LogicError::NothingToRefund);
    }
    Ok(amt)
}

/// SPEC rule 5: exit allowed in `[vote_finalized_at, vote_finalized_at + 7d)`.
/// `exit_window_end == 0` means no window is open.
pub fn exit_amount(
    status: CampaignStatus,
    now: i64,
    vote_finalized_at: i64,
    exit_window_end: i64,
    shares_to_burn: u64,
    position_shares: u64,
    locked: u64,
    outstanding_shares: u64,
) -> LResult<u64> {
    if status != CampaignStatus::Active {
        return Err(LogicError::InvalidStatus);
    }
    if exit_window_end == 0 || !in_window(now, vote_finalized_at, exit_window_end) {
        return Err(LogicError::ExitWindowClosed);
    }
    if shares_to_burn == 0 {
        return Err(LogicError::ZeroAmount);
    }
    if shares_to_burn > position_shares || shares_to_burn > outstanding_shares {
        return Err(LogicError::InsufficientShares);
    }
    mul_div(locked, shares_to_burn, outstanding_shares)
}

/// Amount actually released for a milestone: the scheduled amount scaled by
/// how much of the locked pool is left after exits. Last milestone takes all.
pub fn milestone_payout(scheduled: u64, locked: u64, remaining_scheduled: u64, is_last: bool) -> LResult<u64> {
    if is_last || remaining_scheduled == 0 {
        return Ok(locked);
    }
    let p = mul_div(scheduled, locked, remaining_scheduled)?;
    Ok(p.min(locked))
}

// ---------------------------------------------------------------- evidence & voting

/// Returns the new milestone status after evidence submission.
pub fn submit_evidence(
    campaign_status: CampaignStatus,
    current_milestone: u8,
    index: u8,
    ms: MilestoneStatus,
    resubmit_used: bool,
    resubmit_deadline: i64,
    now: i64,
    uri_len: usize,
) -> LResult<MilestoneStatus> {
    if campaign_status != CampaignStatus::Active {
        return Err(LogicError::InvalidStatus);
    }
    if index != current_milestone {
        return Err(LogicError::WrongMilestone);
    }
    if uri_len == 0 || uri_len > MAX_URI_LEN {
        return Err(LogicError::UriTooLong);
    }
    match ms {
        MilestoneStatus::Pending => Ok(MilestoneStatus::Voting),
        MilestoneStatus::Rejected => {
            if resubmit_used {
                return Err(LogicError::InvalidStatus);
            }
            // SPEC rule 5: resubmission window is [rejected_at, rejected_at + 30d), end exclusive.
            if now >= resubmit_deadline {
                return Err(LogicError::ResubmitWindowClosed);
            }
            Ok(MilestoneStatus::Resubmitted)
        }
        _ => Err(LogicError::InvalidStatus),
    }
}

/// Stake weight with a per-voter cap of 10% of total weight (Yes/No split only).
pub fn capped_weight(stake: u64, total_weight: u64) -> LResult<u64> {
    let cap = bps_of(total_weight, VOTER_CAP_BPS)?;
    Ok(stake.min(cap))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VoteWeight {
    /// Uncapped stake: added to the turnout tally used for quorum (SPEC rule 2).
    pub raw: u64,
    /// Capped stake: added to the Yes or No tally used for the majority split.
    pub capped: u64,
}

/// Returns the raw and capped weight to add to the tallies.
/// `already_voted` mirrors the nullifier check: one vote per position per round.
/// Vote window is `[evidence_at, vote_end)` — at exactly `vote_end` voting is closed.
pub fn cast_vote(
    ms: MilestoneStatus,
    now: i64,
    vote_end: i64,
    already_voted: bool,
    stake: u64,
    total_weight: u64,
) -> LResult<VoteWeight> {
    if !ms.is_voting() {
        return Err(LogicError::InvalidStatus);
    }
    if now >= vote_end {
        return Err(LogicError::VotingClosed);
    }
    if already_voted {
        return Err(LogicError::AlreadyVoted);
    }
    let w = capped_weight(stake, total_weight)?;
    if w == 0 {
        return Err(LogicError::NoVotingWeight);
    }
    Ok(VoteWeight { raw: stake, capped: w })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoteOutcome {
    /// Yes > 50% with quorum: release the milestone tranche.
    Release,
    /// First No: founder may resubmit until `resubmit_deadline`.
    Rejected { resubmit_deadline: i64 },
    /// Second No: campaign moves to Refunding.
    Refund,
    /// First quorum failure on this vote: window extended once by 3 days
    /// (set `quorum_extended = true`, `vote_end = new_vote_end`).
    ExtendVoting { new_vote_end: i64 },
    /// Second quorum failure on the same vote: reviewer must decide.
    NeedsReviewer,
}

/// SPEC rule 1/2: quorum = RAW (uncapped) stake that voted >= 20% of total invested stake.
pub fn quorum_met(raw_cast: u64, total_weight: u64) -> LResult<bool> {
    let q = bps_of(total_weight, QUORUM_BPS)?;
    Ok(raw_cast > 0 && raw_cast >= q)
}

/// `raw_cast` = uncapped yes+no stake (quorum); `yes`/`no` = capped tallies (split).
/// Finalizable once `now >= vote_end` (end exclusive).
pub fn finalize_vote(
    ms: MilestoneStatus,
    now: i64,
    vote_end: i64,
    raw_cast: u64,
    yes: u64,
    no: u64,
    total_weight: u64,
    quorum_extended: bool,
) -> LResult<VoteOutcome> {
    if !ms.is_voting() {
        return Err(LogicError::InvalidStatus);
    }
    if now < vote_end {
        return Err(LogicError::VotingStillOpen);
    }
    if !quorum_met(raw_cast, total_weight)? {
        if !quorum_extended {
            return Ok(VoteOutcome::ExtendVoting { new_vote_end: add_ts(vote_end, QUORUM_EXTENSION)? });
        }
        return Ok(VoteOutcome::NeedsReviewer);
    }
    Ok(decide(ms == MilestoneStatus::Resubmitted, passes(yes, no)?, now)?)
}

/// Yes wins iff capped_yes > capped_no (strictly more than 50% of capped votes).
pub fn passes(yes: u64, no: u64) -> LResult<bool> {
    let cast = add(yes, no)?;
    // yes / cast > 50%  <=>  yes * 10000 > cast * 5000
    Ok((yes as u128) * BPS_DENOM as u128 > (cast as u128) * PASS_BPS as u128)
}

fn decide(was_resubmission: bool, approved: bool, now: i64) -> LResult<VoteOutcome> {
    if approved {
        Ok(VoteOutcome::Release)
    } else if was_resubmission {
        Ok(VoteOutcome::Refund)
    } else {
        Ok(VoteOutcome::Rejected { resubmit_deadline: add_ts(now, RESUBMIT_WINDOW)? })
    }
}

/// Reviewer decision after a second quorum failure on the same vote. `was_resubmission` is true if the
/// failed vote was already the founder's one resubmission.
pub fn reviewer_decide(ms: MilestoneStatus, was_resubmission: bool, approve: bool, now: i64) -> LResult<VoteOutcome> {
    if ms != MilestoneStatus::AwaitingReviewer {
        return Err(LogicError::InvalidStatus);
    }
    decide(was_resubmission, approve, now)
}

/// A rejected milestone whose resubmission window lapsed can be pushed to Refunding by anyone.
pub fn resubmit_expired(ms: MilestoneStatus, resubmit_deadline: i64, now: i64) -> bool {
    ms == MilestoneStatus::Rejected && now >= resubmit_deadline
}

// ---------------------------------------------------------------- spending & shares

/// Founder's public spending log may never exceed what has been released to them.
pub fn record_spending(spent: u64, amount: u64, released_to_founder: u64) -> LResult<u64> {
    if amount == 0 {
        return Err(LogicError::ZeroAmount);
    }
    let s = add(spent, amount)?;
    if s > released_to_founder {
        return Err(LogicError::OverSpend);
    }
    Ok(s)
}

/// SPEC rule 4 transfer-hook rule: both sides KYC-allowlisted and the 12-month lockup
/// `[close, lockup_ends_at)` elapsed (transfers allowed from exactly `lockup_ends_at`).
/// Mint/burn by the program itself bypass the hook (not token transfers).
pub fn is_transfer_allowed(now: i64, lockup_ends_at: i64, sender_allowlisted: bool, receiver_allowlisted: bool) -> bool {
    sender_allowlisted && receiver_allowlisted && now >= lockup_ends_at
}

// ================================================================ tests

#[cfg(test)]
mod tests {
    use super::*;

    const USDC: u64 = 1_000_000;
    const NOW: i64 = 1_800_000_000;

    // FreshBox demo: goal 500k, 10% equity, upfront 100k (20%), milestones 150k/150k/100k.
    fn fresh_releases() -> [u64; 3] {
        [150_000 * USDC, 150_000 * USDC, 100_000 * USDC]
    }
    fn fresh_deadlines() -> [i64; 3] {
        [NOW + 120 * DAY, NOW + 210 * DAY, NOW + 300 * DAY]
    }
    fn params<'a>(r: &'a [u64], d: &'a [i64]) -> CampaignParams<'a> {
        CampaignParams {
            goal: 500_000 * USDC,
            equity_bps: 1000,
            upfront_bps: 2000,
            raise_deadline: NOW + 30 * DAY,
            min_investors: 25,
            fee_bps: DEFAULT_FEE_BPS,
            milestone_releases: r,
            milestone_deadlines: d,
        }
    }

    #[test]
    fn config_fee_bounds() {
        assert!(validate_config(DEFAULT_FEE_BPS).is_ok());
        assert_eq!(validate_config(MAX_FEE_BPS + 1), Err(LogicError::InvalidFee));
    }

    #[test]
    fn freshbox_campaign_valid() {
        let (r, d) = (fresh_releases(), fresh_deadlines());
        assert!(validate_campaign(&params(&r, &d), NOW).is_ok());
        assert_eq!(upfront_amount(500_000 * USDC, 2000).unwrap(), 100_000 * USDC);
    }

    #[test]
    fn campaign_sum_mismatch() {
        let r = [150_000 * USDC, 150_000 * USDC, 99_999 * USDC];
        let d = fresh_deadlines();
        assert_eq!(validate_campaign(&params(&r, &d), NOW), Err(LogicError::MilestoneSumMismatch));
    }

    #[test]
    fn campaign_bad_inputs() {
        let (r, d) = (fresh_releases(), fresh_deadlines());
        let mut p = params(&r, &d);
        p.goal = 0;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidGoal));
        let mut p = params(&r, &d);
        p.equity_bps = 10_000;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidEquity));
        let mut p = params(&r, &d);
        p.upfront_bps = 10_000;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidUpfront));
        let mut p = params(&r, &d);
        p.raise_deadline = NOW;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidDeadline));
        let mut p = params(&r, &d);
        p.min_investors = 0;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidMinInvestors));
        let empty: [u64; 0] = [];
        let empty_d: [i64; 0] = [];
        assert_eq!(validate_campaign(&params(&empty, &empty_d), NOW), Err(LogicError::NoMilestones));
    }

    #[test]
    fn campaign_too_many_milestones() {
        let r = [1u64; 9];
        let d: Vec<i64> = (1..=9).map(|i| NOW + 40 * DAY + i).collect();
        assert_eq!(validate_campaign(&params(&r, &d), NOW), Err(LogicError::TooManyMilestones));
    }

    #[test]
    fn campaign_eight_milestones_ok() {
        // goal 1000, upfront 20% = 200, 8 x 100
        let r = [100u64; 8];
        let d: Vec<i64> = (1..=8).map(|i| NOW + 40 * DAY + i).collect();
        let mut p = params(&r, &d);
        p.goal = 1000;
        assert!(validate_campaign(&p, NOW).is_ok());
    }

    #[test]
    fn campaign_deadlines_must_increase() {
        let r = fresh_releases();
        let d = [NOW + 120 * DAY, NOW + 100 * DAY, NOW + 300 * DAY];
        assert_eq!(validate_campaign(&params(&r, &d), NOW), Err(LogicError::InvalidDeadline));
        let d2 = [NOW + 10 * DAY, NOW + 200 * DAY, NOW + 300 * DAY]; // before raise deadline
        assert_eq!(validate_campaign(&params(&r, &d2), NOW), Err(LogicError::InvalidDeadline));
    }

    #[test]
    fn zero_milestone_rejected() {
        let r = [250_000 * USDC, 150_000 * USDC, 0];
        let d = fresh_deadlines();
        assert_eq!(validate_campaign(&params(&r, &d), NOW), Err(LogicError::InvalidMilestoneAmount));
    }

    #[test]
    fn invest_rules() {
        let s = CampaignStatus::Raising;
        let dl = NOW + DAY;
        assert_eq!(apply_invest(s, NOW, dl, 100, 0, 0, 40, true).unwrap(), (40, 1));
        assert_eq!(apply_invest(s, NOW, dl, 100, 40, 1, 10, false).unwrap(), (50, 1));
        assert_eq!(apply_invest(s, NOW, dl, 100, 90, 1, 11, true), Err(LogicError::ExceedsGoal));
        assert_eq!(apply_invest(s, NOW, dl, 100, 0, 0, 0, true), Err(LogicError::ZeroAmount));
        assert_eq!(apply_invest(s, dl, dl, 100, 0, 0, 1, true), Err(LogicError::RaiseClosed));
        assert_eq!(
            apply_invest(CampaignStatus::Draft, NOW, dl, 100, 0, 0, 1, true),
            Err(LogicError::InvalidStatus)
        );
        assert_eq!(apply_invest(s, NOW, dl, u64::MAX, u64::MAX, 0, 1, true), Err(LogicError::MathOverflow));
    }

    #[test]
    fn close_raise_success_freshbox() {
        let goal = 500_000 * USDC;
        let o = close_raise(CampaignStatus::Raising, NOW, NOW + DAY, goal, goal, 30, 25, 2000, 500, 1000).unwrap();
        match o {
            RaiseOutcome::Success { upfront_gross, fee, founder_net, locked, investor_shares, founder_shares_total, lockup_ends_at } => {
                assert_eq!(upfront_gross, 100_000 * USDC);
                assert_eq!(fee, 25_000 * USDC); // 5% of 500k
                assert_eq!(founder_net, 75_000 * USDC);
                assert_eq!(locked, 400_000 * USDC);
                assert_eq!(investor_shares, goal);
                assert_eq!(founder_shares_total, goal * 9); // 10% investors / 90% founder
                assert_eq!(lockup_ends_at, NOW + SHARE_LOCKUP);
            }
            _ => panic!("expected success"),
        }
    }

    #[test]
    fn close_raise_failed_min_investors() {
        let goal = 1000;
        let o = close_raise(CampaignStatus::Raising, NOW + DAY, NOW + DAY, goal, goal, 24, 25, 2000, 500, 1000).unwrap();
        assert_eq!(o, RaiseOutcome::Failed);
    }

    #[test]
    fn close_raise_failed_goal() {
        let o = close_raise(CampaignStatus::Raising, NOW + DAY, NOW + DAY, 1000, 999, 30, 25, 2000, 500, 1000).unwrap();
        assert_eq!(o, RaiseOutcome::Failed);
    }

    #[test]
    fn close_raise_too_early_unless_success() {
        assert_eq!(
            close_raise(CampaignStatus::Raising, NOW, NOW + DAY, 1000, 500, 30, 25, 2000, 500, 1000),
            Err(LogicError::RaiseStillOpen)
        );
        assert_eq!(
            close_raise(CampaignStatus::Active, NOW + DAY, NOW, 1000, 1000, 30, 25, 2000, 500, 1000),
            Err(LogicError::InvalidStatus)
        );
    }

    #[test]
    fn close_raise_fee_exceeds_upfront() {
        // upfront 1%, fee 5% -> invalid
        assert_eq!(
            close_raise(CampaignStatus::Raising, NOW, NOW + DAY, 1000, 1000, 30, 25, 100, 500, 1000),
            Err(LogicError::InvalidFee)
        );
    }

    #[test]
    fn founder_vesting() {
        let total = 900;
        let sched = 400;
        assert_eq!(founder_vested(total, 0, sched).unwrap(), 0);
        assert_eq!(founder_vested(total, 150, sched).unwrap(), 337);
        assert_eq!(founder_vested(total, 300, sched).unwrap(), 675);
        assert_eq!(founder_vested(total, 400, sched).unwrap(), 900);
    }

    #[test]
    fn refunds() {
        assert_eq!(refund_amount(CampaignStatus::Failed, 500, 500, 0, 0).unwrap(), 500);
        assert_eq!(refund_amount(CampaignStatus::Refunding, 500, 250, 1000, 1000).unwrap(), 250);
        assert_eq!(refund_amount(CampaignStatus::Refunding, 500, 0, 1000, 1000), Err(LogicError::NothingToRefund));
        assert_eq!(refund_amount(CampaignStatus::Active, 500, 1, 1, 1), Err(LogicError::InvalidStatus));
    }

    #[test]
    fn refunds_sum_never_exceed_locked() {
        // three holders, sequential claims, locked and outstanding shrink
        let mut locked = 1001u64;
        let mut out = 300u64;
        let mut paid = 0;
        for s in [100u64, 100, 100] {
            let a = refund_amount(CampaignStatus::Refunding, 0, s, locked, out).unwrap();
            locked -= a;
            out -= s;
            paid += a;
        }
        assert_eq!(paid, 1001);
        assert_eq!(locked, 0);
    }

    #[test]
    fn exit_window() {
        let a = CampaignStatus::Active;
        let end = NOW + EXIT_WINDOW;
        assert_eq!(exit_amount(a, NOW, NOW, end, 100, 100, 4000, 1000).unwrap(), 400); // start inclusive
        assert_eq!(exit_amount(a, end - 1, NOW, end, 100, 100, 4000, 1000).unwrap(), 400);
        assert_eq!(exit_amount(a, end, NOW, end, 100, 100, 4000, 1000), Err(LogicError::ExitWindowClosed)); // end exclusive
        assert_eq!(exit_amount(a, end + 1, NOW, end, 100, 100, 4000, 1000), Err(LogicError::ExitWindowClosed));
        assert_eq!(exit_amount(a, NOW - 1, NOW, end, 100, 100, 4000, 1000), Err(LogicError::ExitWindowClosed));
        assert_eq!(exit_amount(a, NOW, NOW, 0, 100, 100, 4000, 1000), Err(LogicError::ExitWindowClosed));
        assert_eq!(exit_amount(a, NOW, NOW, end, 101, 100, 4000, 1000), Err(LogicError::InsufficientShares));
        assert_eq!(exit_amount(a, NOW, NOW, end, 0, 100, 4000, 1000), Err(LogicError::ZeroAmount));
        assert_eq!(exit_amount(CampaignStatus::Refunding, NOW, NOW, end, 1, 100, 4000, 1000), Err(LogicError::InvalidStatus));
    }

    #[test]
    fn half_open_window_helper() {
        assert!(in_window(10, 10, 20));
        assert!(in_window(19, 10, 20));
        assert!(!in_window(20, 10, 20));
        assert!(!in_window(9, 10, 20));
    }

    #[test]
    fn milestone_payout_scales_after_exits() {
        // 400 locked scheduled 150/150/100; after an exit of 10%, locked = 360
        assert_eq!(milestone_payout(150, 400, 400, false).unwrap(), 150);
        assert_eq!(milestone_payout(150, 360, 400, false).unwrap(), 135);
        assert_eq!(milestone_payout(100, 77, 100, true).unwrap(), 77);
    }

    #[test]
    fn evidence_flow() {
        let a = CampaignStatus::Active;
        assert_eq!(submit_evidence(a, 0, 0, MilestoneStatus::Pending, false, 0, NOW, 10).unwrap(), MilestoneStatus::Voting);
        assert_eq!(submit_evidence(a, 0, 1, MilestoneStatus::Pending, false, 0, NOW, 10), Err(LogicError::WrongMilestone));
        assert_eq!(submit_evidence(a, 0, 0, MilestoneStatus::Pending, false, 0, NOW, 0), Err(LogicError::UriTooLong));
        assert_eq!(submit_evidence(a, 0, 0, MilestoneStatus::Pending, false, 0, NOW, MAX_URI_LEN + 1), Err(LogicError::UriTooLong));
        assert_eq!(
            submit_evidence(a, 0, 0, MilestoneStatus::Rejected, false, NOW + 1, NOW, 10).unwrap(),
            MilestoneStatus::Resubmitted
        );
        assert_eq!(
            submit_evidence(a, 0, 0, MilestoneStatus::Rejected, false, NOW - 1, NOW, 10),
            Err(LogicError::ResubmitWindowClosed)
        );
        // end exclusive: exactly at the resubmit deadline the window is closed
        assert_eq!(
            submit_evidence(a, 0, 0, MilestoneStatus::Rejected, false, NOW, NOW, 10),
            Err(LogicError::ResubmitWindowClosed)
        );
        assert_eq!(submit_evidence(a, 0, 0, MilestoneStatus::Rejected, true, NOW + 1, NOW, 10), Err(LogicError::InvalidStatus));
        assert_eq!(submit_evidence(a, 0, 0, MilestoneStatus::Voting, false, 0, NOW, 10), Err(LogicError::InvalidStatus));
        assert_eq!(
            submit_evidence(CampaignStatus::Raising, 0, 0, MilestoneStatus::Pending, false, 0, NOW, 10),
            Err(LogicError::InvalidStatus)
        );
    }

    #[test]
    fn vote_cap_10pct() {
        assert_eq!(capped_weight(500, 1000).unwrap(), 100);
        assert_eq!(capped_weight(50, 1000).unwrap(), 50);
        let w = cast_vote(MilestoneStatus::Voting, NOW, NOW + 1, false, 900, 1000).unwrap();
        assert_eq!(w, VoteWeight { raw: 900, capped: 100 });
    }

    #[test]
    fn vote_guards() {
        assert_eq!(cast_vote(MilestoneStatus::Voting, NOW, NOW + 1, true, 10, 1000), Err(LogicError::AlreadyVoted));
        assert_eq!(cast_vote(MilestoneStatus::Voting, NOW + 2, NOW + 1, false, 10, 1000), Err(LogicError::VotingClosed));
        // end exclusive: exactly at vote_end voting is closed; one second before is open
        assert_eq!(cast_vote(MilestoneStatus::Voting, NOW + 1, NOW + 1, false, 10, 1000), Err(LogicError::VotingClosed));
        assert!(cast_vote(MilestoneStatus::Voting, NOW, NOW + 1, false, 10, 1000).is_ok());
        assert_eq!(cast_vote(MilestoneStatus::Pending, NOW, NOW + 1, false, 10, 1000), Err(LogicError::InvalidStatus));
        assert_eq!(cast_vote(MilestoneStatus::Voting, NOW, NOW + 1, false, 0, 1000), Err(LogicError::NoVotingWeight));
        assert!(cast_vote(MilestoneStatus::Resubmitted, NOW, NOW + 1, false, 10, 1000).is_ok());
    }

    #[test]
    fn quorum_20pct() {
        assert!(quorum_met(200, 1000).unwrap()); // exactly 20% passes
        assert!(!quorum_met(199, 1000).unwrap());
        assert!(!quorum_met(0, 0).unwrap());
    }

    #[test]
    fn quorum_counts_raw_stake_not_capped() {
        // one whale with 25% of stake votes: capped weight 10% (< quorum) but raw 25% meets quorum
        let w = cast_vote(MilestoneStatus::Voting, NOW, NOW + 1, false, 250, 1000).unwrap();
        assert_eq!(w, VoteWeight { raw: 250, capped: 100 });
        assert!(quorum_met(w.raw, 1000).unwrap());
        assert!(!quorum_met(w.capped, 1000).unwrap());
        let out = finalize_vote(MilestoneStatus::Voting, NOW + 1, NOW + 1, w.raw, w.capped, 0, 1000, false).unwrap();
        assert_eq!(out, VoteOutcome::Release);
        // split uses capped weights: whale (raw 500, capped 100) Yes vs 150 raw No -> No wins
        let out = finalize_vote(MilestoneStatus::Voting, NOW + 1, NOW + 1, 650, 100, 150, 1000, false).unwrap();
        assert_eq!(out, VoteOutcome::Rejected { resubmit_deadline: NOW + 1 + RESUBMIT_WINDOW });
    }

    #[test]
    fn quorum_fail_extends_once_then_escalates() {
        let end = NOW;
        // first failure -> extend by 3 days, NOT reviewer
        assert_eq!(
            finalize_vote(MilestoneStatus::Voting, end, end, 199, 150, 49, 1000, false).unwrap(),
            VoteOutcome::ExtendVoting { new_vote_end: end + QUORUM_EXTENSION }
        );
        let ext_end = end + QUORUM_EXTENSION;
        // extended window still open (end exclusive)
        assert_eq!(
            finalize_vote(MilestoneStatus::Voting, ext_end - 1, ext_end, 199, 150, 49, 1000, true),
            Err(LogicError::VotingStillOpen)
        );
        assert!(cast_vote(MilestoneStatus::Voting, ext_end - 1, ext_end, false, 10, 1000).is_ok());
        // second failure on same vote -> reviewer
        assert_eq!(
            finalize_vote(MilestoneStatus::Voting, ext_end, ext_end, 199, 150, 49, 1000, true).unwrap(),
            VoteOutcome::NeedsReviewer
        );
        // quorum reached during extension -> normal decision
        assert_eq!(
            finalize_vote(MilestoneStatus::Voting, ext_end, ext_end, 200, 150, 50, 1000, true).unwrap(),
            VoteOutcome::Release
        );
        // same for a resubmission vote
        assert_eq!(
            finalize_vote(MilestoneStatus::Resubmitted, end, end, 0, 0, 0, 1000, false).unwrap(),
            VoteOutcome::ExtendVoting { new_vote_end: end + QUORUM_EXTENSION }
        );
        assert_eq!(
            finalize_vote(MilestoneStatus::Resubmitted, ext_end, ext_end, 0, 0, 0, 1000, true).unwrap(),
            VoteOutcome::NeedsReviewer
        );
    }

    #[test]
    fn pass_threshold_strict_majority() {
        assert!(passes(51, 49).unwrap());
        assert!(!passes(50, 50).unwrap());
        assert!(!passes(0, 0).unwrap());
    }

    #[test]
    fn finalize_paths() {
        let end = NOW;
        let t = NOW + 1;
        let v = MilestoneStatus::Voting;
        assert_eq!(finalize_vote(v, t, end, 200, 150, 50, 1000, false).unwrap(), VoteOutcome::Release);
        assert_eq!(
            finalize_vote(v, t, end, 200, 50, 150, 1000, false).unwrap(),
            VoteOutcome::Rejected { resubmit_deadline: t + RESUBMIT_WINDOW }
        );
        assert_eq!(finalize_vote(MilestoneStatus::Resubmitted, t, end, 200, 50, 150, 1000, false).unwrap(), VoteOutcome::Refund);
        assert_eq!(finalize_vote(MilestoneStatus::Resubmitted, t, end, 200, 150, 50, 1000, false).unwrap(), VoteOutcome::Release);
        assert_eq!(finalize_vote(v, t, end, 150, 100, 50, 1000, true).unwrap(), VoteOutcome::NeedsReviewer);
        // end exclusive: finalizable at exactly vote_end, not one second before
        assert!(finalize_vote(v, end, end, 200, 150, 50, 1000, false).is_ok());
        assert_eq!(finalize_vote(v, end - 1, end, 200, 150, 50, 1000, false), Err(LogicError::VotingStillOpen));
        assert_eq!(finalize_vote(MilestoneStatus::Released, t, end, 200, 150, 50, 1000, false), Err(LogicError::InvalidStatus));
    }

    #[test]
    fn reviewer_paths() {
        let r = MilestoneStatus::AwaitingReviewer;
        assert_eq!(reviewer_decide(r, false, true, NOW).unwrap(), VoteOutcome::Release);
        assert_eq!(
            reviewer_decide(r, false, false, NOW).unwrap(),
            VoteOutcome::Rejected { resubmit_deadline: NOW + RESUBMIT_WINDOW }
        );
        assert_eq!(reviewer_decide(r, true, false, NOW).unwrap(), VoteOutcome::Refund);
        assert_eq!(reviewer_decide(MilestoneStatus::Voting, false, true, NOW), Err(LogicError::InvalidStatus));
    }

    #[test]
    fn resubmit_expiry() {
        assert!(resubmit_expired(MilestoneStatus::Rejected, NOW, NOW + 1));
        assert!(resubmit_expired(MilestoneStatus::Rejected, NOW, NOW)); // end exclusive
        assert!(!resubmit_expired(MilestoneStatus::Rejected, NOW, NOW - 1));
        assert!(!resubmit_expired(MilestoneStatus::Voting, NOW, NOW + 1));
    }

    #[test]
    fn spending_capped_by_released() {
        assert_eq!(record_spending(0, 50, 100).unwrap(), 50);
        assert_eq!(record_spending(50, 51, 100), Err(LogicError::OverSpend));
        assert_eq!(record_spending(0, 0, 100), Err(LogicError::ZeroAmount));
    }

    #[test]
    fn hook_rules() {
        let lock = NOW + SHARE_LOCKUP;
        assert!(is_transfer_allowed(lock, lock, true, true)); // lockup [close, close+365d) ends exclusive
        assert!(!is_transfer_allowed(lock - 1, lock, true, true));
        assert!(!is_transfer_allowed(lock, lock, false, true));
        assert!(!is_transfer_allowed(lock, lock, true, false));
    }

    #[test]
    fn lockup_set_at_close() {
        let close_at = NOW + 5 * DAY;
        let RaiseOutcome::Success { lockup_ends_at, .. } =
            close_raise(CampaignStatus::Raising, close_at, NOW + 30 * DAY, 1000, 1000, 30, 25, 2000, 500, 1000).unwrap()
        else {
            panic!()
        };
        assert_eq!(lockup_ends_at, close_at + 365 * DAY);
    }

    #[test]
    fn fee_from_upfront_never_touches_locked() {
        let goal = 500_000 * USDC;
        for fee_bps in [0u16, 500, 2000] {
            let RaiseOutcome::Success { upfront_gross, fee, founder_net, locked, .. } =
                close_raise(CampaignStatus::Raising, NOW, NOW + DAY, goal, goal, 30, 25, 2000, fee_bps, 1000).unwrap()
            else {
                panic!()
            };
            assert_eq!(locked, goal - upfront_gross); // identical for every fee
            assert_eq!(locked, 400_000 * USDC);
            assert_eq!(founder_net + fee, upfront_gross);
            assert_eq!(fee, success_fee(goal, fee_bps).unwrap());
            // refunds computed on the full locked amount
            assert_eq!(refund_amount(CampaignStatus::Refunding, 0, goal, locked, goal).unwrap(), 400_000 * USDC);
        }
    }

    #[test]
    fn create_campaign_rejects_upfront_below_fee() {
        // goal 1000, upfront 4% = 40 < fee 5% = 50 -> InvalidFee at validation
        let r = [960u64];
        let d = [NOW + 60 * DAY];
        let mut p = params(&r, &d);
        p.goal = 1000;
        p.upfront_bps = 400;
        assert_eq!(validate_campaign(&p, NOW), Err(LogicError::InvalidFee));
        // upfront exactly equal to fee is allowed (founder_net = 0)
        let r = [950u64];
        let mut p = params(&r, &d);
        p.goal = 1000;
        p.upfront_bps = 500;
        assert!(validate_campaign(&p, NOW).is_ok());
    }

    #[test]
    fn status_roundtrip() {
        for v in 0..=5u8 {
            assert_eq!(CampaignStatus::from_u8(v).unwrap() as u8, v);
        }
        for v in 0..=6u8 {
            assert_eq!(MilestoneStatus::from_u8(v).unwrap() as u8, v);
        }
        assert!(CampaignStatus::from_u8(6).is_err());
        assert!(MilestoneStatus::from_u8(7).is_err());
    }

    #[test]
    fn mul_div_overflow_and_zero() {
        assert_eq!(mul_div(u64::MAX, u64::MAX, 1), Err(LogicError::MathOverflow));
        assert_eq!(mul_div(1, 1, 0), Err(LogicError::MathOverflow));
        assert_eq!(mul_div(u64::MAX, 2, 2).unwrap(), u64::MAX);
    }

    /// End-to-end FreshBox lifecycle through pure logic.
    #[test]
    fn freshbox_lifecycle() {
        let goal = 500_000 * USDC;
        let dl = NOW + 30 * DAY;
        let (mut raised, mut n) = (0u64, 0u32);
        for _ in 0..25 {
            let r = apply_invest(CampaignStatus::Raising, NOW, dl, goal, raised, n, 20_000 * USDC, true).unwrap();
            raised = r.0;
            n = r.1;
        }
        assert_eq!(raised, goal);
        let RaiseOutcome::Success { mut locked, founder_shares_total, .. } =
            close_raise(CampaignStatus::Raising, NOW + DAY, dl, goal, raised, n, 25, 2000, 500, 1000).unwrap()
        else {
            panic!()
        };
        let sched = fresh_releases();
        let total_sched: u64 = sched.iter().sum();
        let mut remaining = total_sched;
        let mut released_sched = 0;
        let outstanding = raised;
        for (i, s) in sched.iter().enumerate() {
            // 25 equal voters each capped at 10%: 4% each
            let w = capped_weight(20_000 * USDC, outstanding).unwrap();
            let yes = w * 10;
            let no = w * 2;
            let raw = 20_000 * USDC * 12;
            let out = finalize_vote(MilestoneStatus::Voting, NOW + 100, NOW, raw, yes, no, outstanding, false).unwrap();
            assert_eq!(out, VoteOutcome::Release);
            let p = milestone_payout(*s, locked, remaining, i == sched.len() - 1).unwrap();
            locked -= p;
            remaining -= s;
            released_sched += s;
        }
        assert_eq!(locked, 0);
        assert_eq!(founder_vested(founder_shares_total, released_sched, total_sched).unwrap(), founder_shares_total);
    }
}
