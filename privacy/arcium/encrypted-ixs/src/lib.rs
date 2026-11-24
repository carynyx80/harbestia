//! Harvestia encrypted instructions (Arcis / Arcium MPC).
//!
//! NOT COMPILED HERE: the arcium CLI is not installed in this environment.
//! Syntax follows https://docs.arcium.com/developers/arcis and
//! https://docs.arcium.com/developers/arcis/quick-reference (fetched 2026-11-24):
//!   - `#[encrypted] mod`, `#[instruction] pub fn`
//!   - `Enc<Shared, T>` (client + MXE can decrypt), `Enc<Mxe, T>` (MXE only)
//!   - `x.to_arcis()`, `x.owner.from_arcis(v)`, `v.reveal()`
//!   - fixed-bound `for`, `if/else` on secrets executes both branches,
//!     no `while`/`loop`/early `return`, no Vec/String.
//! The `mxe: Mxe` / `owner: Shared` parameters used to mint fresh ciphertexts
//! follow the pattern in Arcium's public voting example (from memory, VERIFY
//! against `arcium init` template before deploying).
//!
//! The math is mirrored 1:1 in `privacy/arcium/reference` (cargo test passes).
//!
//! Flow per campaign:
//!   init_raise -> record_contribution* -> sum_raised (reveal total)
//!   per milestone: init_tally -> cast_weighted_vote* -> weighted_vote_tally (reveal %)
//!   on failure:   prorata_refund per investor (encrypted to that investor)

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const BPS: u128 = 10_000;
    const VOTER_CAP_BPS: u128 = 1_000; // 10% of total stake per voter
    const QUORUM_BPS: u128 = 2_000; // 20% of total stake must vote

    /// Running tally held by the MXE between votes.
    #[derive(Copy, Clone)]
    pub struct Tally {
        yes_weight: u64,
        no_weight: u64,
        turnout_stake: u64,
    }

    /// One investor's ballot, encrypted client-side with the shared secret.
    #[derive(Copy, Clone)]
    pub struct Ballot {
        vote_yes: bool,
    }

    // ---------------------------------------------------------------- raise

    /// Fresh encrypted running total (0) for a campaign.
    #[instruction]
    pub fn init_raise(mxe: Mxe) -> Enc<Mxe, u64> {
        mxe.from_arcis(0u64)
    }

    /// Add one hidden contribution. Returns (new running total, the investor's
    /// stake re-encrypted to the MXE so later votes/refunds read it from chain
    /// state instead of trusting a voter-supplied stake).
    #[instruction]
    pub fn record_contribution(
        amount_ctxt: Enc<Shared, u64>,
        total_ctxt: Enc<Mxe, u64>,
    ) -> (Enc<Mxe, u64>, Enc<Mxe, u64>) {
        let amount = amount_ctxt.to_arcis();
        let total = total_ctxt.to_arcis();
        let new_total = total + amount;
        (
            total_ctxt.owner.from_arcis(new_total),
            total_ctxt.owner.from_arcis(amount),
        )
    }

    /// sum_raised: reveal only the campaign total, never individual amounts.
    #[instruction]
    pub fn sum_raised(total_ctxt: Enc<Mxe, u64>) -> u64 {
        let total = total_ctxt.to_arcis();
        total.reveal()
    }

    // ----------------------------------------------------------------- vote

    #[instruction]
    pub fn init_tally(mxe: Mxe) -> Enc<Mxe, Tally> {
        let t = Tally { yes_weight: 0, no_weight: 0, turnout_stake: 0 };
        mxe.from_arcis(t)
    }

    /// Fold one vote into the tally. `stake_ctxt` is the MXE-owned stake from
    /// `record_contribution`; `total_stake` is the public raisedUsdc.
    /// One-vote-per-investor is enforced outside MPC by the ZK vote nullifier.
    #[instruction]
    pub fn cast_weighted_vote(
        ballot_ctxt: Enc<Shared, Ballot>,
        stake_ctxt: Enc<Mxe, u64>,
        tally_ctxt: Enc<Mxe, Tally>,
        total_stake: u64,
    ) -> Enc<Mxe, Tally> {
        let ballot = ballot_ctxt.to_arcis();
        let stake = stake_ctxt.to_arcis();
        let mut tally = tally_ctxt.to_arcis();

        let cap = ((total_stake as u128 * VOTER_CAP_BPS) / BPS) as u64; // public
        let weight = if stake > cap { cap } else { stake };

        // Both branches execute (secret condition) -> no timing/branch leak.
        if ballot.vote_yes {
            tally.yes_weight = tally.yes_weight + weight;
        } else {
            tally.no_weight = tally.no_weight + weight;
        }
        tally.turnout_stake = tally.turnout_stake + stake;

        tally_ctxt.owner.from_arcis(tally)
    }

    /// weighted_vote_tally: reveal (yes_bps, no_bps, turnout_bps, quorum_met).
    /// Absolute weights stay secret; only ratios leave the MXE.
    /// NOTE: secret/secret division is costly in MPC; if unsupported or too
    /// expensive, reveal (yes > no, quorum_met) only and drop the percentages.
    #[instruction]
    pub fn weighted_vote_tally(
        tally_ctxt: Enc<Mxe, Tally>,
        total_stake: u64,
    ) -> (u16, u16, u16, bool) {
        let t = tally_ctxt.to_arcis();

        let cast = t.yes_weight as u128 + t.no_weight as u128;
        let cast_denom = if cast == 0 { 1u128 } else { cast };
        let total_denom: u128 = if total_stake == 0 { 1 } else { total_stake as u128 };

        let yes_bps = (t.yes_weight as u128 * BPS) / cast_denom;
        let no_bps = (t.no_weight as u128 * BPS) / cast_denom;
        let turnout_raw = (t.turnout_stake as u128 * BPS) / total_denom;
        let turnout_bps = if turnout_raw > BPS { BPS } else { turnout_raw };
        let quorum_met = (total_stake > 0)
            & (t.turnout_stake as u128 * BPS >= total_stake as u128 * QUORUM_BPS);

        (
            (yes_bps as u16).reveal(),
            (no_bps as u16).reveal(),
            (turnout_bps as u16).reveal(),
            quorum_met.reveal(),
        )
    }

    // --------------------------------------------------------------- refund

    /// prorata_refund: refund = floor(stake * remaining_locked / total_stake),
    /// encrypted to the investor (`owner` = investor's x25519 key + nonce) so
    /// only they learn the amount. The Rings unshield/transfer then moves it.
    #[instruction]
    pub fn prorata_refund(
        owner: Shared,
        stake_ctxt: Enc<Mxe, u64>,
        remaining_locked: u64,
        total_stake: u64,
    ) -> Enc<Shared, u64> {
        let stake = stake_ctxt.to_arcis();
        let denom: u128 = if total_stake == 0 { 1 } else { total_stake as u128 };
        let raw = (stake as u128 * remaining_locked as u128) / denom;
        let refund = if raw > remaining_locked as u128 { remaining_locked } else { raw as u64 };
        owner.from_arcis(refund)
    }
}
