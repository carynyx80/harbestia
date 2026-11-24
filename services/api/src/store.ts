import { randomUUID } from "node:crypto";
import type { Campaign, Milestone, PortfolioEntry, VoteRound } from "@harvestia/sdk/types";
import { DAY_MS, VOTE_WINDOW_MS, accruePayout, payoutAmountUsdc, payoutPeriod, toMicro } from "./rules.js";
import type { SealedBallot } from "./privacy.js";

export interface RoundRecord extends VoteRound {
  ballotsSealed: SealedBallot[];
  nullifiers: Set<string>;
  finalizedAt: number | null;
}

/** Investor position (keyed by invest commitment). Stake stays encrypted; only MPC reads it. */
export interface PositionRecord { ciphertext: string; payoutDebt: bigint; tokensClaimed: number }
export interface PayoutDepositRecord { period: number; basisAmountUsdc: number; paidUsdc: number; depositedAt: number; reportUri: string | null; txSig: string | null }
export interface TokenLaunchRecord { mint: string; launchedAt: number; deposited: number; txSig: string | null }

export class Store {
  positions = new Map<string, Map<string, PositionRecord>>(); // campaignId -> commitment -> position
  payouts = new Map<string, PayoutDepositRecord[]>();
  payoutAcc = new Map<string, bigint>(); // micro-USDC per share x ACC_PRECISION
  tokens = new Map<string, TokenLaunchRecord>();
  claims = new Map<string, { campaignId: string; kind: "payout" | "token"; positionCommitment: string; at: number }>();

  /** Record a payout deposit and advance the accumulator (totalShares = investor stake). */
  recordPayout(campaignId: string, d: PayoutDepositRecord, totalShares: number) {
    const acc = accruePayout(this.payoutAcc.get(campaignId) ?? 0n, toMicro(d.paidUsdc), BigInt(Math.floor(totalShares)));
    this.payoutAcc.set(campaignId, acc);
    const list = this.payouts.get(campaignId) ?? [];
    list.push(d);
    list.sort((a, b) => a.period - b.period);
    this.payouts.set(campaignId, list);
  }

  campaigns = new Map<string, Campaign>();
  investorCount = new Map<string, number>();
  commitments = new Map<string, Set<string>>();
  rounds = new Map<string, RoundRecord>(); // key `${id}:${idx}`
  portfolio = new Map<string, PortfolioEntry[]>();

  roundKey(id: string, idx: number) { return `${id}:${idx}`; }

  openRound(id: string, idx: number, now: number, prev?: RoundRecord): RoundRecord {
    const r: RoundRecord = {
      campaignId: id, milestoneIndex: idx,
      opensAt: new Date(now).toISOString(), closesAt: new Date(now + VOTE_WINDOW_MS).toISOString(),
      ballots: 0, quorumFailures: prev?.quorumFailures ?? 0, appealToReviewer: false,
      exitWindowClosesAt: prev?.exitWindowClosesAt ?? null,
      ballotsSealed: [], nullifiers: new Set(), finalizedAt: null,
    };
    // Nullifiers are scoped per vote round (evidence submission, resubmission, or quorum re-run).
    this.rounds.set(this.roundKey(id, idx), r);
    return r;
  }

  publicRound(r: RoundRecord): VoteRound {
    const { ballotsSealed: _b, nullifiers: _n, finalizedAt: _f, ...pub } = r;
    return { ...pub, ballots: r.ballotsSealed.length };
  }

  roundsFor(id: string): VoteRound[] {
    return [...this.rounds.values()].filter((r) => r.campaignId === id).map((r) => this.publicRound(r));
  }

  newId() { return randomUUID(); }
}

const iso = (t: number) => new Date(t).toISOString();
const m = (index: number, title: string, description: string, releaseUsdc: number, deadline: number, status: Milestone["status"] = "Pending", evidenceUri: string | null = null): Milestone =>
  ({ index, title, description, releaseUsdc, deadline: iso(deadline), status, evidenceUri, resubmitUsed: false });

/**
 * Sample campaigns (SPEC.md "Sample campaigns (v3)"). Both are FICTIONAL: every object carries
 * `sample: true`, founders are invented, and founder pubkeys are obvious placeholders.
 */
export function seed(store: Store, now = Date.now()) {
  const month = 30 * DAY_MS;

  // 1. Zentrove: crypto, token offering, Raising.
  const zentroveClose = now + 21 * DAY_MS;
  const zentrove: Campaign = {
    id: "zentrove",
    founder: "SampLeZentroveFounderPLaceho1der11111111111",
    name: "Zentrove",
    tagline: "Private stablecoin payroll for remote teams.",
    problem: "Paying a remote team in stablecoins exposes every salary on a public chain.",
    solution: "Payroll that settles USDC on Solana with amounts shielded, plus compliant payslips.",
    useOfFunds: ["Payroll engine", "Security audits", "Compliance & payslips", "Team onboarding"],
    goalUsdc: 750_000, raisedUsdc: 286_000, equityBps: 0, upfrontBps: 2000,
    raiseDeadline: iso(zentroveClose), minInvestors: 25, status: "Raising",
    category: "crypto",
    offering: { kind: "token", token: { symbol: "ZTRV", totalSupply: 1_000_000_000, investorAllocationBps: 1500, targetLaunchDate: new Date("2027-06-30T00:00:00.000Z").toISOString(), vesting: { cliffMonths: 3, months: 12 } } },
    milestones: [
      m(0, "Private payroll live on mainnet beta", "Shielded USDC payroll runs on Solana mainnet beta for pilot teams.", 200_000, zentroveClose + 3 * month),
      m(1, "100 teams running payroll", "100 distinct teams have run at least one private payroll cycle.", 200_000, zentroveClose + 6 * month),
      m(2, "ZTRV launch + $1M monthly payroll volume", "ZTRV token launched and $1M of payroll settled in one calendar month.", 200_000, zentroveClose + 9 * month),
    ],
    spending: [],
    sample: true,
  };

  // 2. Ferrolab: saas (hardware + software), equity + 7% monthly revenue payouts, Active.
  const ferrolabClose = now - 130 * DAY_MS;
  const ferrolab: Campaign = {
    id: "ferrolab",
    founder: "SampLeFerroLabFounderPLaceho1der11111111111",
    name: "Ferrolab",
    tagline: "AI inspection cameras for small factories.",
    problem: "Small factories catch defects by eye, losing 3–5% of output to scrap and returns.",
    solution: "A plug-in camera + model that flags defects on the line, sold as a monthly subscription.",
    useOfFunds: ["Camera hardware", "ML engineering", "Factory installs", "Sales & support"],
    goalUsdc: 500_000, raisedUsdc: 500_000, equityBps: 1200, upfrontBps: 2000,
    raiseDeadline: iso(ferrolabClose), minInvestors: 25, status: "Active",
    category: "saas",
    offering: { kind: "equity", equity: { equityBps: 1200, payout: { basis: "revenue", shareBps: 700, frequency: "monthly", startsAfterDays: 90 } } },
    milestones: [
      m(0, "50 cameras installed at paying factories", "50 cameras live on production lines at paying customer factories.", 150_000, ferrolabClose + 3 * month, "Released", "ipfs://bafysampleferrolabm1"),
      m(1, "$40k monthly recurring revenue", "$40,000 MRR sustained for one full month, verified via billing attestation.", 150_000, ferrolabClose + 6 * month, "Voting", "ipfs://bafysampleferrolabm2"),
      m(2, "3 enterprise contracts signed", "Three signed multi-site enterprise contracts.", 100_000, ferrolabClose + 9 * month),
    ],
    spending: [
      { id: "sp-ferrolab-1", date: iso(now - 120 * DAY_MS), description: "Camera hardware batch (60 units)", amountUsdc: 38_000, milestoneIndex: 0, txSig: null },
      { id: "sp-ferrolab-2", date: iso(now - 100 * DAY_MS), description: "ML engineer contract (3 months)", amountUsdc: 27_500, milestoneIndex: 0, txSig: null },
      { id: "sp-ferrolab-3", date: iso(now - 70 * DAY_MS), description: "Factory pilot installs", amountUsdc: 14_200, milestoneIndex: 0, txSig: null },
      { id: "sp-ferrolab-4", date: iso(now - 25 * DAY_MS), description: "Sales travel", amountUsdc: 6_300, milestoneIndex: 1, txSig: null },
    ],
    sample: true,
  };

  for (const c of [zentrove, ferrolab]) store.campaigns.set(c.id, c);
  store.investorCount.set("zentrove", 41);
  store.investorCount.set("ferrolab", 63);
  // Ferrolab M2 is voting now: open round started 2 days ago.
  store.openRound("ferrolab", 1, now - 2 * DAY_MS);
  // Ferrolab: 1 payout period (7% of revenue), deposited 5 days after period end -> ON_TIME.
  const p1 = payoutPeriod(ferrolabClose, 90, 1);
  store.recordPayout("ferrolab", { period: 1, basisAmountUsdc: 31_400, paidUsdc: payoutAmountUsdc(31_400, 700), depositedAt: p1.end + 5 * DAY_MS, reportUri: "ipfs://bafysampleferrolabreport1", txSig: null }, ferrolab.raisedUsdc);
}
