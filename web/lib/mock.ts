// Mock data layer for Harvestia. Swap these functions for the real SDK later.
import type {
  CampaignCategory, CampaignFlag, Offering, OfferingKind, PayoutEntry, TokenOffering,
} from "./api-types";
export type { CampaignCategory, CampaignFlag, Offering, OfferingKind, PayoutEntry, TokenOffering } from "./api-types";

export type CampaignStatus = "Draft" | "Raising" | "Active" | "Completed" | "Failed" | "Refunding";
export type MilestoneStatus = "Pending" | "Voting" | "Released" | "Rejected" | "Resubmitted" | "Refunded";

export interface Milestone {
  index: number;
  title: string;
  description: string;
  releaseUsdc: number;
  deadline: string; // ISO
  status: MilestoneStatus;
  evidenceUri: string;
  resubmitUsed: boolean;
}

export interface SpendEntry {
  date: string;
  category: string;
  description: string;
  amountUsdc: number;
  txSig: string;
}

export interface UseOfFunds {
  label: string;
  pct: number;
}

export interface FounderProfile {
  pubkey: string;
  name: string;
  role: string;
  avatar: string;
  bio: string;
  location: string;
}

export interface TeamMember {
  name: string;
  role: string;
  avatar: string;
  bio: string;
}

export interface FounderUpdate {
  date: string; // ISO
  title: string;
  body: string;
}

export interface Campaign {
  id: string;
  /** Fictional sample campaign — UI shows a "SAMPLE" stamp. */
  sample?: boolean;
  /** UI-only long-form pitch fields (see content/startups.md). */
  story?: string;
  whyNow?: string;
  team?: TeamMember[];
  risks?: string[];
  updates?: FounderUpdate[];
  founder: FounderProfile;
  name: string;
  tagline: string;
  category: string;
  image: string;
  problem: string;
  solution: string;
  useOfFunds: UseOfFunds[];
  goalUsdc: number;
  raisedUsdc: number;
  equityBps: number;
  upfrontBps: number;
  raiseDeadline: string;
  minInvestors: number;
  status: CampaignStatus;
  milestones: Milestone[];
  spending: SpendEntry[];
  /** Offerings (v2) */
  categoryKey: CampaignCategory;
  offering: Offering;
  flags: CampaignFlag[];
}

export interface Holding {
  campaignId: string;
  amountUsdc: number;
  shares: number;
  equityPct: number;
  /** Claimable monthly payouts (private; decrypted locally). */
  claimablePayoutUsdc: number;
  /** Tokens already claimed. */
  tokensClaimed: number;
}

export interface VoteInfo {
  campaignId: string;
  milestoneIndex: number;
  opensAt: string;
  closesAt: string;
  quorumPct: number; // current participation % of stake (only % shown)
  quorumRequiredPct: number;
  evidence: { label: string; href: string }[];
}

/** Local, designed art only (no photos of real people). */
const art = (file: string) => `/startups/${file}`;

const now = Date.now();
const days = (d: number) => new Date(now + d * 86400000).toISOString();

type BaseCampaign = Omit<Campaign, "categoryKey" | "offering" | "flags">;

// Both campaigns are FICTIONAL samples (SPEC "Sample campaigns (v3)"). Long-form copy lives in content/startups.md.
const baseCampaigns: BaseCampaign[] = [
  {
    id: "zentrove",
    sample: true,
    founder: {
      pubkey: "ZtRv4kQm8pVb2nLc7WxT9eYh3J6dA1uGoP5sNqXk2Fm",
      name: "Imani Vale",
      role: "Founder & CEO",
      avatar: art("zentrove-founder.png"),
      bio: "Fictional founder. Ex-payments engineer who spent six years on payout rails and reconciliation before running a 14-person remote team paid in USDC.",
      location: "Remote · Nairobi / Lisbon",
    },
    name: "Zentrove",
    tagline: "Private stablecoin payroll for remote teams.",
    category: "Crypto",
    image: art("zentrove-cover.png"),
    story:
      "Imani ran payroll for a 14-person remote team in USDC. It was fast and cheap until a contractor pulled up a block explorer and found every colleague's salary in about four minutes. Zentrove is the payroll tool she wanted that week: teams fund one treasury, Zentrove settles each salary in USDC on Solana with the amounts shielded, and every employee gets a compliant payslip they can show a landlord or a tax office. The chain proves everyone was paid; it no longer says how much.",
    problem:
      "Paying a remote team in stablecoins exposes every salary on a public chain. Anyone with a wallet address can read who earns what, when raises land and when someone leaves — so most teams fall back to slow, expensive wires.",
    solution:
      "Payroll that settles USDC on Solana with amounts shielded, plus compliant payslips. Employers upload a payroll run once; recipients receive funds to their own wallets, and only the employer, the employee and an optional auditor key can see the figures.",
    whyNow:
      "Stablecoin payroll moved from experiment to habit for crypto-native and cross-border teams, and confidential-transfer tooling on Solana is now mature enough to build on. Teams want the speed of USDC without publishing their compensation bands.",
    team: [
      { name: "Imani Vale", role: "Founder & CEO", avatar: art("zentrove-founder.png"), bio: "Ex-payments engineer; built payout and reconciliation systems." },
      { name: "Oskar Lindgren", role: "Protocol Engineer", avatar: art("zentrove-team-ol.png"), bio: "Rust and Solana programs; owns the shielded settlement path." },
      { name: "Priya Natarajan", role: "Head of Compliance", avatar: art("zentrove-team-pn.png"), bio: "Former payroll-compliance lead; owns payslips, tax exports and auditor keys." },
    ],
    risks: [
      "Regulation of privacy features on public chains is unsettled; a jurisdiction could restrict shielded transfers, forcing a transparent fallback mode.",
      "We depend on Solana confidential-transfer tooling and USDC; a protocol bug or issuer change would pause payroll runs.",
      "ZTRV has no guaranteed value or listing. The token launch is a milestone, not a promise of liquidity.",
      "Payroll is a trust product: one late run can lose a customer. Our team is small and key-person risk is real.",
    ],
    updates: [
      { date: days(-3), title: "Testnet payroll #12 settled", body: "Ran a 38-recipient payroll on devnet in under 40 seconds. Explorer shows transfers, not amounts. Auditor-key export works." },
      { date: days(-10), title: "Design partners signed", body: "Nine remote teams (6–60 people) signed letters of intent to run their first mainnet-beta payroll with us." },
      { date: days(-18), title: "Raise opened", body: "We are raising $750k. 20% unlocks at close; the rest only if investors approve each milestone." },
    ],
    useOfFunds: [
      { label: "Protocol & payroll engineering", pct: 40 },
      { label: "Security audits", pct: 20 },
      { label: "Compliance & payslip licensing", pct: 15 },
      { label: "Design-partner onboarding", pct: 15 },
      { label: "Legal & ops", pct: 10 },
    ],
    goalUsdc: 750_000,
    raisedUsdc: 286_000,
    equityBps: 0,
    upfrontBps: 2000,
    raiseDeadline: days(21),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      {
        index: 1,
        title: "Private payroll live on mainnet beta",
        description: "Shielded USDC payroll runs live on Solana mainnet beta for design partners. Evidence: public program address, third-party audit report, and an explorer link to a real run showing transfers without amounts.",
        releaseUsdc: 200_000,
        deadline: days(21 + 90),
        status: "Pending",
        evidenceUri: "",
        resubmitUsed: false,
      },
      {
        index: 2,
        title: "100 teams running payroll",
        description: "100 distinct employer accounts complete at least one payroll run. Evidence: on-chain count of employer treasuries with settled runs, plus a signed customer list shared with voters.",
        releaseUsdc: 200_000,
        deadline: days(21 + 180),
        status: "Pending",
        evidenceUri: "",
        resubmitUsed: false,
      },
      {
        index: 3,
        title: "ZTRV launch + $1M monthly payroll volume",
        description: "ZTRV mint registered and investor vesting live, and $1M USDC settled through Zentrove in a calendar month. Evidence: mint address, vesting contract, and an aggregate volume attestation from the settlement program.",
        releaseUsdc: 200_000,
        deadline: days(21 + 270),
        status: "Pending",
        evidenceUri: "",
        resubmitUsed: false,
      },
    ],
    spending: [],
  },
  {
    id: "ferrolab",
    sample: true,
    founder: {
      pubkey: "FeRr7xQm2pVb9kL4nWc3TzR8eYhJ6dA1uGoP5sNqLb3",
      name: "Tomas Rieger",
      role: "Founder & CEO",
      avatar: art("ferrolab-founder.png"),
      bio: "Fictional founder. Former manufacturing-line engineer who spent nine years tuning stamping and machining lines for automotive suppliers.",
      location: "Stuttgart, DE",
    },
    name: "Ferrolab",
    tagline: "AI inspection cameras for small factories.",
    category: "SaaS",
    image: art("ferrolab-cover.png"),
    story:
      "Tomas spent nine years on factory floors where the quality check was a tired person with a flashlight at the end of a shift. Big plants buy six-figure vision systems; the 40-person machine shop next door cannot. Ferrolab is a camera that clamps over an existing conveyor, learns what a good part looks like from a few hundred examples, and flags the bad ones before they ship. It costs a monthly subscription, not a capital budget, and the first install takes an afternoon.",
    problem:
      "Small factories catch defects by eye, losing 3–5% of output to scrap and returns. Industrial vision systems exist, but they cost six figures and need an integrator.",
    solution:
      "A plug-in camera + model that flags defects on the line, sold as a monthly subscription. Each unit trains on the customer's own parts, runs on-device, and sends a shift report the plant manager can actually read.",
    whyNow:
      "Edge hardware that can run a vision model at line speed now costs less than a monthly scrap bill, and labour shortages mean small plants can no longer staff a full-time inspector per line.",
    team: [
      { name: "Tomas Rieger", role: "Founder & CEO", avatar: art("ferrolab-founder.png"), bio: "Former manufacturing-line engineer; sells to and installs at every pilot." },
      { name: "Lena Okoro", role: "ML Lead", avatar: art("ferrolab-team-lo.png"), bio: "Computer-vision engineer; owns few-shot training and on-device inference." },
      { name: "Marek Novak", role: "Hardware & Field Ops", avatar: art("ferrolab-team-mn.png"), bio: "Ex-automation technician; designs the mount and runs installs." },
    ],
    risks: [
      "Hardware margins are thin and component prices move; a supply shock would slow installs.",
      "Each new part type needs fresh training data; accuracy on unusual parts may lag our pilot numbers.",
      "Revenue payouts depend on subscription revenue, which can churn if a factory closes a line.",
      "Enterprise contracts (M3) have long sales cycles and may slip past month 9.",
    ],
    updates: [
      { date: days(-4), title: "M2 evidence submitted", body: "MRR hit $41.2k in the last full month. Billing export, bank statement and customer list are attached to the vote." },
      { date: days(-22), title: "First payout deposited", body: "Paid $2,198 to investors on $31,400 of revenue — on time. 7% of monthly revenue, as promised." },
      { date: days(-45), title: "M1 released", body: "Investors approved milestone 1: 52 cameras running at 19 paying factories. $150k released." },
    ],
    useOfFunds: [
      { label: "Camera hardware", pct: 35 },
      { label: "ML engineering", pct: 25 },
      { label: "Factory pilot installs", pct: 20 },
      { label: "Sales & travel", pct: 12 },
      { label: "Legal & ops", pct: 8 },
    ],
    goalUsdc: 500_000,
    raisedUsdc: 500_000,
    equityBps: 1200,
    upfrontBps: 2000,
    raiseDeadline: days(-130),
    minInvestors: 25,
    status: "Active",
    milestones: [
      {
        index: 1,
        title: "50 cameras installed at paying factories",
        description: "50+ Ferrolab cameras running on production lines at factories with an active paid subscription. Evidence: device registry export with serials and heartbeat logs, invoices per factory, and install photos (no faces).",
        releaseUsdc: 150_000,
        deadline: days(-40),
        status: "Released",
        evidenceUri: "https://ferrolab.example/evidence/m1",
        resubmitUsed: false,
      },
      {
        index: 2,
        title: "$40k monthly recurring revenue",
        description: "$40,000 MRR in a full calendar month. Evidence: billing-system export, matching bank statement, and a customer list shared privately with voters.",
        releaseUsdc: 150_000,
        deadline: days(50),
        status: "Voting",
        evidenceUri: "https://ferrolab.example/evidence/m2",
        resubmitUsed: false,
      },
      {
        index: 3,
        title: "3 enterprise contracts signed",
        description: "Three signed multi-site contracts (5+ lines each). Evidence: redacted signed contracts and a confirmation letter from each customer.",
        releaseUsdc: 100_000,
        deadline: days(140),
        status: "Pending",
        evidenceUri: "",
        resubmitUsed: false,
      },
    ],
    spending: [
      { date: days(-120), category: "Hardware", description: "Camera hardware batch — 60 units", amountUsdc: 54_000, txSig: "6fRb…Kq2w" },
      { date: days(-104), category: "Engineering", description: "ML engineer contract — defect model v2", amountUsdc: 36_000, txSig: "3nLx…Tz8e" },
      { date: days(-80), category: "Installs", description: "Factory pilot installs — 19 sites", amountUsdc: 28_500, txSig: "9qWa…Pm4c" },
      { date: days(-35), category: "Sales", description: "Sales travel — trade fair + site visits", amountUsdc: 9_200, txSig: "2hVe…Rn7d" },
    ],
  },
];

// ---- Offerings (v2) mock fallbacks (used until the API returns these fields) ----
const eq = (equityBps: number, basis: "revenue" | "profit", shareBps: number, startsAfterDays = 90) => ({
  equityBps,
  payout: { basis, shareBps, frequency: "monthly" as const, startsAfterDays },
});

export const mockOfferings: Record<string, { categoryKey: CampaignCategory; category: string; offering: Offering; flags?: CampaignFlag[] }> = {
  zentrove: {
    categoryKey: "crypto",
    category: "Crypto",
    offering: {
      kind: "token",
      token: {
        symbol: "ZTRV", totalSupply: 1_000_000_000, investorAllocationBps: 1500,
        targetLaunchDate: "2027-06-30T00:00:00.000Z", vesting: { cliffMonths: 3, months: 12 },
        mint: null, launchedAt: null,
      },
    },
  },
  ferrolab: { categoryKey: "saas", category: "SaaS", offering: { kind: "equity", equity: eq(1200, "revenue", 700, 90) } },
};

export const DEFAULT_OFFERING: Offering = { kind: "equity", equity: eq(1000, "revenue", 500) };

const campaigns: Campaign[] = baseCampaigns.map((c) => {
  const o = mockOfferings[c.id];
  return {
    ...c,
    category: o?.category ?? c.category,
    categoryKey: o?.categoryKey ?? "other",
    offering: o?.offering ?? { kind: "equity", equity: eq(c.equityBps, "revenue", 500) },
    flags: o?.flags ?? [],
  };
});

const period = (monthsAgo: number) => {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  return d.toISOString().slice(0, 7);
};

export const mockPayouts: Record<string, PayoutEntry[]> = {
  ferrolab: [
    { period: period(1), basisAmountUsdc: 31_400, paidUsdc: 2_198, status: "ON_TIME", depositedAt: days(-22), txSig: "5tKe…Wb9m" },
  ],
};

export async function getPayouts(id: string): Promise<PayoutEntry[]> {
  return mockPayouts[id] ?? [];
}

const holdings: Holding[] = [
  { campaignId: "ferrolab", amountUsdc: 5_000, shares: 1000, equityPct: 0.12, claimablePayoutUsdc: 21.98, tokensClaimed: 0 },
  { campaignId: "zentrove", amountUsdc: 2_500, shares: 500, equityPct: 0, claimablePayoutUsdc: 0, tokensClaimed: 0 },
];

// ---- Offering helpers (pure; safe on server and client) ----
export const pct = (bps: number) => `${+(bps / 100).toFixed(2)}%`;

export const offeringStamp = (k: OfferingKind) =>
  k === "equity" ? "EQUITY · PAYOUTS" : k === "token" ? "TOKEN" : "EQUITY + TOKEN";

export function describeOffering(o: Offering): string[] {
  const out: string[] = [];
  if (o.equity && o.kind !== "token") {
    const e = o.equity;
    out.push(
      `Investors share ${pct(e.equityBps)} of the company and receive ${pct(e.payout.shareBps)} of monthly ${e.payout.basis}, paid monthly` +
        (e.payout.startsAfterDays ? ` (first payout after a ${e.payout.startsAfterDays}-day grace period).` : "."),
    );
  }
  if (o.token && o.kind !== "equity") {
    const t = o.token;
    out.push(
      `Investors receive ${pct(t.investorAllocationBps)} of ${t.totalSupply.toLocaleString("en-US")} $${t.symbol}, ` +
        `vesting linearly over ${t.vesting.months} months` + (t.vesting.cliffMonths ? ` after a ${t.vesting.cliffMonths}-month cliff` : "") +
        ` from launch (target ${t.targetLaunchDate.slice(0, 10)}).`,
    );
  }
  return out;
}

/** Fraction of the investor pool an amount buys (pro-rata to the raise goal). */
export const poolFraction = (amountUsdc: number, goalUsdc: number) => (goalUsdc > 0 ? Math.max(0, amountUsdc) / goalUsdc : 0);

/** Linear vesting fraction in [0,1] at `atMs`. */
export function vestedFraction(t: TokenOffering, atMs: number): number {
  if (!t.launchedAt) return 0;
  const monthsElapsed = (atMs - new Date(t.launchedAt).getTime()) / (30 * 86400000);
  if (monthsElapsed < t.vesting.cliffMonths) return 0;
  return Math.min(1, Math.max(0, monthsElapsed / Math.max(1, t.vesting.months)));
}

export const MOCK_NOW = now;

const votes: VoteInfo[] = [
  {
    campaignId: "ferrolab",
    milestoneIndex: 2,
    opensAt: days(-3),
    closesAt: new Date(now + 4 * 86400000 + 7 * 3600000 + 23 * 60000).toISOString(),
    quorumPct: 14,
    quorumRequiredPct: 20,
    evidence: [
      { label: "Billing-system MRR export (signed)", href: "#" },
      { label: "Matching bank statement — redacted", href: "#" },
      { label: "Customer list (shared privately with voters)", href: "#" },
      { label: "Device registry — active cameras", href: "#" },
    ],
  },
];

/** No refunds in the sample set. */
export const refundsClaimable: { campaign: string; amountUsdc: number; reason: string }[] = [];

export async function getCampaigns(): Promise<Campaign[]> {
  return campaigns;
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  return campaigns.find((c) => c.id === id);
}

export async function getHoldings(): Promise<Holding[]> {
  return holdings;
}

export async function getVote(id: string): Promise<VoteInfo | undefined> {
  return votes.find((v) => v.campaignId === id);
}

export async function getPendingVotes(): Promise<VoteInfo[]> {
  return votes;
}

export const fmtUsd = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1000
      ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
      : `$${n.toLocaleString("en-US")}`;

export const fmtUsdFull = (n: number) => `$${n.toLocaleString("en-US")}`;

export const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

/** Milliseconds from the mock "now" snapshot to an ISO date (render-safe, no Date.now during render). */
export const msUntil = (iso: string) => new Date(iso).getTime() - now;
export const daysUntil = (iso: string) => Math.max(0, Math.ceil(msUntil(iso) / 86400000));
