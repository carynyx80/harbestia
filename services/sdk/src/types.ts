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
  /** true for fictional sample/demo campaigns seeded by the API (UI shows a "SAMPLE" stamp). Absent on real campaigns. */
  sample?: boolean;
  /** Offerings (v2). Optional for backward compatibility with v1 campaigns. */
  category?: CampaignCategory;
  offering?: Offering;
  /** Helius Privacy Rings ring/deposit account for this campaign (helius mode). */
  ringAccount?: string;
  /** Computed by the API when offering has an equity block. */
  payoutStatus?: PayoutStatus;
  /** Computed by the API when offering has a token block. */
  tokenStatus?: TokenStatus;
  /** Public flags computed by the API, e.g. "PayoutDefault", "TokenOverdue". */
  flags?: CampaignFlag[];
}

// ---- Offerings (v2) ----
export type CampaignCategory = "business" | "crypto" | "consumer" | "saas" | "hardware" | "creator" | "other";
export type OfferingKind = "equity" | "token" | "both";
export type PayoutBasis = "revenue" | "profit";
export type CampaignFlag = "PayoutDefault" | "TokenOverdue";

export interface EquityPayout {
  basis: PayoutBasis;
  /** Portion of monthly revenue/profit paid to investors, bps. */
  shareBps: number;
  frequency: "monthly";
  /** Grace period before the first payout period starts (default 90). */
  startsAfterDays: number;
}

export interface EquityOffering {
  /** Share of company sold to investors, bps. */
  equityBps: number;
  payout: EquityPayout;
}

export interface TokenVesting {
  /** Default 0. */
  cliffMonths: number;
  /** Default 12, linear from launch. */
  months: number;
}

export interface TokenOffering {
  symbol: string;
  totalSupply: number;
  /** Share of supply reserved for investors, bps. */
  investorAllocationBps: number;
  /** ISO-8601 */
  targetLaunchDate: string;
  vesting: TokenVesting;
}

export interface Offering {
  kind: OfferingKind;
  equity?: EquityOffering;
  token?: TokenOffering;
}

/** ON_TIME/LATE per SPEC; DUE = period ended, still inside its 15-day grace, unpaid. */
export type PayoutPeriodStatus = "ON_TIME" | "LATE" | "DUE";

export interface PayoutEntry {
  /** 1-based payout period number. */
  period: number;
  periodStart: string;
  periodEnd: string;
  /** periodEnd + 15 days. */
  dueDate: string;
  basis: PayoutBasis;
  /** Reported gross revenue/profit for the period (public report). */
  basisAmountUsdc: number | null;
  /** Amount deposited into the PayoutPool (basis x shareBps). */
  paidUsdc: number;
  status: PayoutPeriodStatus;
  depositedAt: string | null;
  reportUri: string | null;
  txSig: string | null;
}

export interface PayoutStatus {
  /** Due date of the earliest unpaid period (may be in the past if overdue). */
  nextDueDate: string;
  lastPaidPeriod: number | null;
  consecutiveLate: number;
  defaulted: boolean;
}

export interface TokenStatus {
  launched: boolean;
  mint: string | null;
  overdue: boolean;
  /** Additive extras. */
  launchedAt?: string | null;
  investorAllocation?: number;
  overdueAt?: string;
}

export interface PayoutLedger {
  campaignId: string;
  basis: PayoutBasis;
  shareBps: number;
  entries: PayoutEntry[];
  payoutStatus: PayoutStatus;
}

export interface DepositPayoutInput {
  /** 1-based period number. */
  period: number;
  /** Gross revenue or profit for the period (per offering.equity.payout.basis). */
  basisAmountUsdc: number;
  /** Optional; if given must equal floor(basisAmountUsdc x shareBps / 10000) to the cent. */
  amountUsdc?: number;
  reportUri?: string;
  txSig?: string;
}

export interface ClaimInput {
  positionCommitment: string;
  proof: string;
}

export interface ClaimResult {
  claimId: string;
  positionCommitment: string;
  /** Claim amount encrypted for the investor (mockenc1: in mock mode). */
  encryptedClaim: string;
}

export interface RegisterTokenInput {
  mint: string;
  /** Tokens deposited into the TokenVault; must equal the investor allocation. */
  depositAmount: number;
  txSig?: string;
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
  /** Required unless offering is given (then defaults to offering.equity.equityBps, or 0 for token-only). */
  equityBps?: number;
  upfrontBps?: number;
  raiseDeadline: string;
  minInvestors?: number;
  category?: CampaignCategory;
  /** Helius Privacy Rings ring/deposit account (base58). Required to accept investments in helius mode. */
  ringAccount?: string;
  offering?: {
    kind: OfferingKind;
    equity?: { equityBps: number; payout: { basis: PayoutBasis; shareBps: number; frequency?: "monthly"; startsAfterDays?: number } };
    token?: { symbol: string; totalSupply: number; investorAllocationBps: number; targetLaunchDate: string; vesting?: { cliffMonths?: number; months?: number } };
  };
  milestones: { title: string; description: string; releaseUsdc: number; deadline: string }[];
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

// ---- Privacy mode (mock | helius) ----
export type PrivacyMode = "mock" | "helius";
export type SolanaCluster = "devnet" | "mainnet";
export interface ApiConfig { privacyMode: PrivacyMode; cluster: SolanaCluster; ringProgramId: string }

/** Helius mode: the investor's browser wallet signs and sends the shield (deposit) tx, then submits its signature. */
export interface InvestWithSignatureInput {
  txSignature: string;
  /** Hex commitment to the hidden position (no plaintext amount). */
  commitment: string;
  viewKeyHash?: string;
  encryptedNote?: string;
}
export interface InvestWithSignatureResult {
  receiptId: string;
  status: "confirmed";
  txSignature: string;
  slot: number;
  investorCount: number;
  amountRevealedTotal: number;
}
/** Helius mode: claims/refunds settle via an on-chain unshield signed by the investor's wallet. */
export interface AwaitingWithdrawal {
  status: "awaiting_onchain_withdrawal";
  kind: "payout" | "token" | "refund";
  campaignId: string;
  privacyMode: PrivacyMode;
  cluster: SolanaCluster;
  ringProgramId: string;
  ringAccount: string | null;
  instructions: string[];
}
