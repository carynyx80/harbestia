import { randomUUID } from "node:crypto";
import type { Campaign, Milestone, PortfolioEntry, VoteRound } from "@harvestia/sdk/types";
import { DAY_MS, VOTE_WINDOW_MS } from "./rules.js";
import type { SealedBallot } from "./privacy.js";

export interface RoundRecord extends VoteRound {
  ballotsSealed: SealedBallot[];
  nullifiers: Set<string>;
  finalizedAt: number | null;
}

export class Store {
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
    raiseDeadline: iso(now - 2 * month), minInvestors: 25, status: "Active",
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
    goalUsdc: 250_000, raisedUsdc: 0, equityBps: 1200, upfrontBps: 2000,
    raiseDeadline: iso(now + 45 * DAY_MS), minInvestors: 25, status: "Draft",
    milestones: [
      m(0, "Playable vertical slice", "30-minute playable demo released to investors.", 80_000, now + 5 * month),
      m(1, "Steam Next Fest demo", "Public demo with 10,000 wishlists.", 70_000, now + 9 * month),
      m(2, "1.0 launch", "Full release on Steam.", 50_000, now + 14 * month),
    ],
    spending: [],
  };
  for (const c of [freshbox, solar, game]) store.campaigns.set(c.id, c);
  store.investorCount.set("freshbox", 41);
  store.investorCount.set("sunshare-coop", 19);
  store.investorCount.set("lantern-games", 0);
  store.openRound("freshbox", 0, now - 2 * DAY_MS);
}
