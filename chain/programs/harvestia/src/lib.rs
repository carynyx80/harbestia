//! Harvestia — private, milestone-based equity launchpad (Anchor program).
//!
//! Thin wrappers only: every business rule lives in `logic.rs` (pure Rust,
//! unit tested on host). Instructions here load accounts, call `logic::*`,
//! move SPL tokens via CPI and emit events.
//!
//! PRIVACY NOTE: this is the plaintext reference build. In the private build
//! investment amounts, positions, votes and refunds are ciphertexts /
//! commitments handled by the privacy layer (Helius Privacy Rings for
//! deposits, Arcium MPC for tallies and pro-rata math, ZK nullifiers for
//! one-vote-per-position). The state machine below is identical.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    self, Burn, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
};

pub mod logic;
use logic::{CampaignStatus as CS, LogicError, MilestoneStatus as MS, OfferingKind, PayoutStatus, RaiseOutcome, VoteOutcome};

declare_id!("7GQB4kUqwvuNNFGYyyKq2W6346oHNMvHudQnHXXkofnV");

pub const SHARE_DECIMALS: u8 = 6;

#[program]
pub mod harvestia {
    use super::*;

    /// Any funded deployer (`payer`) can initialize; `admin`/`reviewer` are
    /// plain args so the company wallet never has to sign at deploy time.
    /// Treasury must be a USDC account owned by `admin`.
    pub fn initialize_config(ctx: Context<InitializeConfig>, admin: Pubkey, reviewer: Pubkey, fee_bps: u16) -> Result<()> {
        logic::validate_config(fee_bps).map_err(err)?;
        logic::validate_admin(&admin.to_bytes()).map_err(err)?;
        logic::validate_admin(&reviewer.to_bytes()).map_err(err)?;
        logic::validate_treasury(
            &ctx.accounts.treasury.mint.to_bytes(),
            &ctx.accounts.treasury.owner.to_bytes(),
            &ctx.accounts.usdc_mint.key().to_bytes(),
            &admin.to_bytes(),
        ).map_err(err)?;
        let c = &mut ctx.accounts.config;
        c.admin = admin;
        c.reviewer = reviewer;
        c.usdc_mint = ctx.accounts.usdc_mint.key();
        c.treasury = ctx.accounts.treasury.key();
        c.fee_bps = fee_bps;
        c.campaign_count = 0;
        c.bump = ctx.bumps.config;
        emit!(ConfigInitialized { admin: c.admin, reviewer, fee_bps });
        Ok(())
    }

    /// Rotate the admin (e.g. company hot wallet -> Squads multisig vault).
    /// Signed by the CURRENT admin. Treasury is left unchanged.
    pub fn transfer_admin(ctx: Context<TransferAdmin>, new_admin: Pubkey) -> Result<()> {
        logic::validate_admin(&new_admin.to_bytes()).map_err(err)?;
        let c = &mut ctx.accounts.config;
        let old_admin = c.admin;
        c.admin = new_admin;
        emit!(AdminTransferred { old_admin, new_admin });
        Ok(())
    }

    pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let releases: Vec<u64> = args.milestones.iter().map(|m| m.release_usdc).collect();
        let deadlines: Vec<i64> = args.milestones.iter().map(|m| m.deadline).collect();
        require!(args.metadata_uri.len() <= logic::MAX_URI_LEN, HarvestiaError::UriTooLong);
        logic::validate_campaign(
            &logic::CampaignParams {
                goal: args.goal,
                equity_bps: args.equity_bps,
                upfront_bps: args.upfront_bps,
                raise_deadline: args.raise_deadline,
                min_investors: args.min_investors,
                // SPEC rule 3: upfront tranche must cover the success fee.
                fee_bps: ctx.accounts.config.fee_bps,
                milestone_releases: &releases,
                milestone_deadlines: &deadlines,
            },
            now,
        )
        .map_err(err)?;
        // Offerings (v2): category + offering kind with matching equity/token blocks.
        let eq_terms = args.offering.equity.as_ref().map(|e| logic::EquityTerms {
            equity_bps: e.equity_bps,
            basis: e.basis,
            share_bps: e.share_bps,
            starts_after_days: e.starts_after_days,
        });
        let tok_terms = args.offering.token.as_ref().map(|t| logic::TokenTerms {
            symbol: &t.symbol,
            total_supply: t.total_supply,
            investor_allocation_bps: t.investor_allocation_bps,
            target_launch_date: t.target_launch_date,
            cliff_months: t.cliff_months,
            months: t.months,
        });
        let kind = logic::validate_offering(
            args.category, args.offering.kind, eq_terms.as_ref(), tok_terms.as_ref(), args.equity_bps, now,
        )
        .map_err(err)?;

        let config = &mut ctx.accounts.config;
        let c = &mut ctx.accounts.campaign;
        c.id = config.campaign_count;
        config.campaign_count = config.campaign_count.checked_add(1).ok_or(HarvestiaError::MathOverflow)?;
        c.founder = ctx.accounts.founder.key();
        c.usdc_mint = config.usdc_mint;
        c.vault = ctx.accounts.vault.key();
        c.share_mint = ctx.accounts.share_mint.key();
        c.metadata_uri = args.metadata_uri;
        c.goal = args.goal;
        c.equity_bps = args.equity_bps;
        c.upfront_bps = args.upfront_bps;
        c.raise_deadline = args.raise_deadline;
        c.min_investors = args.min_investors;
        c.status = CS::Draft as u8;
        c.milestone_count = releases.len() as u8;
        c.total_scheduled = releases.iter().try_fold(0u64, |a, b| a.checked_add(*b)).ok_or(HarvestiaError::MathOverflow)?;
        c.remaining_scheduled = c.total_scheduled;
        for (i, m) in args.milestones.iter().enumerate() {
            c.milestones[i] = Milestone { release_usdc: m.release_usdc, deadline: m.deadline, ..Default::default() };
        }
        c.category = args.category;
        c.offering_kind = kind as u8;
        if let Some(e) = &args.offering.equity {
            c.equity_terms = EquityTermsState {
                equity_bps: e.equity_bps, basis: e.basis, share_bps: e.share_bps, starts_after_days: e.starts_after_days,
            };
        }
        if let Some(t) = &args.offering.token {
            c.token_terms = TokenTermsState {
                symbol: t.symbol.clone(),
                total_supply: t.total_supply,
                investor_allocation_bps: t.investor_allocation_bps,
                target_launch_date: t.target_launch_date,
                cliff_months: t.cliff_months,
                months: t.months,
                ..Default::default()
            };
        }
        c.bump = ctx.bumps.campaign;
        c.vault_bump = ctx.bumps.vault;
        emit!(CampaignCreated {
            campaign: c.key(), founder: c.founder, goal: c.goal, equity_bps: c.equity_bps,
            category: c.category, offering_kind: c.offering_kind,
        });
        Ok(())
    }

    pub fn approve_campaign(ctx: Context<AdminCampaign>) -> Result<()> {
        let c = &mut ctx.accounts.campaign;
        require!(c.status == CS::Draft as u8, HarvestiaError::InvalidStatus);
        c.status = CS::Raising as u8;
        emit!(CampaignApproved { campaign: c.key() });
        Ok(())
    }

    /// PRIVATE BUILD: `amount` is a ciphertext/commitment; the deposit goes through a
    /// Privacy Ring and `raised` is updated by the MPC tally. Plaintext here.
    pub fn invest(ctx: Context<Invest>, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.campaign;
        let p = &mut ctx.accounts.position;
        let new_investor = p.deposit == 0;
        let (raised, investors) = logic::apply_invest(
            st(c.status)?, now, c.raise_deadline, c.goal, c.raised, c.investor_count, amount, new_investor,
        )
        .map_err(err)?;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.investor_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.investor.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        if new_investor {
            p.campaign = c.key();
            p.owner = ctx.accounts.investor.key();
            p.bump = ctx.bumps.position;
        }
        p.deposit = logic::add(p.deposit, amount).map_err(err)?;
        c.raised = raised;
        c.investor_count = investors;
        emit!(Invested { campaign: c.key(), raised_total: raised, investor_count: investors });
        Ok(())
    }

    pub fn close_raise(ctx: Context<CloseRaise>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let fee_bps = ctx.accounts.config.fee_bps;
        let c = &ctx.accounts.campaign;
        let outcome = logic::close_raise(
            st(c.status)?, now, c.raise_deadline, c.goal, c.raised, c.investor_count, c.min_investors,
            c.upfront_bps, fee_bps, c.equity_bps,
        )
        .map_err(err)?;
        match outcome {
            RaiseOutcome::Failed => {
                let c = &mut ctx.accounts.campaign;
                c.status = CS::Failed as u8;
                c.locked = c.raised;
                emit!(RaiseClosed { campaign: c.key(), success: false, founder_net: 0, fee: 0 });
            }
            RaiseOutcome::Success { fee, founder_net, locked, investor_shares, founder_shares_total, lockup_ends_at, .. } => {
                let key = ctx.accounts.campaign.key();
                vault_transfer(&ctx.accounts.campaign, &ctx.accounts.vault, &ctx.accounts.usdc_mint,
                    &ctx.accounts.treasury, &ctx.accounts.usdc_program, fee)?;
                vault_transfer(&ctx.accounts.campaign, &ctx.accounts.vault, &ctx.accounts.usdc_mint,
                    &ctx.accounts.founder_usdc, &ctx.accounts.usdc_program, founder_net)?;
                let c = &mut ctx.accounts.campaign;
                c.status = CS::Active as u8;
                c.locked = locked;
                c.released_to_founder = founder_net;
                c.outstanding_shares = investor_shares;
                c.founder_shares_total = founder_shares_total;
                // SPEC rule 4: lockup_ends_at = close time + 365 days, enforced by harvestia-hook.
                c.lockup_ends_at = lockup_ends_at;
                // Offerings (v2): payout periods and token deadlines count from activation.
                c.activated_at = now;
                emit!(RaiseClosed { campaign: key, success: true, founder_net, fee });
            }
        }
        Ok(())
    }

    /// Investor claims their Token-2022 shares (1 share base unit per USDC base unit).
    pub fn claim_shares(ctx: Context<ClaimShares>) -> Result<()> {
        let c = &ctx.accounts.campaign;
        require!(c.status != CS::Draft as u8 && c.status != CS::Raising as u8 && c.status != CS::Failed as u8, HarvestiaError::InvalidStatus);
        let p = &mut ctx.accounts.position;
        require!(!p.shares_claimed, HarvestiaError::InvalidStatus);
        p.shares_claimed = true;
        p.shares = p.deposit;
        share_mint_to(c, &ctx.accounts.share_mint, &ctx.accounts.investor_shares, &ctx.accounts.share_program, p.deposit)?;
        Ok(())
    }

    /// Pro-rata claim of locked funds when the raise Failed (full deposit) or campaign is Refunding.
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let c = &ctx.accounts.campaign;
        let p = &ctx.accounts.position;
        require!(!p.refunded, HarvestiaError::NothingToRefund);
        // In Refunding the position's stake = deposit if shares not yet claimed, else held shares.
        let stake = if p.shares_claimed { p.shares } else { p.deposit.saturating_sub(p.exited_shares) };
        let amount = logic::refund_amount(st(c.status)?, p.deposit, stake, c.locked, c.outstanding_shares).map_err(err)?;
        // Offerings (v2): pay accrued payouts on the current stake BEFORE the shares go away.
        settle_payout(c, &mut ctx.accounts.position, stake, 0, ctx.accounts.payout_pool.as_deref(),
            &ctx.accounts.usdc_mint, &ctx.accounts.investor_usdc, &ctx.accounts.usdc_program)?;
        let c = &ctx.accounts.campaign;
        vault_transfer(c, &ctx.accounts.vault, &ctx.accounts.usdc_mint, &ctx.accounts.investor_usdc, &ctx.accounts.usdc_program, amount)?;
        let key = c.key();
        let c = &mut ctx.accounts.campaign;
        c.locked = logic::sub(c.locked, amount).map_err(err)?;
        if st(c.status)? == CS::Refunding {
            c.outstanding_shares = logic::sub(c.outstanding_shares, stake).map_err(err)?;
        }
        let p = &mut ctx.accounts.position;
        p.refunded = true;
        p.shares = 0;
        emit!(Refunded { campaign: key, amount });
        Ok(())
    }

    pub fn submit_evidence(ctx: Context<FounderCampaign>, index: u8, uri: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.campaign;
        require!((index as usize) < c.milestone_count as usize, HarvestiaError::WrongMilestone);
        let m = c.milestones[index as usize];
        let next = logic::submit_evidence(
            st(c.status)?, c.current_milestone, index, ms(m.status)?, m.resubmit_used, m.resubmit_deadline, now, uri.len(),
        )
        .map_err(err)?;
        let m = &mut c.milestones[index as usize];
        if next == MS::Resubmitted {
            m.resubmit_used = true;
        }
        m.status = next as u8;
        m.vote_round = m.vote_round.checked_add(1).ok_or(HarvestiaError::MathOverflow)?;
        m.vote_end = logic::add_ts(now, logic::VOTE_WINDOW).map_err(err)?;
        m.yes = 0;
        m.no = 0;
        m.raw_cast = 0;
        m.quorum_extended = false; // new vote: the one-time quorum extension is available again
        let vote_end = m.vote_end;
        c.evidence_uri = uri.clone();
        emit!(EvidenceSubmitted { campaign: c.key(), index, uri, vote_end });
        Ok(())
    }

    /// One vote per position per round: the VoteRecord PDA is the nullifier
    /// (`init` fails if it already exists). PRIVATE BUILD: choice and weight are
    /// encrypted and tallied by Arcium MPC; a ZK nullifier replaces the PDA seed.
    pub fn cast_vote(ctx: Context<CastVote>, index: u8, round: u8, approve: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.campaign;
        require!(index == c.current_milestone, HarvestiaError::WrongMilestone);
        let m = c.milestones[index as usize];
        require!(round == m.vote_round, HarvestiaError::InvalidStatus);
        let p = &ctx.accounts.position;
        let stake = if p.shares_claimed { p.shares } else { p.deposit.saturating_sub(p.exited_shares) };
        let w = logic::cast_vote(ms(m.status)?, now, m.vote_end, false, stake, c.outstanding_shares).map_err(err)?;
        let m = &mut c.milestones[index as usize];
        // SPEC rule 2: raw stake feeds quorum; capped weight feeds the Yes/No split.
        m.raw_cast = logic::add(m.raw_cast, w.raw).map_err(err)?;
        if approve {
            m.yes = logic::add(m.yes, w.capped).map_err(err)?;
        } else {
            m.no = logic::add(m.no, w.capped).map_err(err)?;
        }
        ctx.accounts.vote_record.bump = ctx.bumps.vote_record;
        emit!(VoteCast { campaign: c.key(), index, round });
        Ok(())
    }

    pub fn finalize_vote(ctx: Context<FinalizeVote>, index: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        require!(index == c.current_milestone, HarvestiaError::WrongMilestone);
        let m = c.milestones[index as usize];
        let out = logic::finalize_vote(
            ms(m.status)?, now, m.vote_end, m.raw_cast, m.yes, m.no, c.outstanding_shares, m.quorum_extended,
        )
        .map_err(err)?;
        apply_outcome_inner(ctx.accounts, index, out, now)
    }

    pub fn reviewer_decide(ctx: Context<ReviewerDecide>, index: u8, approve: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.inner.campaign;
        require!(index == c.current_milestone, HarvestiaError::WrongMilestone);
        let m = c.milestones[index as usize];
        let out = logic::reviewer_decide(ms(m.status)?, m.resubmit_used, approve, now).map_err(err)?;
        apply_outcome_inner(&mut ctx.accounts.inner, index, out, now)
    }

    /// Anyone may push a lapsed rejection (no resubmission within 30 days) to Refunding.
    pub fn expire_resubmission(ctx: Context<Permissionless>, index: u8) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.campaign;
        require!(index < c.milestone_count, HarvestiaError::WrongMilestone);
        let m = c.milestones[index as usize];
        require!(logic::resubmit_expired(ms(m.status)?, m.resubmit_deadline, now), HarvestiaError::InvalidStatus);
        c.milestones[index as usize].status = MS::Refunded as u8;
        c.status = CS::Refunding as u8;
        emit!(CampaignRefunding { campaign: c.key(), index });
        Ok(())
    }

    /// Exit during the 7-day window `[vote_finalized_at, vote_finalized_at + 7d)` after a
    /// finalized vote (SPEC rule 5, end exclusive): burn shares, take pro-rata of locked funds.
    pub fn exit_position(ctx: Context<ExitPosition>, shares: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        let p = &ctx.accounts.position;
        require!(p.shares_claimed, HarvestiaError::InvalidStatus);
        let amount = logic::exit_amount(st(c.status)?, now, c.vote_finalized_at, c.exit_window_end, shares, p.shares, c.locked, c.outstanding_shares)
            .map_err(err)?;
        // Offerings (v2): claim pending payouts on the full stake, then reset debt to the post-burn stake.
        let remaining = logic::sub(p.shares, shares).map_err(err)?;
        let held = p.shares;
        settle_payout(c, &mut ctx.accounts.position, held, remaining, ctx.accounts.payout_pool.as_deref(),
            &ctx.accounts.usdc_mint, &ctx.accounts.investor_usdc, &ctx.accounts.usdc_program)?;
        let c = &ctx.accounts.campaign;
        token_interface::burn(
            CpiContext::new(
                ctx.accounts.share_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.investor_shares.to_account_info(),
                    authority: ctx.accounts.investor.to_account_info(),
                },
            ),
            shares,
        )?;
        vault_transfer(c, &ctx.accounts.vault, &ctx.accounts.usdc_mint, &ctx.accounts.investor_usdc, &ctx.accounts.usdc_program, amount)?;
        let key = c.key();
        let c = &mut ctx.accounts.campaign;
        c.locked = logic::sub(c.locked, amount).map_err(err)?;
        c.outstanding_shares = logic::sub(c.outstanding_shares, shares).map_err(err)?;
        let p = &mut ctx.accounts.position;
        p.shares = logic::sub(p.shares, shares).map_err(err)?;
        p.exited_shares = logic::add(p.exited_shares, shares).map_err(err)?;
        emit!(PositionExited { campaign: key, amount });
        Ok(())
    }

    /// Founder claims shares vested by released milestones.
    pub fn claim_founder_shares(ctx: Context<ClaimFounderShares>) -> Result<()> {
        let c = &ctx.accounts.campaign;
        let vested = logic::founder_vested(c.founder_shares_total, c.released_scheduled, c.total_scheduled).map_err(err)?;
        let amount = logic::sub(vested, c.founder_shares_claimed).map_err(err)?;
        require!(amount > 0, HarvestiaError::ZeroAmount);
        share_mint_to(c, &ctx.accounts.share_mint, &ctx.accounts.founder_shares, &ctx.accounts.share_program, amount)?;
        let c = &mut ctx.accounts.campaign;
        c.founder_shares_claimed = vested;
        emit!(FounderVested { campaign: c.key(), vested, claimed_now: amount });
        Ok(())
    }

    /// Public spending log (founder accountability). Capped by USDC released to founder.
    pub fn record_spending(ctx: Context<FounderCampaign>, amount: u64, category: String, memo_uri: String) -> Result<()> {
        require!(category.len() <= 32 && memo_uri.len() <= logic::MAX_URI_LEN, HarvestiaError::UriTooLong);
        let c = &mut ctx.accounts.campaign;
        c.spent = logic::record_spending(c.spent, amount, c.released_to_founder).map_err(err)?;
        emit!(SpendingRecorded { campaign: c.key(), amount, category, memo_uri, total_spent: c.spent });
        Ok(())
    }

    // ============================================================ Offerings (v2)

    /// Founder deposits the monthly payout for `period` with its public report.
    /// Requires `amount >= gross_amount * share_bps / 10000`. The PayoutPeriod PDA is
    /// the public ledger row (ON_TIME / LATE vs due = period end + 15 days).
    /// A period already marked LATE (unpaid) may still be paid late; it stays LATE.
    pub fn deposit_payout(ctx: Context<DepositPayout>, period: u32, gross_amount: u64, amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        let kind = OfferingKind::from_u8(c.offering_kind).map_err(err)?;
        let rec = &ctx.accounts.payout_period;
        let is_new = rec.campaign == Pubkey::default();
        let (status, new_acc, due) = if is_new {
            let d = logic::deposit_payout(
                st(c.status)?, kind, c.equity_terms.share_bps, c.activated_at, c.equity_terms.starts_after_days,
                c.next_payout_period, period, gross_amount, amount, c.acc_payout_per_share, c.outstanding_shares, now,
            )
            .map_err(err)?;
            (d.status, d.new_acc, d.due)
        } else {
            require!(rec.period == period, HarvestiaError::WrongPeriod);
            let a = logic::deposit_late_marked(rec.paid, gross_amount, amount, c.equity_terms.share_bps,
                c.acc_payout_per_share, c.outstanding_shares).map_err(err)?;
            (PayoutStatus::Late, a, rec.due)
        };
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.usdc_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.founder_usdc.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.payout_pool.to_account_info(),
                    authority: ctx.accounts.founder.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        let key = ctx.accounts.campaign.key();
        let c = &mut ctx.accounts.campaign;
        c.acc_payout_per_share = new_acc;
        c.payout_pool = ctx.accounts.payout_pool.key();
        c.payout_deposited = logic::add(c.payout_deposited, amount).map_err(err)?;
        if is_new {
            c.next_payout_period = c.next_payout_period.checked_add(1).ok_or(HarvestiaError::MathOverflow)?;
            c.late_streak = logic::next_late_streak(c.late_streak, status);
            flag_default_if_needed(c, now)?;
        }
        let r = &mut ctx.accounts.payout_period;
        r.campaign = key;
        r.period = period;
        r.due = due;
        r.gross_amount = gross_amount;
        r.amount = amount;
        r.paid = true;
        r.paid_at = now;
        r.status = status as u8;
        r.bump = ctx.bumps.payout_period;
        emit!(PayoutDeposited { campaign: key, period, gross_amount, amount, status: status as u8, late_streak: c.late_streak });
        Ok(())
    }

    /// Permissionless: publicly mark the next unsettled period LATE once its due date
    /// passed without a deposit. 3 consecutive LATE periods -> `PayoutDefault` flag and
    /// an extra 7-day exit window on remaining locked funds.
    pub fn mark_late(ctx: Context<MarkLate>, period: u32) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        require!(c.status == CS::Active as u8 || c.status == CS::Completed as u8, HarvestiaError::InvalidStatus);
        let kind = OfferingKind::from_u8(c.offering_kind).map_err(err)?;
        let streak = logic::mark_late(kind, c.activated_at, c.equity_terms.starts_after_days, c.next_payout_period, period, c.late_streak, now)
            .map_err(err)?;
        let (_, _, due) = logic::payout_period_bounds(c.activated_at, c.equity_terms.starts_after_days, period).map_err(err)?;
        let key = c.key();
        let c = &mut ctx.accounts.campaign;
        c.late_streak = streak;
        c.next_payout_period = c.next_payout_period.checked_add(1).ok_or(HarvestiaError::MathOverflow)?;
        flag_default_if_needed(c, now)?;
        let r = &mut ctx.accounts.payout_period;
        r.campaign = key;
        r.period = period;
        r.due = due;
        r.paid = false;
        r.status = PayoutStatus::Late as u8;
        r.bump = ctx.bumps.payout_period;
        emit!(PayoutMarkedLate { campaign: key, period, late_streak: streak, payout_default: c.flags & logic::FLAG_PAYOUT_DEFAULT != 0 });
        Ok(())
    }

    /// Investor claims accrued payouts: shares × accPerShare − payoutDebt.
    /// PRIVATE BUILD: amount routed via Helius Rings, pro-rata math via Arcium.
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        let c = &ctx.accounts.campaign;
        let stake = position_stake(&ctx.accounts.position);
        require!(!ctx.accounts.position.refunded, HarvestiaError::InvalidStatus);
        let pending = logic::pending_payout(stake, c.acc_payout_per_share, ctx.accounts.position.payout_debt).map_err(err)?;
        require!(pending > 0, HarvestiaError::NothingToClaim);
        settle_payout(c, &mut ctx.accounts.position, stake, stake, Some(&ctx.accounts.payout_pool),
            &ctx.accounts.usdc_mint, &ctx.accounts.investor_usdc, &ctx.accounts.usdc_program)?;
        emit!(PayoutClaimed { campaign: c.key() });
        Ok(())
    }

    /// Founder registers the launched token mint and deposits the investor allocation
    /// (total_supply × investor_allocation_bps) into the TokenVault PDA. Launch time = now.
    pub fn register_token(ctx: Context<RegisterToken>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        let kind = OfferingKind::from_u8(c.offering_kind).map_err(err)?;
        logic::check_register_token(st(c.status)?, kind, c.token_terms.mint != Pubkey::default()).map_err(err)?;
        require!(c.outstanding_shares > 0, HarvestiaError::NoShares);
        let alloc = logic::token_investor_allocation(c.token_terms.total_supply, c.token_terms.investor_allocation_bps).map_err(err)?;
        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.founder_token.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    to: ctx.accounts.token_vault.to_account_info(),
                    authority: ctx.accounts.founder.to_account_info(),
                },
            ),
            alloc,
            ctx.accounts.token_mint.decimals,
        )?;
        let c = &mut ctx.accounts.campaign;
        c.token_terms.mint = ctx.accounts.token_mint.key();
        c.token_terms.vault = ctx.accounts.token_vault.key();
        c.token_terms.launched_at = now;
        c.token_terms.deposited = alloc;
        c.token_terms.snapshot_shares = c.outstanding_shares;
        emit!(TokenRegistered { campaign: c.key(), mint: c.token_terms.mint, deposited: alloc });
        Ok(())
    }

    /// Investor claims vested tokens pro-rata to shares (linear after the cliff from launch).
    pub fn claim_tokens(ctx: Context<ClaimTokens>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &ctx.accounts.campaign;
        let t = &c.token_terms;
        require!(t.mint != Pubkey::default(), HarvestiaError::TokenNotRegistered);
        let p = &ctx.accounts.position;
        require!(!p.refunded, HarvestiaError::InvalidStatus);
        let vested = logic::vested_tokens(t.deposited, t.launched_at, t.cliff_months, t.months, now).map_err(err)?;
        let amount = logic::token_claimable(vested, position_stake(p), t.snapshot_shares, p.tokens_claimed).map_err(err)?;
        require!(amount > 0, HarvestiaError::NothingToClaim);
        vault_transfer(c, &ctx.accounts.token_vault, &ctx.accounts.token_mint, &ctx.accounts.investor_token,
            &ctx.accounts.token_program, amount)?;
        let key = c.key();
        let p = &mut ctx.accounts.position;
        p.tokens_claimed = logic::add(p.tokens_claimed, amount).map_err(err)?;
        emit!(TokensClaimed { campaign: key });
        Ok(())
    }

    /// Permissionless: flag `TokenOverdue` if the token hasn't launched by target + 180 days.
    pub fn flag_token_overdue(ctx: Context<Permissionless>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let c = &mut ctx.accounts.campaign;
        let kind = OfferingKind::from_u8(c.offering_kind).map_err(err)?;
        require!(kind.has_token(), HarvestiaError::NoTokenOffering);
        require!(
            logic::is_token_overdue(c.token_terms.target_launch_date, c.token_terms.mint != Pubkey::default(), now),
            HarvestiaError::InvalidStatus
        );
        c.flags |= logic::FLAG_TOKEN_OVERDUE;
        emit!(TokenOverdue { campaign: c.key() });
        Ok(())
    }
}

fn position_stake(p: &Position) -> u64 {
    if p.shares_claimed { p.shares } else { p.deposit.saturating_sub(p.exited_shares) }
}

/// 3 consecutive LATE periods -> sticky `PayoutDefault` flag + extra exit window on locked funds.
fn flag_default_if_needed(c: &mut Campaign, now: i64) -> Result<()> {
    if logic::is_payout_default(c.late_streak) && c.flags & logic::FLAG_PAYOUT_DEFAULT == 0 {
        c.flags |= logic::FLAG_PAYOUT_DEFAULT;
        if c.status == CS::Active as u8 {
            c.vote_finalized_at = now;
            c.exit_window_end = logic::add_ts(now, logic::EXIT_WINDOW).map_err(err)?;
        }
        emit!(PayoutDefault { campaign_id: c.id, founder: c.founder });
    }
    Ok(())
}

/// Pays pending payouts for `stake_before` and resets debt to `stake_after × acc`.
/// Used by claim_payout, exit_position (before burn) and refund (before zeroing shares).
fn settle_payout<'info>(
    c: &Account<'info, Campaign>,
    p: &mut Account<'info, Position>,
    stake_before: u64,
    stake_after: u64,
    pool: Option<&InterfaceAccount<'info, TokenAccount>>,
    usdc_mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let pending = logic::pending_payout(stake_before, c.acc_payout_per_share, p.payout_debt).map_err(err)?;
    if pending > 0 {
        let pool = pool.ok_or(HarvestiaError::InvalidStatus)?;
        require_keys_eq!(pool.key(), c.payout_pool, HarvestiaError::InvalidStatus);
        vault_transfer(c, pool, usdc_mint, to, program, pending)?;
        p.payout_claimed = logic::add(p.payout_claimed, pending).map_err(err)?;
    }
    p.payout_debt = logic::payout_debt_for(stake_after, c.acc_payout_per_share).map_err(err)?;
    Ok(())
}

// ------------------------------------------------------------------ helpers

fn err(e: LogicError) -> Error {
    HarvestiaError::from(e).into()
}
fn st(v: u8) -> Result<CS> {
    CS::from_u8(v).map_err(err)
}
fn ms(v: u8) -> Result<MS> {
    MS::from_u8(v).map_err(err)
}

fn apply_outcome_inner(a: &mut FinalizeVote, index: u8, out: VoteOutcome, now: i64) -> Result<()> {
    let i = index as usize;
    let key = a.campaign.key();
    match out {
        VoteOutcome::Release => {
            let c = &a.campaign;
            let scheduled = c.milestones[i].release_usdc;
            let is_last = index + 1 == c.milestone_count;
            let payout = logic::milestone_payout(scheduled, c.locked, c.remaining_scheduled, is_last).map_err(err)?;
            vault_transfer(c, &a.vault, &a.usdc_mint, &a.founder_usdc, &a.usdc_program, payout)?;
            let c = &mut a.campaign;
            c.locked = logic::sub(c.locked, payout).map_err(err)?;
            c.remaining_scheduled = logic::sub(c.remaining_scheduled, scheduled).map_err(err)?;
            c.released_scheduled = logic::add(c.released_scheduled, scheduled).map_err(err)?;
            c.released_to_founder = logic::add(c.released_to_founder, payout).map_err(err)?;
            c.milestones[i].status = MS::Released as u8;
            if is_last {
                c.status = CS::Completed as u8;
                c.exit_window_end = 0;
            } else {
                c.current_milestone += 1;
                c.vote_finalized_at = now;
                c.exit_window_end = logic::add_ts(now, logic::EXIT_WINDOW).map_err(err)?;
            }
            emit!(MilestoneReleased { campaign: key, index, amount: payout });
        }
        VoteOutcome::Rejected { resubmit_deadline } => {
            let c = &mut a.campaign;
            c.milestones[i].status = MS::Rejected as u8;
            c.milestones[i].resubmit_deadline = resubmit_deadline;
            c.vote_finalized_at = now;
            c.exit_window_end = logic::add_ts(now, logic::EXIT_WINDOW).map_err(err)?;
            emit!(MilestoneRejected { campaign: key, index, resubmit_deadline });
        }
        VoteOutcome::Refund => {
            let c = &mut a.campaign;
            c.milestones[i].status = MS::Refunded as u8;
            c.status = CS::Refunding as u8;
            emit!(CampaignRefunding { campaign: key, index });
        }
        VoteOutcome::ExtendVoting { new_vote_end } => {
            // SPEC rule 1: first quorum failure -> extend once by 3 days (same round,
            // so existing VoteRecord nullifiers stay valid and abstainers can still vote).
            let c = &mut a.campaign;
            c.milestones[i].quorum_extended = true;
            c.milestones[i].vote_end = new_vote_end;
            emit!(VotingExtended { campaign: key, index, vote_end: new_vote_end });
        }
        VoteOutcome::NeedsReviewer => {
            // SPEC rule 1: second quorum failure on the same vote -> reviewer_decide.
            let c = &mut a.campaign;
            c.milestones[i].status = MS::AwaitingReviewer as u8;
            emit!(ReviewerRequired { campaign: key, index });
        }
    }
    Ok(())
}

fn campaign_seeds_sign<'a>(c: &'a Campaign, id_bytes: &'a [u8; 8], bump: &'a [u8; 1]) -> [&'a [u8]; 4] {
    [b"campaign", c.founder.as_ref(), id_bytes, bump]
}

fn vault_transfer<'info>(
    c: &Account<'info, Campaign>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let id = c.id.to_le_bytes();
    let bump = [c.bump];
    let seeds = campaign_seeds_sign(c, &id, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: c.to_account_info(),
            },
            signer,
        ),
        amount,
        mint.decimals,
    )
}

fn share_mint_to<'info>(
    c: &Account<'info, Campaign>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let id = c.id.to_le_bytes();
    let bump = [c.bump];
    let seeds = campaign_seeds_sign(c, &id, &bump);
    let signer: &[&[&[u8]]] = &[&seeds];
    token_interface::mint_to(
        CpiContext::new_with_signer(
            program.to_account_info(),
            MintTo { mint: mint.to_account_info(), to: to.to_account_info(), authority: c.to_account_info() },
            signer,
        ),
        amount,
    )
}

// ------------------------------------------------------------------ state

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub reviewer: Pubkey,
    pub usdc_mint: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub campaign_count: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct Milestone {
    pub release_usdc: u64,
    pub deadline: i64,
    pub status: u8, // logic::MilestoneStatus
    pub resubmit_used: bool,
    pub resubmit_deadline: i64,
    pub vote_round: u8,
    pub vote_end: i64,
    /// Capped (10%/voter) tallies used for the Yes/No split.
    pub yes: u64,
    pub no: u64,
    /// Raw (uncapped) stake that voted, used for the 20% quorum (SPEC rule 2).
    pub raw_cast: u64,
    /// Set after the first quorum failure extended the window by 3 days (SPEC rule 1).
    pub quorum_extended: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub id: u64,
    pub founder: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub share_mint: Pubkey,
    #[max_len(200)]
    pub metadata_uri: String,
    #[max_len(200)]
    pub evidence_uri: String,
    pub goal: u64,
    pub raised: u64, // public total; in private build revealed only as MPC aggregate
    pub investor_count: u32,
    pub min_investors: u32,
    pub equity_bps: u16,
    pub upfront_bps: u16,
    pub raise_deadline: i64,
    pub status: u8, // logic::CampaignStatus
    pub locked: u64,
    pub total_scheduled: u64,
    pub remaining_scheduled: u64,
    pub released_scheduled: u64,
    pub released_to_founder: u64,
    pub spent: u64,
    pub outstanding_shares: u64,
    pub founder_shares_total: u64,
    pub founder_shares_claimed: u64,
    /// SPEC rule 4: 12-month lockup end (close_raise time + 365 days); enforced by the
    /// harvestia-hook transfer hook via `is_transfer_allowed`.
    pub lockup_ends_at: i64,
    /// SPEC rule 5: exit window is `[vote_finalized_at, exit_window_end)`; 0 = none open.
    pub vote_finalized_at: i64,
    pub exit_window_end: i64,
    pub current_milestone: u8,
    pub milestone_count: u8,
    pub milestones: [Milestone; 8],
    pub bump: u8,
    pub vault_bump: u8,
    // ---- Offerings (v2)
    pub category: u8,      // logic::Category
    pub offering_kind: u8, // logic::OfferingKind
    pub equity_terms: EquityTermsState,
    pub token_terms: TokenTermsState,
    /// close_raise time; payout periods start `starts_after_days` later.
    pub activated_at: i64,
    /// Cumulative payout per investor share, scaled by 1e12.
    pub acc_payout_per_share: u128,
    pub payout_pool: Pubkey,
    pub payout_deposited: u64,
    pub next_payout_period: u32,
    pub late_streak: u8,
    /// Public flags: bit0 PayoutDefault, bit1 TokenOverdue.
    pub flags: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, InitSpace)]
pub struct EquityTermsState {
    pub equity_bps: u16,
    pub basis: u8, // logic::PayoutBasis
    pub share_bps: u16,
    pub starts_after_days: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default, InitSpace)]
pub struct TokenTermsState {
    #[max_len(10)]
    pub symbol: String,
    pub total_supply: u64,
    pub investor_allocation_bps: u16,
    pub target_launch_date: i64,
    pub cliff_months: u16,
    pub months: u16,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub launched_at: i64,
    pub deposited: u64,
    /// outstanding investor shares when the allocation was deposited (pro-rata base).
    pub snapshot_shares: u64,
}

/// Public payout ledger row: one per (campaign, period).
#[account]
#[derive(InitSpace)]
pub struct PayoutPeriod {
    pub campaign: Pubkey,
    pub period: u32,
    pub due: i64,
    pub gross_amount: u64,
    pub amount: u64,
    pub paid: bool,
    pub paid_at: i64,
    pub status: u8, // logic::PayoutStatus
    pub bump: u8,
}

/// PRIVATE BUILD: `deposit`/`shares` are commitments; plaintext reference here.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub campaign: Pubkey,
    pub owner: Pubkey,
    pub deposit: u64,
    pub shares: u64,
    pub exited_shares: u64,
    pub shares_claimed: bool,
    pub refunded: bool,
    pub bump: u8,
    // ---- Offerings (v2)
    /// shares × accPerShare / 1e12 at last settlement.
    pub payout_debt: u128,
    pub payout_claimed: u64,
    pub tokens_claimed: u64,
}

/// Nullifier: one per (campaign, milestone, round, position).
#[account]
#[derive(InitSpace)]
pub struct VoteRecord {
    pub bump: u8,
}

// ------------------------------------------------------------------ args

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneArg {
    pub release_usdc: u64,
    pub deadline: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateCampaignArgs {
    pub goal: u64,
    pub equity_bps: u16,
    pub upfront_bps: u16,
    pub raise_deadline: i64,
    pub min_investors: u32,
    pub metadata_uri: String,
    pub milestones: Vec<MilestoneArg>,
    pub category: u8,
    pub offering: OfferingArg,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct EquityOfferingArg {
    pub equity_bps: u16,
    pub basis: u8, // 0 revenue, 1 profit
    pub share_bps: u16,
    pub starts_after_days: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TokenOfferingArg {
    pub symbol: String,
    pub total_supply: u64,
    pub investor_allocation_bps: u16,
    pub target_launch_date: i64,
    pub cliff_months: u16,
    pub months: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OfferingArg {
    pub kind: u8, // 0 equity, 1 token, 2 both
    pub equity: Option<EquityOfferingArg>,
    pub token: Option<TokenOfferingArg>,
}

// ------------------------------------------------------------------ contexts

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(init, payer = payer, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(token::mint = usdc_mint)]
    pub treasury: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferAdmin<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = usdc_mint)]
    pub config: Account<'info, Config>,
    #[account(
        init, payer = founder, space = 8 + Campaign::INIT_SPACE,
        seeds = [b"campaign", founder.key().as_ref(), &config.campaign_count.to_le_bytes()], bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init, payer = founder, seeds = [b"vault", campaign.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = campaign, token::token_program = usdc_program
    )]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Token-2022 share mint with transfer hook -> harvestia-hook (allowlist + lockup).
    #[account(
        init, payer = founder, seeds = [b"shares", campaign.key().as_ref()], bump,
        mint::decimals = SHARE_DECIMALS, mint::authority = campaign, mint::token_program = share_program,
        extensions::transfer_hook::authority = campaign,
        extensions::transfer_hook::program_id = hook_program,
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: transfer-hook program id stored in the mint extension.
    #[account(address = HOOK_PROGRAM_ID)]
    pub hook_program: UncheckedAccount<'info>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub share_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub const HOOK_PROGRAM_ID: Pubkey = pubkey!("ED26KMhQDKqF3UXH1tSemGwj5rB6n7nKH46jkQY8vQDG"); // == harvestia_hook declare_id / target/deploy keypair

#[derive(Accounts)]
pub struct AdminCampaign<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = admin)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub campaign: Box<Account<'info, Campaign>>,
}

#[derive(Accounts)]
pub struct Invest<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut, has_one = vault, has_one = usdc_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(
        init_if_needed, payer = investor, space = 8 + Position::INIT_SPACE,
        seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump
    )]
    pub position: Box<Account<'info, Position>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = investor)]
    pub investor_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseRaise<'info> {
    pub caller: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = treasury)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, has_one = vault, has_one = usdc_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub treasury: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = campaign.founder)]
    pub founder_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ClaimShares<'info> {
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(has_one = share_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut, seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed, payer = investor,
        associated_token::mint = share_mint, associated_token::authority = investor,
        associated_token::token_program = share_program
    )]
    pub investor_shares: Box<InterfaceAccount<'info, TokenAccount>>,
    pub share_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    pub investor: Signer<'info>,
    #[account(mut, has_one = vault, has_one = usdc_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut, seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint)]
    pub investor_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
    /// Required only when the position has pending equity payouts.
    #[account(mut)]
    pub payout_pool: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
}

#[derive(Accounts)]
pub struct FounderCampaign<'info> {
    pub founder: Signer<'info>,
    #[account(mut, has_one = founder)]
    pub campaign: Box<Account<'info, Campaign>>,
}

#[derive(Accounts)]
#[instruction(index: u8, round: u8)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(mut)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(seeds = [b"position", campaign.key().as_ref(), voter.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(
        init, payer = voter, space = 8 + VoteRecord::INIT_SPACE,
        seeds = [b"vote", campaign.key().as_ref(), &[index], &[round], position.key().as_ref()], bump
    )]
    pub vote_record: Account<'info, VoteRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FinalizeVote<'info> {
    pub caller: Signer<'info>,
    #[account(mut, has_one = vault, has_one = usdc_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = campaign.founder)]
    pub founder_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReviewerDecide<'info> {
    pub reviewer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = reviewer)]
    pub config: Box<Account<'info, Config>>,
    pub inner: FinalizeVote<'info>,
}

#[derive(Accounts)]
pub struct Permissionless<'info> {
    pub caller: Signer<'info>,
    #[account(mut)]
    pub campaign: Box<Account<'info, Campaign>>,
}

#[derive(Accounts)]
pub struct ExitPosition<'info> {
    pub investor: Signer<'info>,
    #[account(mut, has_one = vault, has_one = usdc_mint, has_one = share_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut, seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint)]
    pub investor_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = share_mint, token::authority = investor)]
    pub investor_shares: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub share_program: Interface<'info, TokenInterface>,
    /// Required only when the position has pending equity payouts.
    #[account(mut)]
    pub payout_pool: Option<Box<InterfaceAccount<'info, TokenAccount>>>,
}

#[derive(Accounts)]
pub struct ClaimFounderShares<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, has_one = founder, has_one = share_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed, payer = founder,
        associated_token::mint = share_mint, associated_token::authority = founder,
        associated_token::token_program = share_program
    )]
    pub founder_shares: Box<InterfaceAccount<'info, TokenAccount>>,
    pub share_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(period: u32)]
pub struct DepositPayout<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, has_one = founder, has_one = usdc_mint)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(
        init_if_needed, payer = founder, space = 8 + PayoutPeriod::INIT_SPACE,
        seeds = [b"payout", campaign.key().as_ref(), &period.to_le_bytes()], bump
    )]
    pub payout_period: Box<Account<'info, PayoutPeriod>>,
    #[account(
        init_if_needed, payer = founder, seeds = [b"payout_pool", campaign.key().as_ref()], bump,
        token::mint = usdc_mint, token::authority = campaign, token::token_program = usdc_program
    )]
    pub payout_pool: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = founder)]
    pub founder_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(period: u32)]
pub struct MarkLate<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(
        init, payer = caller, space = 8 + PayoutPeriod::INIT_SPACE,
        seeds = [b"payout", campaign.key().as_ref(), &period.to_le_bytes()], bump
    )]
    pub payout_period: Box<Account<'info, PayoutPeriod>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    pub investor: Signer<'info>,
    #[account(has_one = usdc_mint, has_one = payout_pool)]
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut, seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(mut, seeds = [b"payout_pool", campaign.key().as_ref()], bump)]
    pub payout_pool: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint)]
    pub investor_usdc: Box<InterfaceAccount<'info, TokenAccount>>,
    pub usdc_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct RegisterToken<'info> {
    #[account(mut)]
    pub founder: Signer<'info>,
    #[account(mut, has_one = founder)]
    pub campaign: Box<Account<'info, Campaign>>,
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init, payer = founder, seeds = [b"token_vault", campaign.key().as_ref()], bump,
        token::mint = token_mint, token::authority = campaign, token::token_program = token_program
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = token_mint, token::authority = founder)]
    pub founder_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimTokens<'info> {
    pub investor: Signer<'info>,
    pub campaign: Box<Account<'info, Campaign>>,
    #[account(mut, seeds = [b"position", campaign.key().as_ref(), investor.key().as_ref()], bump = position.bump)]
    pub position: Box<Account<'info, Position>>,
    #[account(address = campaign.token_terms.mint)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, seeds = [b"token_vault", campaign.key().as_ref()], bump)]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = token_mint)]
    pub investor_token: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

// ------------------------------------------------------------------ events

#[event] pub struct ConfigInitialized { pub admin: Pubkey, pub reviewer: Pubkey, pub fee_bps: u16 }
#[event] pub struct AdminTransferred { pub old_admin: Pubkey, pub new_admin: Pubkey }
#[event] pub struct CampaignCreated { pub campaign: Pubkey, pub founder: Pubkey, pub goal: u64, pub equity_bps: u16, pub category: u8, pub offering_kind: u8 }
#[event] pub struct PayoutDeposited { pub campaign: Pubkey, pub period: u32, pub gross_amount: u64, pub amount: u64, pub status: u8, pub late_streak: u8 }
#[event] pub struct PayoutMarkedLate { pub campaign: Pubkey, pub period: u32, pub late_streak: u8, pub payout_default: bool }
#[event] pub struct PayoutDefault { pub campaign_id: u64, pub founder: Pubkey }
/// No per-investor amount emitted (privacy).
#[event] pub struct PayoutClaimed { pub campaign: Pubkey }
#[event] pub struct TokenRegistered { pub campaign: Pubkey, pub mint: Pubkey, pub deposited: u64 }
#[event] pub struct TokensClaimed { pub campaign: Pubkey }
#[event] pub struct TokenOverdue { pub campaign: Pubkey }
#[event] pub struct CampaignApproved { pub campaign: Pubkey }
/// No per-investor amount is emitted (privacy); only public aggregates.
#[event] pub struct Invested { pub campaign: Pubkey, pub raised_total: u64, pub investor_count: u32 }
#[event] pub struct RaiseClosed { pub campaign: Pubkey, pub success: bool, pub founder_net: u64, pub fee: u64 }
#[event] pub struct Refunded { pub campaign: Pubkey, pub amount: u64 }
#[event] pub struct EvidenceSubmitted { pub campaign: Pubkey, pub index: u8, pub uri: String, pub vote_end: i64 }
#[event] pub struct VoteCast { pub campaign: Pubkey, pub index: u8, pub round: u8 }
#[event] pub struct MilestoneReleased { pub campaign: Pubkey, pub index: u8, pub amount: u64 }
#[event] pub struct MilestoneRejected { pub campaign: Pubkey, pub index: u8, pub resubmit_deadline: i64 }
#[event] pub struct CampaignRefunding { pub campaign: Pubkey, pub index: u8 }
#[event] pub struct VotingExtended { pub campaign: Pubkey, pub index: u8, pub vote_end: i64 }
#[event] pub struct ReviewerRequired { pub campaign: Pubkey, pub index: u8 }
#[event] pub struct PositionExited { pub campaign: Pubkey, pub amount: u64 }
#[event] pub struct FounderVested { pub campaign: Pubkey, pub vested: u64, pub claimed_now: u64 }
#[event] pub struct SpendingRecorded { pub campaign: Pubkey, pub amount: u64, pub category: String, pub memo_uri: String, pub total_spent: u64 }

// ------------------------------------------------------------------ errors

#[error_code]
pub enum HarvestiaError {
    #[msg("math overflow")] MathOverflow,
    #[msg("invalid fee")] InvalidFee,
    #[msg("invalid goal")] InvalidGoal,
    #[msg("invalid equity bps")] InvalidEquity,
    #[msg("invalid upfront bps")] InvalidUpfront,
    #[msg("too many milestones (max 8)")] TooManyMilestones,
    #[msg("at least one milestone required")] NoMilestones,
    #[msg("upfront + milestone releases must equal goal")] MilestoneSumMismatch,
    #[msg("milestone amount must be > 0")] InvalidMilestoneAmount,
    #[msg("invalid deadline")] InvalidDeadline,
    #[msg("invalid min investors")] InvalidMinInvestors,
    #[msg("invalid status for this action")] InvalidStatus,
    #[msg("raise closed")] RaiseClosed,
    #[msg("raise still open")] RaiseStillOpen,
    #[msg("amount must be > 0")] ZeroAmount,
    #[msg("exceeds goal")] ExceedsGoal,
    #[msg("nothing to refund")] NothingToRefund,
    #[msg("wrong milestone")] WrongMilestone,
    #[msg("uri empty or too long")] UriTooLong,
    #[msg("resubmission window closed")] ResubmitWindowClosed,
    #[msg("voting closed")] VotingClosed,
    #[msg("voting still open")] VotingStillOpen,
    #[msg("already voted")] AlreadyVoted,
    #[msg("no voting weight")] NoVotingWeight,
    #[msg("exit window closed")] ExitWindowClosed,
    #[msg("insufficient shares")] InsufficientShares,
    #[msg("spending exceeds released funds")] OverSpend,
    #[msg("invalid category")] InvalidCategory,
    #[msg("invalid offering")] InvalidOffering,
    #[msg("invalid payout terms")] InvalidPayoutTerms,
    #[msg("invalid token terms")] InvalidTokenTerms,
    #[msg("campaign has no equity payout offering")] NoPayoutOffering,
    #[msg("campaign has no token offering")] NoTokenOffering,
    #[msg("payout below gross x share_bps")] PayoutTooSmall,
    #[msg("payout period not ended")] PeriodNotEnded,
    #[msg("payout period not yet due")] PeriodNotDue,
    #[msg("wrong payout period")] WrongPeriod,
    #[msg("period already paid")] AlreadyPaid,
    #[msg("no outstanding shares")] NoShares,
    #[msg("token already registered")] TokenAlreadyRegistered,
    #[msg("token not registered")] TokenNotRegistered,
    #[msg("nothing to claim")] NothingToClaim,
    #[msg("treasury must be the admin's USDC token account")] InvalidTreasury,
    #[msg("invalid admin / reviewer key")] InvalidAdmin,
}

impl From<LogicError> for HarvestiaError {
    fn from(e: LogicError) -> Self {
        use HarvestiaError as H;
        use LogicError as L;
        match e {
            L::MathOverflow => H::MathOverflow,
            L::InvalidFee => H::InvalidFee,
            L::InvalidGoal => H::InvalidGoal,
            L::InvalidEquity => H::InvalidEquity,
            L::InvalidUpfront => H::InvalidUpfront,
            L::TooManyMilestones => H::TooManyMilestones,
            L::NoMilestones => H::NoMilestones,
            L::MilestoneSumMismatch => H::MilestoneSumMismatch,
            L::InvalidMilestoneAmount => H::InvalidMilestoneAmount,
            L::InvalidDeadline => H::InvalidDeadline,
            L::InvalidMinInvestors => H::InvalidMinInvestors,
            L::InvalidStatus => H::InvalidStatus,
            L::RaiseClosed => H::RaiseClosed,
            L::RaiseStillOpen => H::RaiseStillOpen,
            L::ZeroAmount => H::ZeroAmount,
            L::ExceedsGoal => H::ExceedsGoal,
            L::NothingToRefund => H::NothingToRefund,
            L::WrongMilestone => H::WrongMilestone,
            L::UriTooLong => H::UriTooLong,
            L::ResubmitWindowClosed => H::ResubmitWindowClosed,
            L::VotingClosed => H::VotingClosed,
            L::VotingStillOpen => H::VotingStillOpen,
            L::AlreadyVoted => H::AlreadyVoted,
            L::NoVotingWeight => H::NoVotingWeight,
            L::ExitWindowClosed => H::ExitWindowClosed,
            L::InsufficientShares => H::InsufficientShares,
            L::OverSpend => H::OverSpend,
            L::InvalidCategory => H::InvalidCategory,
            L::InvalidOffering => H::InvalidOffering,
            L::InvalidPayoutTerms => H::InvalidPayoutTerms,
            L::InvalidTokenTerms => H::InvalidTokenTerms,
            L::NoPayoutOffering => H::NoPayoutOffering,
            L::NoTokenOffering => H::NoTokenOffering,
            L::PayoutTooSmall => H::PayoutTooSmall,
            L::PeriodNotEnded => H::PeriodNotEnded,
            L::PeriodNotDue => H::PeriodNotDue,
            L::WrongPeriod => H::WrongPeriod,
            L::AlreadyPaid => H::AlreadyPaid,
            L::NoShares => H::NoShares,
            L::TokenAlreadyRegistered => H::TokenAlreadyRegistered,
            L::InvalidTreasury => H::InvalidTreasury,
            L::InvalidAdmin => H::InvalidAdmin,
            L::TokenNotRegistered => H::TokenNotRegistered,
            L::NothingToClaim => H::NothingToClaim,
        }
    }
}
