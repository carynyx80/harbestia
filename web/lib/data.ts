// Live data layer: calls the Harvestia API via @harvestia/sdk, merges UI-only fields
// (images, founder profile, category) from mock.ts, and falls back to mock data when
// the API is unreachable. UI milestone indexes are 1-based; API indexes are 0-based.
import {
  createClient,
  sealInvestment,
  sealVote,
  randomHex,
  HarvestiaApiError,
  type Campaign as ApiCampaign,
  type VoteRound,
} from "./api";
import * as mock from "./mock";
import type { Campaign, Holding, VoteInfo, FounderProfile, PayoutEntry, CampaignCategory, Offering } from "./mock";

export type { Campaign, Holding, VoteInfo, Milestone, MilestoneStatus, CampaignStatus, SpendEntry } from "./mock";
export { fmtUsd, fmtUsdFull, shortKey, refundsClaimable, pct, offeringStamp, describeOffering, poolFraction, vestedFraction } from "./mock";
export type { CampaignCategory, Offering, OfferingKind, PayoutEntry, TokenOffering, CampaignFlag } from "./mock";

const CATEGORY_LABEL: Record<string, string> = {
  business: "Business", crypto: "Crypto", consumer: "Consumer", saas: "SaaS", hardware: "Hardware", creator: "Creator", other: "Other",
};

/** Call only in dynamic (post-connection) server code or client effects. */
export const msUntil = (iso: string) => new Date(iso).getTime() - Date.now();
export const daysUntil = (iso: string) => Math.max(0, Math.ceil(msUntil(iso) / 86400000));
export const currentMs = () => Date.now();

export type DataSource = "live" | "demo";

export const API_BASE = process.env.NEXT_PUBLIC_HARVESTIA_API ?? "http://localhost:8787";

const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });
const api = createClient({ baseUrl: API_BASE, fetch: noStoreFetch });

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1200&q=80";
const FALLBACK_AVATAR = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80";

type ApiCampaignDetail = ApiCampaign & { rounds?: VoteRound[]; lockedUsdc?: number; founderUpfrontUsdc?: number };
export type CampaignView = Campaign & { lockedUsdc?: number; founderUpfrontUsdc?: number };

async function mockList(): Promise<Campaign[]> {
  return mock.getCampaigns();
}

function findMock(all: Campaign[], c: ApiCampaign): Campaign | undefined {
  return all.find((m) => m.id === c.id) ?? all.find((m) => m.name.toLowerCase() === c.name.toLowerCase());
}

function toUi(c: ApiCampaign, all: Campaign[]): Campaign {
  const m = findMock(all, c);
  const founder: FounderProfile = m
    ? { ...m.founder, pubkey: c.founder }
    : { pubkey: c.founder, name: `${c.name} founder`, role: "Founder", avatar: FALLBACK_AVATAR, bio: "Public, KYC-verified founder.", location: "—" };
  const n = c.useOfFunds.length || 1;
  const base = Math.floor(100 / n);
  return {
    id: c.id,
    founder,
    name: c.name,
    tagline: c.tagline,
    category: c.category ? CATEGORY_LABEL[c.category] ?? c.category : m?.category ?? "Startup",
    categoryKey: c.category ?? m?.categoryKey ?? "other",
    offering: c.offering ?? m?.offering ?? { kind: "equity", equity: { equityBps: c.equityBps, payout: { basis: "revenue", shareBps: 500, frequency: "monthly", startsAfterDays: 90 } } },
    flags: c.flags ?? m?.flags ?? [],
    image: m?.image ?? FALLBACK_IMAGE,
    problem: c.problem,
    solution: c.solution,
    useOfFunds:
      m && m.useOfFunds.length === c.useOfFunds.length
        ? c.useOfFunds.map((label, i) => ({ label, pct: m.useOfFunds[i].pct }))
        : c.useOfFunds.map((label, i) => ({ label, pct: i === 0 ? 100 - base * (n - 1) : base })),
    goalUsdc: c.goalUsdc,
    raisedUsdc: c.raisedUsdc,
    equityBps: c.equityBps,
    upfrontBps: c.upfrontBps,
    raiseDeadline: c.raiseDeadline,
    minInvestors: c.minInvestors,
    status: c.status,
    milestones: c.milestones.map((ms) => ({
      index: ms.index + 1,
      title: ms.title,
      description: ms.description,
      releaseUsdc: ms.releaseUsdc,
      deadline: ms.deadline,
      status: ms.status,
      evidenceUri: ms.evidenceUri ?? "",
      resubmitUsed: ms.resubmitUsed,
    })),
    spending: c.spending.map((s) => ({
      date: s.date,
      category: s.milestoneIndex === null ? "General" : `Milestone ${s.milestoneIndex + 1}`,
      description: s.description,
      amountUsdc: s.amountUsdc,
      txSig: s.txSig ?? "",
    })),
  };
}

export async function getSource(): Promise<{ source: DataSource; privacyMode: string | null }> {
  try {
    const h = (await api.health()) as { privacyMode?: string };
    return { source: "live", privacyMode: h.privacyMode ?? null };
  } catch {
    return { source: "demo", privacyMode: null };
  }
}

export async function getCampaignsWithSource(): Promise<{ campaigns: Campaign[]; source: DataSource }> {
  const all = await mockList();
  try {
    const live = await api.listCampaigns();
    return { campaigns: live.map((c) => toUi(c, all)), source: "live" };
  } catch {
    return { campaigns: all, source: "demo" };
  }
}

export async function getCampaigns(): Promise<Campaign[]> {
  return (await getCampaignsWithSource()).campaigns;
}

async function getDetail(id: string): Promise<{ detail: ApiCampaignDetail | null; source: DataSource }> {
  try {
    return { detail: await api.getCampaign(id), source: "live" };
  } catch (e) {
    if (e instanceof HarvestiaApiError && e.status === 404) return { detail: null, source: "live" };
    return { detail: null, source: "demo" };
  }
}

/** Returns undefined for unknown ids (caller should notFound()). */
export async function getCampaign(id: string): Promise<CampaignView | undefined> {
  const { detail, source } = await getDetail(id);
  if (source === "demo") return mock.getCampaign(id);
  return detail ? { ...toUi(detail, await mockList()), lockedUsdc: detail.lockedUsdc, founderUpfrontUsdc: detail.founderUpfrontUsdc } : undefined;
}

/** Public monthly payout ledger; falls back to mock rows when the API lacks the endpoint. */
export async function getPayouts(id: string): Promise<PayoutEntry[]> {
  try {
    const res = await api.listPayouts(id);
    const rows = Array.isArray(res) ? res : res?.entries ?? [];
    if (!rows.length) return mock.getPayouts(id);
    // Normalize: label periods "YYYY-MM", newest first.
    return rows
      .map((r) => ({ ...r, period: r.periodStart ? r.periodStart.slice(0, 7) : typeof r.period === "number" ? `P${r.period}` : r.period }))
      .sort((a, b) => String(b.periodStart ?? b.period).localeCompare(String(a.periodStart ?? a.period)));
  } catch {
    return mock.getPayouts(id);
  }
}

function voteFromRound(c: ApiCampaignDetail, r: VoteRound, all: Campaign[]): VoteInfo {
  const ms = c.milestones[r.milestoneIndex];
  void all;
  const evidence = ms?.evidenceUri ? [{ label: "Founder evidence", href: ms.evidenceUri }] : [];
  return {
    campaignId: c.id,
    milestoneIndex: r.milestoneIndex + 1,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    // Only participation % is public; ballots count is the only revealed signal.
    quorumPct: Math.min(100, r.ballots),
    quorumRequiredPct: 20,
    evidence,
  };
}

function openRound(c: ApiCampaignDetail): VoteRound | undefined {
  return (c.rounds ?? []).find((r) => c.milestones[r.milestoneIndex]?.status === "Voting" && !r.appealToReviewer);
}

export async function getVote(id: string): Promise<VoteInfo | undefined> {
  const { detail, source } = await getDetail(id);
  if (source === "demo") return mock.getVote(id);
  if (!detail) return undefined;
  const r = openRound(detail);
  return r ? voteFromRound(detail, r, await mockList()) : undefined;
}

export async function getPendingVotes(): Promise<VoteInfo[]> {
  const { campaigns, source } = await getCampaignsWithSource();
  if (source === "demo") return mock.getPendingVotes();
  const voting = campaigns.filter((c) => c.milestones.some((m) => m.status === "Voting"));
  const details = await Promise.all(voting.map((c) => getDetail(c.id)));
  const all = await mockList();
  return details.flatMap(({ detail }) => {
    const r = detail && openRound(detail);
    return detail && r ? [voteFromRound(detail, r, all)] : [];
  });
}

/**
 * Portfolio. Live holdings require the investor's local viewing key (encrypted notes are
 * decrypted client-side), so server-rendered holdings remain demo data.
 */
export async function getPortfolio(): Promise<{ holdings: Holding[]; votes: VoteInfo[]; campaigns: Campaign[]; source: DataSource }> {
  const [{ campaigns, source }, votes, holdings] = await Promise.all([getCampaignsWithSource(), getPendingVotes(), mock.getHoldings()]);
  const all = await mockList();
  const byId = new Map(campaigns.map((c) => [c.id, c]));
  for (const m of all) if (!byId.has(m.id)) byId.set(m.id, m);
  return { holdings, votes, campaigns: [...byId.values()], source };
}

// ---------------- Client-side actions (browser) ----------------
const browserApi = createClient({ baseUrl: API_BASE });

export function errorMessage(e: unknown): string {
  if (e instanceof HarvestiaApiError) return `${e.message} (${e.status})`;
  if (e instanceof Error) return e.message === "Failed to fetch" ? "API unreachable — demo mode" : e.message;
  return String(e);
}

export async function investPrivately(campaignId: string, amountUsdc: number) {
  const sealed = await sealInvestment(amountUsdc);
  return browserApi.investPrivately(campaignId, sealed);
}

/** uiIndex is 1-based. Weight is a hidden stake; mock uses a fixed demo stake. */
export async function castVote(campaignId: string, uiIndex: number, choice: "yes" | "no", weight = 12_500) {
  const vote = await sealVote(choice, weight, randomHex(), `${campaignId}:${uiIndex - 1}`);
  return browserApi.castVote(campaignId, uiIndex - 1, vote);
}

export async function submitEvidence(campaignId: string, uiIndex: number, evidenceUri: string) {
  return browserApi.submitEvidence(campaignId, uiIndex - 1, { evidenceUri });
}

export async function recordSpending(campaignId: string, input: { description: string; amountUsdc: number; milestoneIndex?: number | null }) {
  return browserApi.addSpending(campaignId, input);
}

export async function depositPayout(campaignId: string, input: { period: number; basisAmountUsdc: number; amountUsdc: number }) {
  return browserApi.depositPayout(campaignId, input);
}

export async function claimPayout(campaignId: string, positionCommitment = randomHex(32)) {
  return browserApi.claimPayout(campaignId, { positionCommitment, proof: "mockproof:" + randomHex(8) });
}

export async function registerToken(campaignId: string, mint: string, depositAmount: number) {
  return browserApi.registerToken(campaignId, { mint, depositAmount });
}

export async function claimTokens(campaignId: string, positionCommitment = randomHex(32)) {
  return browserApi.claimTokens(campaignId, { positionCommitment, proof: "mockproof:" + randomHex(8) });
}

export async function createCampaign(input: {
  category?: CampaignCategory;
  offering?: Offering;
  founder: string;
  name: string;
  tagline: string;
  problem: string;
  solution: string;
  useOfFunds: string[];
  goalUsdc: number;
  equityBps: number;
  raiseDeadline: string;
  milestones: { title: string; description: string; releaseUsdc: number; deadline: string }[];
}) {
  return browserApi.createCampaign({ upfrontBps: 2000, minInvestors: 25, ...input });
}
