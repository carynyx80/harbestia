// Copied from services/sdk/src/types.ts (Turbopack can't resolve the file: dependency outside the web root).
// Shared Harvestia domain types. Names match SPEC.md "Domain model" exactly.

export type CampaignStatus = "Draft" | "Raising" | "Active" | "Completed" | "Failed" | "Refunding";
export type MilestoneStatus = "Pending" | "Voting" | "Released" | "Rejected" | "Resubmitted" | "Refunded";

export interface Milestone {
  index: number;
  title: string;
  description: string;
  releaseUsdc: number;
  /** ISO-8601 */
  deadline: string;
  status: MilestoneStatus;
  evidenceUri: string | null;
  resubmitUsed: boolean;
}

/** Public founder spending report line. */
export interface SpendEntry {
  id: string;
  /** ISO-8601 */
  date: string;
  description: string;
  amountUsdc: number;
  milestoneIndex: number | null;
  txSig: string | null;
}

export interface Campaign {
  id: string;
  /** Founder Solana pubkey (public, accountable). */
  founder: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  useOfFunds: string[];
  goalUsdc: number;
  /** Public total only (revealed by Arcium MPC sum). Individual amounts are never exposed. */
  raisedUsdc: number;
  /** Investor equity in basis points, e.g. 1000 = 10%. */
  equityBps: number;
  /** Upfront release in bps of goal, default 2000. */
  upfrontBps: number;
  /** ISO-8601 */
  raiseDeadline: string;
  minInvestors: number;
  status: CampaignStatus;
  milestones: Milestone[];
  spending: SpendEntry[];
  /** ISO-8601: raise close + 365 days; share transfers blocked before this (API adds it). */
  lockupEndsAt?: string;
  /** Offerings (v2) — optional until the API deploys. */
  category?: CampaignCategory;
  offering?: Offering;
  /** Public flags (v2). */
  flags?: CampaignFlag[];
}

// ---- Offerings (v2) ----
export type CampaignCategory = "business" | "crypto" | "consumer" | "saas" | "hardware" | "creator" | "other";
export type OfferingKind = "equity" | "token" | "both";
export type PayoutBasis = "revenue" | "profit";
export type CampaignFlag = "PayoutDefault" | "TokenOverdue";

export interface EquityPayoutTerms {
  basis: PayoutBasis;
  /** Portion of monthly revenue/profit paid to investors, bps. */
  shareBps: number;
  frequency: "monthly";
  /** Grace period before first payout, default 90. */
  startsAfterDays: number;
}
export interface EquityOffering {
  /** Share of company sold to investors, bps. */
  equityBps: number;
  payout: EquityPayoutTerms;
}
export interface TokenOffering {
  symbol: string;
  totalSupply: number;
  /** Share of supply reserved for investors, bps. */
  investorAllocationBps: number;
  /** ISO-8601 */
  targetLaunchDate: string;
  vesting: { cliffMonths: number; months: number };
  /** Set after register_token(mint). */
  mint?: string | null;
  /** ISO-8601 launch (register) time, if launched. */
  launchedAt?: string | null;
}
export interface Offering {
  kind: OfferingKind;
  equity?: EquityOffering;
  token?: TokenOffering;
}

export type PayoutStatus = "ON_TIME" | "LATE";
/** Public monthly payout ledger row. */
export interface PayoutEntry {
  /** API: 1-based period number; UI normalizes to a "YYYY-MM" label. */
  period: string | number;
  periodStart?: string;
  periodEnd?: string;
  dueDate?: string;
  reportUri?: string | null;
  /** Gross revenue or profit reported for the period. */
  basisAmountUsdc: number;
  /** Amount deposited for investors = basis × shareBps. */
  paidUsdc: number;
  status: PayoutStatus;
  /** ISO-8601 */
  depositedAt: string | null;
  txSig?: string | null;
}
/** GET /campaigns/:id/payouts response. */
export interface PayoutLedger {
  campaignId: string;
  basis: PayoutBasis;
  shareBps: number;
  entries: PayoutEntry[];
}
export interface PayoutDepositInput {
  period: string | number;
  basisAmountUsdc: number;
  amountUsdc: number;
}
export interface PayoutClaimInput {
  positionCommitment: string;
  proof: string;
}
export interface EncryptedClaim {
  encryptedClaim: string;
  claimId?: string;
}
export interface RegisterTokenInput {
  mint: string;
  depositAmount: number;
}
export interface TokenClaimInput {
  positionCommitment: string;
  proof: string;
}

/** Public, non-identifying vote round metadata (no per-voter data). */
export interface VoteRound {
  campaignId: string;
  milestoneIndex: number;
  opensAt: string;
  closesAt: string;
  ballots: number;
  quorumFailures: number;
  appealToReviewer: boolean;
  /** Exit window (7 days) after the last finalized vote, if any. */
  exitWindowClosesAt: string | null;
}

export type VoteOutcome = "Approved" | "Rejected" | "QuorumFailed";

export interface TallyResult {
  outcome: VoteOutcome;
  /** Fractions in [0,1] of total stake; only aggregates are revealed. */
  turnout: number;
  yesShare: number;
}

// ---- Request bodies ----
export interface CreateCampaignInput {
  founder: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  useOfFunds: string[];
  goalUsdc: number;
  equityBps: number;
  upfrontBps?: number;
  raiseDeadline: string;
  minInvestors?: number;
  milestones: { title: string; description: string; releaseUsdc: number; deadline: string }[];
  category?: CampaignCategory;
  offering?: Offering;
}

export interface InvestInput {
  /** Pedersen/hash commitment to (amount, salt). */
  commitment: string;
  /** Amount encrypted to the Arcium MXE cluster key. Server never decrypts it. */
  ciphertext: string;
  /** ZK proof (KYC membership + clean funds + range). */
  proof: string;
  /** Optional: hash of investor's view key, to index an encrypted portfolio note. */
  viewKeyHash?: string;
  /** Optional: note encrypted to the investor's own view key. */
  encryptedNote?: string;
}

export interface InvestResult {
  receiptId: string;
  amountRevealedTotal: number;
  investorCount: number;
}

export interface VoteInput {
  nullifier: string;
  encryptedVote: string;
  proof: string;
}

export interface EvidenceInput {
  evidenceUri: string;
}

export interface SpendingInput {
  date?: string;
  description: string;
  amountUsdc: number;
  milestoneIndex?: number | null;
  txSig?: string | null;
}

export interface FinalizeResult {
  tally: TallyResult;
  milestone: Milestone;
  campaign: Campaign;
  round: VoteRound;
}

export interface PortfolioEntry {
  campaignId: string;
  receiptId: string;
  commitment: string;
  encryptedNote: string;
  createdAt: string;
}

export interface Portfolio {
  viewKeyHash: string;
  entries: PortfolioEntry[];
}

export interface ApiError {
  error: string;
  details?: unknown;
}
