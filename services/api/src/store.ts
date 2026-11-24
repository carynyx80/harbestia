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

export function seed(store: Store, now = Date.now()) {
  const month = 30 * DAY_MS;
  const freshbox: Campaign = {
    id: "freshbox",
    founder: "FrEsHbXq4m7Vt8u2y5cJ9kD1nP3rS6wA0bL2eH4gT7z",
    name: "FreshBox",
    tagline: "Farm-fresh produce boxes, delivered in 24 hours.",
    problem: "Urban households waste 30% of grocery spend on produce that spoils before it is eaten.",
    solution: "Subscription boxes sourced from local farms within 100 km, right-sized by an app that learns what you actually cook.",
    useOfFunds: ["Mobile app development", "Cold-chain delivery vans", "Farm partnerships", "Customer acquisition"],
    goalUsdc: 500_000, raisedUsdc: 500_000, equityBps: 1000, upfrontBps: 2000,
    raiseDeadline: iso(now - 200 * DAY_MS), minInvestors: 25, status: "Active",
    category: "business",
    offering: { kind: "equity", equity: { equityBps: 1000, payout: { basis: "revenue", shareBps: 800, frequency: "monthly", startsAfterDays: 90 } } },
    milestones: [
      m(0, "App live", "iOS + Android app live in the stores with ordering and delivery tracking.", 150_000, now + 1 * month, "Voting", "ipfs://bafyfreshboxapplive"),
      m(1, "1,000 paying customers", "1,000 customers with at least one paid box, verified via payment processor attestation.", 150_000, now + 4 * month),
      m(2, "$20k MRR", "Monthly recurring revenue of $20,000 sustained for one full month.", 100_000, now + 7 * month),
    ],
    spending: [
      { id: "sp-1", date: iso(now - 50 * DAY_MS), description: "Contract mobile dev agency (upfront tranche)", amountUsdc: 42_000, milestoneIndex: 0, txSig: null },
      { id: "sp-2", date: iso(now - 30 * DAY_MS), description: "Refrigerated van lease (3 months)", amountUsdc: 18_500, milestoneIndex: null, txSig: null },
    ],
  };
  const solar: Campaign = {
    id: "sunshare-coop",
    founder: "SoLaRcoop9xK2mV7tB4nQ8wE1rY5uI3oP6aS0dF2gH4j",
    name: "SunShare Co-op",
    tagline: "Community-owned rooftop solar for apartment blocks.",
    problem: "Renters cannot install solar and pay rising grid prices with no ownership upside.",
    solution: "A co-op installs shared rooftop arrays on apartment blocks and sells power to residents below grid price.",
    useOfFunds: ["Panels and inverters", "Installation crews", "Permitting", "Metering software"],
    goalUsdc: 750_000, raisedUsdc: 318_000, equityBps: 1500, upfrontBps: 2000,
    raiseDeadline: iso(now + 21 * DAY_MS), minInvestors: 25, status: "Raising",
    category: "business",
    offering: {
      kind: "both",
      equity: { equityBps: 1500, payout: { basis: "revenue", shareBps: 1000, frequency: "monthly", startsAfterDays: 90 } },
      token: { symbol: "SUN", totalSupply: 100_000_000, investorAllocationBps: 1500, targetLaunchDate: iso(now + 10 * month), vesting: { cliffMonths: 0, months: 12 } },
    },
    milestones: [
      m(0, "First 3 rooftops online", "Three buildings generating and metered.", 250_000, now + 4 * month),
      m(1, "500 resident subscribers", "500 households on co-op power contracts.", 200_000, now + 8 * month),
      m(2, "Cash-flow positive", "Two consecutive months of positive operating cash flow.", 150_000, now + 12 * month),
    ],
    spending: [],
  };
  const game: Campaign = {
    id: "lantern-games",
    founder: "LaNtErNgm5hJ8kL1zX4cV7bN2mQ9wE3rT6yU0iO5pA8s",
    name: "Lantern Games",
    tagline: "A cozy co-op adventure built by a five-person indie studio.",
    problem: "Indie studios give up most of their upside to publishers to fund development.",
    solution: "Fund the vertical slice and launch directly from the community, with milestones tied to playable builds.",
    useOfFunds: ["Two additional developers", "Art and music", "Steam launch marketing"],
    goalUsdc: 250_000, raisedUsdc: 0, equityBps: 0, upfrontBps: 2000,
    raiseDeadline: iso(now + 45 * DAY_MS), minInvestors: 25, status: "Draft",
    category: "creator",
    offering: { kind: "token", token: { symbol: "LNTRN", totalSupply: 1_000_000_000, investorAllocationBps: 2000, targetLaunchDate: iso(now + 15 * month), vesting: { cliffMonths: 0, months: 12 } } },
    milestones: [
      m(0, "Playable vertical slice", "30-minute playable demo released to investors.", 80_000, now + 5 * month),
      m(1, "Steam Next Fest demo", "Public demo with 10,000 wishlists.", 70_000, now + 9 * month),
      m(2, "1.0 launch", "Full release on Steam.", 50_000, now + 14 * month),
    ],
    spending: [],
  };
  const tidepool: Campaign = {
    id: "tidepool",
    founder: "TiDePoOL3qW8eR2tY6uI1oP5aS9dF4gH7jK0lZ3xC6v",
    name: "Tidepool",
    tagline: "Private, intent-based liquidity pools on Solana.",
    problem: "On-chain LPs leak their positions and get front-run by searchers.",
    solution: "A shielded AMM where LP positions and swap intents are encrypted until settlement.",
    useOfFunds: ["Protocol engineering", "Security audits", "Liquidity incentives", "Community grants"],
    goalUsdc: 400_000, raisedUsdc: 162_000, equityBps: 0, upfrontBps: 2000,
    raiseDeadline: iso(now + 30 * DAY_MS), minInvestors: 25, status: "Raising",
    category: "crypto",
    offering: { kind: "token", token: { symbol: "TIDE", totalSupply: 500_000_000, investorAllocationBps: 1200, targetLaunchDate: iso(now + 6 * month), vesting: { cliffMonths: 3, months: 18 } } },
    milestones: [
      m(0, "Testnet launch", "Shielded pools live on devnet with public bug bounty.", 120_000, now + 3 * month),
      m(1, "Audits complete", "Two independent audits published with all criticals fixed.", 100_000, now + 6 * month),
      m(2, "Mainnet + $5M TVL", "Mainnet launch sustaining $5M TVL for 30 days.", 80_000, now + 10 * month),
    ],
    spending: [],
  };
  const kiln: Campaign = {
    id: "kiln-coffee",
    founder: "KiLnCoFfEe7aS2dF5gH8jK1lZ4xC7vB0nM3qW6eR9tY",
    name: "Kiln Coffee",
    tagline: "Small-batch roasted coffee, sold direct and in 40 cafes.",
    problem: "Specialty roasters stay small because banks will not lend against brand growth.",
    solution: "Expand roasting capacity and wholesale reach, sharing 12% of monthly profit with investors.",
    useOfFunds: ["Second roaster", "Wholesale sales team", "Packaging line", "Working capital"],
    goalUsdc: 300_000, raisedUsdc: 87_500, equityBps: 800, upfrontBps: 2000,
    raiseDeadline: iso(now + 35 * DAY_MS), minInvestors: 25, status: "Raising",
    category: "consumer",
    offering: { kind: "equity", equity: { equityBps: 800, payout: { basis: "profit", shareBps: 1200, frequency: "monthly", startsAfterDays: 90 } } },
    milestones: [
      m(0, "Second roaster installed", "New 15 kg roaster commissioned and producing.", 100_000, now + 3 * month),
      m(1, "100 wholesale accounts", "100 active cafe and grocery accounts.", 80_000, now + 7 * month),
      m(2, "Profitable quarter", "One full quarter of positive net profit.", 60_000, now + 11 * month),
    ],
    spending: [],
  };
  for (const c of [freshbox, solar, game, tidepool, kiln]) store.campaigns.set(c.id, c);
  store.investorCount.set("freshbox", 41);
  store.investorCount.set("sunshare-coop", 19);
  store.investorCount.set("lantern-games", 0);
  store.investorCount.set("tidepool", 23);
  store.investorCount.set("kiln-coffee", 12);
  store.openRound("freshbox", 0, now - 2 * DAY_MS);
  // FreshBox: 3 past payout periods (8% of monthly revenue), each deposited 5 days after period end -> ON_TIME.
  const close = Date.parse(freshbox.raiseDeadline);
  [9_000, 12_500, 16_000].forEach((revenue, i) => {
    const p = payoutPeriod(close, 90, i + 1);
    store.recordPayout("freshbox", { period: i + 1, basisAmountUsdc: revenue, paidUsdc: payoutAmountUsdc(revenue, 800), depositedAt: p.end + 5 * DAY_MS, reportUri: `ipfs://bafyfreshboxreport${i + 1}`, txSig: null }, freshbox.raisedUsdc);
  });
}
