# Harvestia — shared build spec (all agents read this)

Brand: **Harvestia** (harvestia.xyz). Tagline: "Fund founders. Stay invisible."
Pitch: Private, milestone-based equity launchpad on Solana. Founders are public and accountable;
investors are invisible (identity, amount, vote, exit). Money sits in a code-controlled safe and is
released per milestone only after an investor vote; missed milestones refund remaining funds.

## Repo layout (root = this folder) — each agent owns ONLY its folder
- `web/`        Next.js 16 + Tailwind v4 + framer-motion + lucide-react (frontend agents)
  - landing agent owns: `web/app/page.tsx`, `web/app/layout.tsx`, `web/app/globals.css`, `web/components/landing/**`, `web/components/ui/**`
  - app agent owns: `web/app/(app)/**`, `web/components/app/**`, `web/lib/mock.ts`
- `chain/`      Anchor workspace, program `harvestia` (chain agent)
- `privacy/`    Arcium encrypted-ixs, ZK circuits, Helius Rings adapter (privacy agent)
- `services/`   `api/` (Hono/Node REST + indexer), `tee-vault/` (KYC vault), `packages/sdk/` lives at `services/sdk/` (backend agent)

## Domain model (use these names everywhere)
Campaign { id, founder (pubkey, public), name, tagline, problem, solution, useOfFunds[], goalUsdc,
  raisedUsdc (public total), equityBps (investor equity, e.g. 1000 = 10%), upfrontBps (default 2000),
  raiseDeadline, minInvestors (default 25), status: Draft|Raising|Active|Completed|Failed|Refunding,
  milestones: Milestone[] , spending: SpendEntry[] (public) }
Milestone { index, title, description, releaseUsdc, deadline, status: Pending|Voting|Released|Rejected|Resubmitted|Refunded,
  evidenceUri, resubmitUsed: bool }
Vote: private, weighted by hidden stake, cap 10% of total weight per voter, quorum 20% of stake,
  7-day window, one resubmission (30 days) after a No, appeal to reviewer if quorum fails twice.
Exit: only during 7-day window after each vote; investor withdraws pro-rata share of locked funds; shares burned.
Shares: Token-2022 mint per campaign, transfer hook allowlist (KYC'd wallets), 12-month lockup.
Founder shares vest per released milestone.
Fees: 5% success fee on raise.

## Privacy mapping
- Helius Privacy Rings: deposits, balances, refunds (amounts hidden)
- Arcium (MPC): weighted vote tally with cap, total-raised sum, pro-rata refund math
- ZK: "KYC-verified" credential, one-vote nullifier, refund-claim proof, investor badge, clean-funds proof
- TEE: KYC document vault, regulator-access audit log
- Shielded pool: unlink public wallet from investment

## Demo campaign: FreshBox — goal $500,000, 10% equity, milestones: App live (M3, $150k),
1,000 paying customers (M6, $150k), $20k MRR (M9, $100k); upfront $100k.

## Offerings (v2) — any startup: businesses, crypto projects, anything
Campaign gets `category` (business | crypto | consumer | saas | hardware | creator | other) and an `offering`.
Founder chooses `offering.kind`: "equity" | "token" | "both".

### Equity with monthly payouts (`offering.equity`)
{ equityBps (share of company sold to investors, e.g. 1000 = 10%),
  payout: { basis: "revenue" | "profit", shareBps (portion of monthly revenue/profit paid to investors, e.g. 1000 = 10%),
            frequency: "monthly", startsAfterDays (grace period before first payout, default 90) } }
- Each month the founder deposits the payout in USDC into the campaign PayoutPool with a public report (period, gross revenue/profit, amount = basis × shareBps).
- Payouts are distributed pro-rata to share holders (founder-retained shares excluded). Investors claim privately (amounts via Helius Rings; pro-rata math via Arcium). Implementation: cumulative "payout-per-share" accumulator; each position tracks `payoutDebt`, claimable = shares × accPerShare − payoutDebt.
- A period with no deposit by its due date (period end + 15 days) is publicly marked LATE. 3 consecutive LATE periods → campaign flagged `PayoutDefault` (public) and investors get an extra exit/vote window on remaining locked funds.

### Token allocation (`offering.token`)
{ symbol, totalSupply, investorAllocationBps (share of supply reserved for investors, e.g. 1500 = 15%),
  targetLaunchDate, vesting: { cliffMonths (default 0), months (default 12, linear) } }
- Founder later calls `register_token(mint)` and deposits investorAllocation tokens into the TokenVault. Investors claim pro-rata to shares, vested linearly after the cliff from launch.
- If the token hasn't launched by targetLaunchDate + 180 days, the campaign is publicly flagged `TokenOverdue`.

### Both
Both blocks present; investors receive equity payouts AND token allocation pro-rata to their shares.

Milestone safe, private voting, refunds, exits and 5% success fee are unchanged for every offering kind.
New API endpoints: POST /campaigns/:id/payouts (founder deposits + report), GET /campaigns/:id/payouts (public ledger: period, basis amount, paid amount, status ON_TIME|LATE), POST /campaigns/:id/payouts/claim (body { positionCommitment, proof } → returns encrypted claim), POST /campaigns/:id/token (register mint + deposit), POST /campaigns/:id/token/claim.
