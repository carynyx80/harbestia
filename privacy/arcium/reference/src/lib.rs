//! Plain-Rust reference implementation of the math in
//! `privacy/arcium/encrypted-ixs/src/lib.rs`.
//!
//! The Arcis circuits cannot be compiled here (no arcium CLI), so this crate
//! mirrors their arithmetic step for step: same integer widths, same floor
//! division, same zero-denominator guards. If you change one, change both.
//! The TypeScript `MockPrivacy` (privacy/ts/src/math.ts) uses the same rules
//! and the same test vectors.

/// Basis points denominator (100% = 10_000).
pub const BPS: u64 = 10_000;
/// A single voter's weight is capped at 10% of the total stake.
pub const VOTER_CAP_BPS: u64 = 1_000;
/// Quorum: at least 20% of total stake must vote.
pub const QUORUM_BPS: u64 = 2_000;

/// Encrypted state kept by the MXE between votes (Enc<Mxe, Tally> in Arcis).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Tally {
    /// Sum of capped weights voting yes.
    pub yes_weight: u64,
    /// Sum of capped weights voting no.
    pub no_weight: u64,
    /// Sum of raw (uncapped) stake that voted. Used for turnout / quorum.
    pub turnout_stake: u64,
}

/// What `weighted_vote_tally` reveals. Nothing else leaves the MXE.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TallyResult {
    pub yes_bps: u16,
    pub no_bps: u16,
    pub turnout_bps: u16,
    pub quorum_met: bool,
}

/// Per-voter cap: floor(total_stake * 10%).
pub fn voter_cap(total_stake: u64) -> u64 {
    ((total_stake as u128 * VOTER_CAP_BPS as u128) / BPS as u128) as u64
}

/// Capped voting weight for one voter.
pub fn capped_weight(stake: u64, total_stake: u64) -> u64 {
    let cap = voter_cap(total_stake);
    if stake > cap {
        cap
    } else {
        stake
    }
}

/// Mirrors the `cast_weighted_vote` circuit: fold one encrypted vote into the tally.
pub fn cast_weighted_vote(tally: Tally, stake: u64, vote_yes: bool, total_stake: u64) -> Tally {
    let w = capped_weight(stake, total_stake);
    let mut t = tally;
    if vote_yes {
        t.yes_weight += w;
    } else {
        t.no_weight += w;
    }
    t.turnout_stake += stake;
    t
}

/// Mirrors the `weighted_vote_tally` circuit: reveal percentages only.
pub fn weighted_vote_tally(tally: Tally, total_stake: u64) -> TallyResult {
    let cast = tally.yes_weight as u128 + tally.no_weight as u128;
    let cast_denom = if cast == 0 { 1 } else { cast };
    let total_denom = if total_stake == 0 { 1 } else { total_stake as u128 };

    let yes_bps = (tally.yes_weight as u128 * BPS as u128) / cast_denom;
    let no_bps = (tally.no_weight as u128 * BPS as u128) / cast_denom;
    let turnout_raw = (tally.turnout_stake as u128 * BPS as u128) / total_denom;
    let turnout_bps = if turnout_raw > BPS as u128 { BPS as u128 } else { turnout_raw };
    // Quorum compared without division to avoid rounding at the boundary:
    // turnout_stake / total_stake >= 20%  <=>  turnout_stake * BPS >= total_stake * QUORUM_BPS
    let quorum_met = total_stake > 0
        && tally.turnout_stake as u128 * BPS as u128 >= total_stake as u128 * QUORUM_BPS as u128;

    TallyResult {
        yes_bps: yes_bps as u16,
        no_bps: no_bps as u16,
        turnout_bps: turnout_bps as u16,
        quorum_met,
    }
}

/// Mirrors `record_contribution`: new encrypted running total.
pub fn record_contribution(total: u64, amount: u64) -> u64 {
    total + amount
}

/// Mirrors `sum_raised`: reveal the running total only.
pub fn sum_raised(contributions: &[u64]) -> u64 {
    contributions.iter().fold(0u64, |acc, a| record_contribution(acc, *a))
}

/// Mirrors `prorata_refund`: floor(stake * remaining_locked / total_stake).
pub fn prorata_refund(stake: u64, remaining_locked: u64, total_stake: u64) -> u64 {
    let denom = if total_stake == 0 { 1 } else { total_stake as u128 };
    let r = (stake as u128 * remaining_locked as u128) / denom;
    // A stake can never exceed the total, but guard anyway: never refund more than the pool.
    if r > remaining_locked as u128 {
        remaining_locked
    } else {
        r as u64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const USDC: u64 = 1_000_000; // 6 decimals

    fn run(votes: &[(u64, bool)], total: u64) -> TallyResult {
        let t = votes
            .iter()
            .fold(Tally::default(), |t, (s, y)| cast_weighted_vote(t, *s, *y, total));
        weighted_vote_tally(t, total)
    }

    #[test]
    fn cap_is_ten_percent() {
        assert_eq!(voter_cap(500_000 * USDC), 50_000 * USDC);
        assert_eq!(capped_weight(200_000 * USDC, 500_000 * USDC), 50_000 * USDC);
        assert_eq!(capped_weight(10_000 * USDC, 500_000 * USDC), 10_000 * USDC);
    }

    #[test]
    fn whale_is_capped() {
        // FreshBox: $500k raised. Whale $200k votes no; four $30k investors vote yes.
        let total = 500_000 * USDC;
        let r = run(
            &[
                (200_000 * USDC, false),
                (30_000 * USDC, true),
                (30_000 * USDC, true),
                (30_000 * USDC, true),
                (30_000 * USDC, true),
            ],
            total,
        );
        // yes = 120k, no = 50k (capped) -> 120/170 = 70.58%
        assert_eq!(r.yes_bps, 7058);
        assert_eq!(r.no_bps, 2941);
        // turnout uses raw stake: 320k / 500k = 64%
        assert_eq!(r.turnout_bps, 6400);
        assert!(r.quorum_met);
    }

    #[test]
    fn quorum_boundary() {
        let total = 1_000 * USDC;
        // exactly 20% -> met
        let r = run(&[(100 * USDC, true), (100 * USDC, false)], total);
        assert!(r.quorum_met);
        assert_eq!(r.turnout_bps, 2000);
        // one micro-unit short -> not met
        let r = run(&[(100 * USDC, true), (100 * USDC - 1, false)], total);
        assert!(!r.quorum_met);
    }

    #[test]
    fn empty_tally() {
        let r = weighted_vote_tally(Tally::default(), 1_000);
        assert_eq!(r, TallyResult { yes_bps: 0, no_bps: 0, turnout_bps: 0, quorum_met: false });
        let r = weighted_vote_tally(Tally::default(), 0);
        assert!(!r.quorum_met);
    }

    #[test]
    fn unanimous_yes() {
        let r = run(&[(40 * USDC, true), (60 * USDC, true)], 100 * USDC);
        assert_eq!(r.yes_bps, 10_000);
        assert_eq!(r.no_bps, 0);
        assert_eq!(r.turnout_bps, 10_000);
    }

    #[test]
    fn sum_raised_reveals_total() {
        assert_eq!(sum_raised(&[100 * USDC, 250 * USDC, 150 * USDC]), 500 * USDC);
        assert_eq!(sum_raised(&[]), 0);
    }

    #[test]
    fn prorata_refund_math() {
        // FreshBox fails after M1: $500k raised, $100k upfront + $150k released => $250k locked.
        let total = 500_000 * USDC;
        let locked = 250_000 * USDC;
        assert_eq!(prorata_refund(50_000 * USDC, locked, total), 25_000 * USDC);
        assert_eq!(prorata_refund(total, locked, total), locked);
        assert_eq!(prorata_refund(0, locked, total), 0);
        // floor rounding: 1 / 3 of 100 -> 33
        assert_eq!(prorata_refund(1, 100, 3), 33);
        // guard
        assert_eq!(prorata_refund(10, 5, 0), 5);
    }

    #[test]
    fn refunds_never_exceed_pool() {
        let total = 7 * USDC + 3;
        let stakes = [USDC + 1, 2 * USDC, 4 * USDC + 2];
        let locked = 5 * USDC + 7;
        let paid: u64 = stakes.iter().map(|s| prorata_refund(*s, locked, total)).sum();
        assert!(paid <= locked);
        assert!(locked - paid < stakes.len() as u64); // dust < number of investors
    }
}
