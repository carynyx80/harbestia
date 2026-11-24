// Mock data layer for Harvestia. Swap these functions for the real SDK later.

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

export interface Campaign {
  id: string;
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
}

export interface Holding {
  campaignId: string;
  amountUsdc: number;
  shares: number;
  equityPct: number;
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

const img = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

const now = Date.now();
const days = (d: number) => new Date(now + d * 86400000).toISOString();

const campaigns: Campaign[] = [
  {
    id: "freshbox",
    founder: {
      pubkey: "FrSh7xQm2pVb9kL4nWc3TzR8eYhJ6dA1uGoP5sNqXk2",
      name: "Maya Okafor",
      role: "Founder & CEO",
      avatar: img("1494790108377-be9c29b29330", 200),
      bio: "Ex-supply-chain lead at a top-5 grocer. Built and sold a cold-chain logistics startup in 2023.",
      location: "Lisbon, PT",
    },
    name: "FreshBox",
    tagline: "Farm-to-door produce boxes, delivered within 24h of harvest.",
    category: "Food & Logistics",
    image: img("1488459716781-31db52582fe9"),
    problem:
      "Supermarket produce travels an average of 1,500 km and sits 7–10 days before reaching a kitchen. Small farms lose up to 30% of harvest to spoilage and middlemen.",
    solution:
      "FreshBox connects 120+ local farms to subscribers via a route-optimised cold-chain network. Harvest-to-door in under 24 hours, with farmers keeping 2x the margin.",
    useOfFunds: [
      { label: "Cold-chain fleet", pct: 35 },
      { label: "App & route engine", pct: 25 },
      { label: "Farmer onboarding", pct: 20 },
      { label: "Growth marketing", pct: 15 },
      { label: "Legal & ops", pct: 5 },
    ],
    goalUsdc: 500_000,
    raisedUsdc: 500_000,
    equityBps: 1000,
    upfrontBps: 2000,
    raiseDeadline: days(-60),
    minInvestors: 25,
    status: "Active",
    milestones: [
      {
        index: 1,
        title: "App live",
        description: "iOS + Android app live in Lisbon with ordering, subscriptions and live delivery tracking.",
        releaseUsdc: 150_000,
        deadline: days(-20),
        status: "Released",
        evidenceUri: "https://freshbox.example/evidence/m1",
        resubmitUsed: false,
      },
      {
        index: 2,
        title: "1,000 paying customers",
        description: "1,000 active paying subscribers, verified via Stripe revenue attestation.",
        releaseUsdc: 150_000,
        deadline: days(5),
        status: "Voting",
        evidenceUri: "https://freshbox.example/evidence/m2",
        resubmitUsed: false,
      },
      {
        index: 3,
        title: "$20k MRR",
        description: "Reach $20,000 monthly recurring revenue for two consecutive months.",
        releaseUsdc: 100_000,
        deadline: days(95),
        status: "Pending",
        evidenceUri: "",
        resubmitUsed: false,
      },
    ],
    spending: [
      { date: days(-55), category: "Fleet", description: "2x refrigerated vans (lease deposit)", amountUsdc: 38_400, txSig: "5kQ9…a7Fd" },
      { date: days(-48), category: "Engineering", description: "Mobile app contract — sprint 1–4", amountUsdc: 42_000, txSig: "3hTr…Lm2x" },
      { date: days(-40), category: "Farmers", description: "Onboarding stipends, 34 farms", amountUsdc: 17_000, txSig: "9pWe…Qz81" },
      { date: days(-30), category: "Marketing", description: "Launch campaign, Lisbon metro", amountUsdc: 21_500, txSig: "2vNc…Ty6k" },
      { date: days(-18), category: "Engineering", description: "Route engine v1 + infra", amountUsdc: 36_200, txSig: "7mBa…Hs4p" },
      { date: days(-9), category: "Legal", description: "Food safety certification", amountUsdc: 6_800, txSig: "4cXr…Pe9w" },
    ],
  },
  {
    id: "solgrid",
    founder: {
      pubkey: "SoLg4rT8mXc2bV7nQp1kWz9eYh3J6dA5uGoR2sNqLm8",
      name: "Daniel Reyes",
      role: "Founder",
      avatar: img("1507003211169-0a1dd7228f2d", 200),
      bio: "Electrical engineer, 8 years building microgrids across LatAm.",
      location: "Mexico City, MX",
    },
    name: "SolGrid",
    tagline: "Community solar microgrids for off-grid villages.",
    category: "Climate",
    image: img("1473341304170-971dccb5ac1e"),
    problem: "Over 700M people lack reliable electricity.",
    solution: "Modular, pay-as-you-go solar microgrids financed by the community.",
    useOfFunds: [
      { label: "Hardware", pct: 60 },
      { label: "Installation", pct: 25 },
      { label: "Ops", pct: 15 },
    ],
    goalUsdc: 750_000,
    raisedUsdc: 412_000,
    equityBps: 1200,
    upfrontBps: 2000,
    raiseDeadline: days(18),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      { index: 1, title: "Pilot village online", description: "", releaseUsdc: 200_000, deadline: days(120), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 2, title: "10 villages", description: "", releaseUsdc: 200_000, deadline: days(240), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 3, title: "Break-even", description: "", releaseUsdc: 200_000, deadline: days(360), status: "Pending", evidenceUri: "", resubmitUsed: false },
    ],
    spending: [],
  },
  {
    id: "medilink",
    founder: {
      pubkey: "MeDi9kL4nWc3TzR8eYhJ6dA1uGoP5sNqXk2Fr7xQm2p",
      name: "Aisha Rahman",
      role: "Founder & CTO",
      avatar: img("1438761681033-6461ffad8d80", 200),
      bio: "Physician turned engineer. Previously led clinical ML at a health-tech unicorn.",
      location: "London, UK",
    },
    name: "MediLink",
    tagline: "AI triage for rural clinics, offline-first.",
    category: "Health",
    image: img("1576091160399-112ba8d25d1d"),
    problem: "Rural clinics have 1 doctor per 10,000 patients.",
    solution: "Offline-first triage assistant for nurses and community health workers.",
    useOfFunds: [
      { label: "R&D", pct: 50 },
      { label: "Clinical trials", pct: 30 },
      { label: "Ops", pct: 20 },
    ],
    goalUsdc: 400_000,
    raisedUsdc: 286_000,
    equityBps: 800,
    upfrontBps: 2000,
    raiseDeadline: days(9),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      { index: 1, title: "Clinical pilot", description: "", releaseUsdc: 120_000, deadline: days(90), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 2, title: "Regulatory approval", description: "", releaseUsdc: 120_000, deadline: days(200), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 3, title: "50 clinics", description: "", releaseUsdc: 80_000, deadline: days(300), status: "Pending", evidenceUri: "", resubmitUsed: false },
    ],
    spending: [],
  },
  {
    id: "terroir",
    founder: {
      pubkey: "TeRr2pVb9kL4nWc3TzR8eYhJ6dA1uGoP5sNqXk2Fr7x",
      name: "Lucas Moreau",
      role: "Founder",
      avatar: img("1500648767791-00dcc994a43e", 200),
      bio: "Third-generation farmer and agronomist.",
      location: "Bordeaux, FR",
    },
    name: "Terroir",
    tagline: "Soil sensors that pay farmers for regenerative practices.",
    category: "AgTech",
    image: img("1500382017468-9049fed747ef"),
    problem: "Regenerative farming is hard to verify and under-rewarded.",
    solution: "Cheap soil sensors + carbon credit marketplace.",
    useOfFunds: [
      { label: "Hardware", pct: 45 },
      { label: "Software", pct: 35 },
      { label: "Field ops", pct: 20 },
    ],
    goalUsdc: 300_000,
    raisedUsdc: 94_000,
    equityBps: 1000,
    upfrontBps: 2000,
    raiseDeadline: days(26),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      { index: 1, title: "100 sensors deployed", description: "", releaseUsdc: 80_000, deadline: days(100), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 2, title: "First credits sold", description: "", releaseUsdc: 80_000, deadline: days(200), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 3, title: "1,000 farms", description: "", releaseUsdc: 80_000, deadline: days(320), status: "Pending", evidenceUri: "", resubmitUsed: false },
    ],
    spending: [],
  },
  {
    id: "kitchenos",
    founder: {
      pubkey: "KiTc3TzR8eYhJ6dA1uGoP5sNqXk2Fr7xQm2pVb9kL4n",
      name: "Sofia Lindqvist",
      role: "Founder & CEO",
      avatar: img("1534528741775-53994a69daeb", 200),
      bio: "Former head chef, now building software for independent restaurants.",
      location: "Stockholm, SE",
    },
    name: "KitchenOS",
    tagline: "Zero-waste inventory for independent restaurants.",
    category: "SaaS",
    image: img("1556909114-f6e7ad7d3136"),
    problem: "Restaurants waste ~10% of food purchases.",
    solution: "Computer-vision inventory that auto-orders exactly what's needed.",
    useOfFunds: [
      { label: "Engineering", pct: 60 },
      { label: "Sales", pct: 30 },
      { label: "Ops", pct: 10 },
    ],
    goalUsdc: 250_000,
    raisedUsdc: 231_500,
    equityBps: 900,
    upfrontBps: 2000,
    raiseDeadline: days(4),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      { index: 1, title: "50 restaurants", description: "", releaseUsdc: 70_000, deadline: days(90), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 2, title: "$15k MRR", description: "", releaseUsdc: 70_000, deadline: days(180), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 3, title: "Series A ready", description: "", releaseUsdc: 60_000, deadline: days(300), status: "Pending", evidenceUri: "", resubmitUsed: false },
    ],
    spending: [],
  },
  {
    id: "greenhaul",
    founder: {
      pubkey: "GrHa8eYhJ6dA1uGoP5sNqXk2Fr7xQm2pVb9kL4nWc3T",
      name: "James Whitfield",
      role: "Founder",
      avatar: img("1472099645785-5658abf4ff4e", 200),
      bio: "Ex-logistics PM. Obsessed with last-mile emissions.",
      location: "Austin, US",
    },
    name: "GreenHaul",
    tagline: "Electric cargo-bike delivery for dense cities.",
    category: "Mobility",
    image: img("1466692476868-aef1dfb1e735"),
    problem: "Last-mile vans cause 25% of urban CO2 from transport.",
    solution: "Micro-hubs + e-cargo bikes, 3x cheaper per drop.",
    useOfFunds: [
      { label: "Fleet", pct: 50 },
      { label: "Hubs", pct: 30 },
      { label: "Ops", pct: 20 },
    ],
    goalUsdc: 600_000,
    raisedUsdc: 168_000,
    equityBps: 1100,
    upfrontBps: 2000,
    raiseDeadline: days(33),
    minInvestors: 25,
    status: "Raising",
    milestones: [
      { index: 1, title: "First hub live", description: "", releaseUsdc: 160_000, deadline: days(100), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 2, title: "5 hubs", description: "", releaseUsdc: 160_000, deadline: days(220), status: "Pending", evidenceUri: "", resubmitUsed: false },
      { index: 3, title: "Profitability", description: "", releaseUsdc: 160_000, deadline: days(340), status: "Pending", evidenceUri: "", resubmitUsed: false },
    ],
    spending: [],
  },
];

const holdings: Holding[] = [
  { campaignId: "freshbox", amountUsdc: 12_500, shares: 2500, equityPct: 0.25 },
  { campaignId: "medilink", amountUsdc: 5_000, shares: 1000, equityPct: 0.1 },
  { campaignId: "kitchenos", amountUsdc: 3_200, shares: 640, equityPct: 0.115 },
];

const votes: VoteInfo[] = [
  {
    campaignId: "freshbox",
    milestoneIndex: 2,
    opensAt: days(-2),
    closesAt: new Date(now + 4 * 86400000 + 7 * 3600000 + 23 * 60000).toISOString(),
    quorumPct: 14,
    quorumRequiredPct: 20,
    evidence: [
      { label: "Stripe revenue attestation (signed)", href: "#" },
      { label: "Subscriber count dashboard — read-only", href: "#" },
      { label: "Independent auditor letter (PDF)", href: "#" },
      { label: "App store listings", href: "#" },
    ],
  },
];

export const refundsClaimable = [
  { campaign: "Orbital Brew", amountUsdc: 1_840, reason: "Milestone 2 rejected — remaining funds refunded" },
];

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
