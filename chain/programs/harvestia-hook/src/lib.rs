//! Harvestia share transfer hook (Token-2022): KYC allowlist + 12-month lockup.
//! Rule implemented in `harvestia::logic::is_transfer_allowed` (SPEC rule 4, mirrored here to
//! avoid a cross-program crate dependency). The privacy layer issues allowlist
//! entries after a ZK "KYC-verified" credential is checked.
//!
//! STUB: Execute is dispatched via the fallback using the spl-transfer-hook
//! interface discriminator; the ExtraAccountMetaList must list
//! [hook_config PDA, src allowlist PDA, dst allowlist PDA]. Not verified on-chain
//! (no Solana CLI / build-sbf in this environment).
use anchor_lang::prelude::*;

declare_id!("ED26KMhQDKqF3UXH1tSemGwj5rB6n7nKH46jkQY8vQDG");

/// sha256("spl-transfer-hook-interface:execute")[..8] (verified with python hashlib)
pub const EXECUTE_DISCRIMINATOR: [u8; 8] = [105, 37, 101, 197, 75, 251, 102, 26];

/// SPEC rule 4: both sides allowlisted and lockup `[close, lockup_ends_at)` elapsed.
pub fn is_transfer_allowed(now: i64, lockup_ends_at: i64, sender_allowlisted: bool, receiver_allowlisted: bool) -> bool {
    sender_allowlisted && receiver_allowlisted && now >= lockup_ends_at
}

#[program]
pub mod harvestia_hook {
    use super::*;

    /// Per-mint config: lockup end copied from Campaign.lockup_ends_at (set at close_raise).
    pub fn init_hook_config(ctx: Context<InitHookConfig>, lockup_ends_at: i64) -> Result<()> {
        require!(lockup_ends_at > 0, HookError::LockupNotSet);
        let h = &mut ctx.accounts.hook_config;
        h.mint = ctx.accounts.mint.key();
        h.authority = ctx.accounts.authority.key();
        h.lockup_ends_at = lockup_ends_at;
        h.bump = ctx.bumps.hook_config;
        Ok(())
    }

    pub fn set_allowlist(ctx: Context<SetAllowlist>, wallet: Pubkey, allowed: bool) -> Result<()> {
        let e = &mut ctx.accounts.entry;
        e.wallet = wallet;
        e.allowed = allowed;
        e.bump = ctx.bumps.entry;
        emit!(AllowlistUpdated { mint: ctx.accounts.hook_config.mint, wallet, allowed });
        Ok(())
    }

    /// Token-2022 Execute entry (invoked through `fallback` routing below).
    pub fn transfer_hook(ctx: Context<TransferHook>, _amount: u64) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            is_transfer_allowed(now, ctx.accounts.hook_config.lockup_ends_at, ctx.accounts.src_entry.allowed, ctx.accounts.dst_entry.allowed),
            HookError::TransferBlocked
        );
        Ok(())
    }

    pub fn fallback<'info>(program_id: &Pubkey, accounts: &'info [AccountInfo<'info>], data: &[u8]) -> Result<()> {
        if data.len() >= 16 && data[..8] == EXECUTE_DISCRIMINATOR {
            let amount = u64::from_le_bytes(data[8..16].try_into().unwrap());
            let mut ix = Vec::with_capacity(16);
            ix.extend_from_slice(&instruction::TransferHook::DISCRIMINATOR);
            ix.extend_from_slice(&amount.to_le_bytes());
            return __private::__global::transfer_hook(program_id, accounts, &ix[8..]);
        }
        Err(ProgramError::InvalidInstructionData.into())
    }
}

#[account]
#[derive(InitSpace)]
pub struct HookConfig { pub mint: Pubkey, pub authority: Pubkey, pub lockup_ends_at: i64, pub bump: u8 }

#[account]
#[derive(InitSpace)]
pub struct AllowEntry { pub wallet: Pubkey, pub allowed: bool, pub bump: u8 }

#[derive(Accounts)]
pub struct InitHookConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: share mint
    pub mint: UncheckedAccount<'info>,
    #[account(init, payer = authority, space = 8 + HookConfig::INIT_SPACE, seeds = [b"hook", mint.key().as_ref()], bump)]
    pub hook_config: Account<'info, HookConfig>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(wallet: Pubkey)]
pub struct SetAllowlist<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = authority)]
    pub hook_config: Account<'info, HookConfig>,
    #[account(init_if_needed, payer = authority, space = 8 + AllowEntry::INIT_SPACE,
        seeds = [b"allow", hook_config.mint.as_ref(), wallet.as_ref()], bump)]
    pub entry: Account<'info, AllowEntry>,
    pub system_program: Program<'info, System>,
}

/// Account order follows the transfer-hook interface: source, mint, destination,
/// owner, extra-account-meta-list, then extra accounts.
#[derive(Accounts)]
pub struct TransferHook<'info> {
    /// CHECK: source token account
    pub source: UncheckedAccount<'info>,
    /// CHECK: mint
    pub mint: UncheckedAccount<'info>,
    /// CHECK: destination token account
    pub destination: UncheckedAccount<'info>,
    /// CHECK: source owner
    pub owner: UncheckedAccount<'info>,
    /// CHECK: ExtraAccountMetaList PDA
    #[account(seeds = [b"extra-account-metas", mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [b"hook", mint.key().as_ref()], bump = hook_config.bump)]
    pub hook_config: Account<'info, HookConfig>,
    pub src_entry: Account<'info, AllowEntry>,
    pub dst_entry: Account<'info, AllowEntry>,
}

#[event]
pub struct AllowlistUpdated { pub mint: Pubkey, pub wallet: Pubkey, pub allowed: bool }

#[error_code]
pub enum HookError {
    #[msg("transfer blocked: wallet not allowlisted or shares still locked")]
    TransferBlocked,
    #[msg("lockup_ends_at must be set (campaign closed)")]
    LockupNotSet,
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lockup_and_allowlist() {
        let lock = 1_800_000_000 + 365 * 86_400;
        assert!(is_transfer_allowed(lock, lock, true, true)); // exactly at lockup end: allowed
        assert!(!is_transfer_allowed(lock - 1, lock, true, true));
        assert!(!is_transfer_allowed(lock, lock, true, false));
        assert!(!is_transfer_allowed(lock, lock, false, true));
    }
}
