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

## Sample campaigns (v3) — replaces ALL previous demo projects
Remove FreshBox, SunShare Co-op, Lantern Games, Tidepool, Kiln Coffee, SolGrid, MediLink, Terroir, KitchenOS, GreenHaul and any other demo campaign everywhere (API seed, web mock data, landing copy, tickers, links like /app/vote/freshbox).
Both campaigns below are FICTIONAL samples: every campaign object carries `sample: true` and the UI shows a "SAMPLE" stamp. Founders are fictional; avatars are designed monograms (no photos of real people).

### 1. Zentrove — crypto (id: "zentrove")
Tagline: "Private stablecoin payroll for remote teams." Category crypto. Founder (public, fictional): Imani Vale, CEO — ex-payments engineer.
Problem: paying a remote team in stablecoins exposes every salary on a public chain. Solution: payroll that settles USDC on Solana with amounts shielded, plus compliant payslips.
Offering: kind "token" — symbol ZTRV, totalSupply 1,000,000,000, investorAllocationBps 1500, targetLaunchDate 2027-06-30, vesting { cliffMonths 3, months 12 }.
Goal $750,000, upfrontBps 2000 ($150,000). Milestones: M1 "Private payroll live on mainnet beta" (month 3, $200,000); M2 "100 teams running payroll" (month 6, $200,000); M3 "ZTRV launch + $1M monthly payroll volume" (month 9, $200,000).
Status Raising: raisedUsdc 286,000, investorCount 41, raiseDeadline = now + 21 days.

### 2. Ferrolab — tech (id: "ferrolab")
Tagline: "AI inspection cameras for small factories." Category saas (hardware + software). Founder (public, fictional): Tomas Rieger, CEO — former manufacturing-line engineer.
Problem: small factories catch defects by eye, losing 3–5% of output to scrap and returns. Solution: a plug-in camera + model that flags defects on the line, sold as a monthly subscription.
Offering: kind "equity" — equityBps 1200, payout { basis "revenue", shareBps 700, frequency "monthly", startsAfterDays 90 }.
Goal $500,000, upfrontBps 2000 ($100,000). Milestones: M1 "50 cameras installed at paying factories" (month 3, $150,000) — Released; M2 "$40k monthly recurring revenue" (month 6, $150,000) — Voting now; M3 "3 enterprise contracts signed" (month 9, $100,000) — Pending.
Status Active: raise closed 130 days ago, fully raised $500,000, investorCount 63. Payout ledger: 1 period paid ON_TIME (revenue $31,400 → $2,198 to investors). Public spending ledger: 4 entries (camera hardware batch, ML engineer contract, factory pilot installs, sales travel).

## Treasury mode (v4) — company wallet controls everything, no custom on-chain program
Decision: the Anchor programs are NOT deployed. Money flows through a company-controlled treasury wallet instead.
- TREASURY_WALLET = DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx (public address only; nobody but the company holds its key).
- Cluster: Solana mainnet. USDC mint EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (6 decimals).
- Invest: investor connects a wallet (Wallet Standard: Phantom, Solflare, Backpack) and signs a plain SPL USDC transfer from their USDC account to the treasury wallet's USDC associated token account (create-ATA-idempotent instruction included, paid by investor, so it works even if the ATA doesn't exist yet). Memo instruction with "harvestia:<campaignId>:<commitment>" so deposits are attributable. After confirmation the browser POSTs { txSignature } to the API.
- API verifies on mainnet: tx succeeded, contains a USDC transfer (transferChecked or transfer) whose destination is the treasury ATA, mint is USDC, memo matches the campaign, signature not seen before; then records the investment and increases raisedUsdc by the verified amount.
- Sample campaigns (sample: true) can NEVER accept real money: UI disables the button ("Sample campaign — investing disabled") and the API rejects.
- Releases & refunds: performed by the company wallet. An admin page /app/admin, visible only when the connected wallet == TREASURY_WALLET, lists actions due (milestone released by vote → pay founder payout address; failed raise / failed milestone → refunds per investor pro-rata; monthly payout distributions) and builds the USDC transfer(s) for the company wallet to sign; the API then verifies and records them.
- RPC: the browser never sees an API key. API exposes POST /rpc (JSON-RPC proxy with a method allowlist: getLatestBlockhash, getAccountInfo, getBalance, getTokenAccountsByOwner, getSignatureStatuses, sendTransaction, simulateTransaction, getTransaction, getMinimumBalanceForRentExemption, getTokenAccountBalance) using HELIUS_API_KEY if set, else the public mainnet RPC. Rate-limited per IP.
- Honesty: funds are custodial (held by the company treasury wallet, publicly auditable on Solscan), released by the company after investor votes — NOT by code. Mainnet USDC transfers are visible on-chain; Helius Privacy Rings integration stays behind PRIVACY_MODE=helius and is not enabled by default.
Env — API (Railway): TREASURY_MODE=on, SOLANA_CLUSTER=mainnet, TREASURY_WALLET, USDC_MINT, HELIUS_API_KEY (optional, user adds). Web (Vercel): NEXT_PUBLIC_SOLANA_CLUSTER=mainnet, NEXT_PUBLIC_TREASURY_WALLET, NEXT_PUBLIC_USDC_MINT; RPC always via {API}/rpc.
