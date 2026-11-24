export * from "./types.js";
import type {
  Campaign, CreateCampaignInput, EvidenceInput, FinalizeResult, InvestInput, InvestResult,
  Milestone, Portfolio, SpendEntry, SpendingInput, VoteInput, VoteRound,
} from "./types.js";

export interface ClientOptions {
  baseUrl?: string;
  adminKey?: string;
  fetch?: typeof fetch;
}

export class HarvestiaApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
    this.name = "HarvestiaApiError";
  }
}

export const DEFAULT_BASE_URL = "http://localhost:8787";

export function createClient(opts: ClientOptions = {}) {
  const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const f = opts.fetch ?? globalThis.fetch;

  async function req<T>(method: string, path: string, body?: unknown, admin = false): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (admin && opts.adminKey) headers["x-admin-key"] = opts.adminKey;
    const res = await f(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new HarvestiaApiError(res.status, data?.error ?? res.statusText, data?.details);
    return data as T;
  }

  return {
    health: () => req<{ ok: boolean; service: string }>("GET", "/health"),
    listCampaigns: () => req<Campaign[]>("GET", "/campaigns"),
    getCampaign: (id: string) => req<Campaign & { rounds: VoteRound[] }>("GET", `/campaigns/${encodeURIComponent(id)}`),
    createCampaign: (input: CreateCampaignInput) => req<Campaign>("POST", "/campaigns", input),
    approveCampaign: (id: string) => req<Campaign>("POST", `/campaigns/${encodeURIComponent(id)}/approve`, {}, true),
    investPrivately: (id: string, input: InvestInput) => req<InvestResult>("POST", `/campaigns/${encodeURIComponent(id)}/invest`, input),
    submitEvidence: (id: string, idx: number, input: EvidenceInput) =>
      req<{ milestone: Milestone; round: VoteRound }>("POST", `/campaigns/${encodeURIComponent(id)}/milestones/${idx}/evidence`, input),
    castVote: (id: string, idx: number, input: VoteInput) =>
      req<{ accepted: true; ballots: number }>("POST", `/campaigns/${encodeURIComponent(id)}/milestones/${idx}/vote`, input),
    finalizeVote: (id: string, idx: number, opts2: { force?: boolean } = {}) =>
      req<FinalizeResult>("POST", `/campaigns/${encodeURIComponent(id)}/milestones/${idx}/finalize`, opts2),
    addSpending: (id: string, input: SpendingInput) => req<SpendEntry>("POST", `/campaigns/${encodeURIComponent(id)}/spending`, input),
    getPortfolio: (viewKeyHash: string) => req<Portfolio>("GET", `/portfolio/${encodeURIComponent(viewKeyHash)}`),
  };
}

export type HarvestiaClient = ReturnType<typeof createClient>;

// Convenience free functions using the default client (baseUrl from env if present).
const envBase = typeof process !== "undefined" ? (process as any).env?.NEXT_PUBLIC_HARVESTIA_API : undefined;
const defaultClient = createClient({ baseUrl: envBase ?? DEFAULT_BASE_URL });
export const listCampaigns = defaultClient.listCampaigns;
export const getCampaign = defaultClient.getCampaign;
export const createCampaign = defaultClient.createCampaign;
export const investPrivately = defaultClient.investPrivately;
export const castVote = defaultClient.castVote;
export const submitEvidence = defaultClient.submitEvidence;
export const finalizeVote = defaultClient.finalizeVote;
export const getPortfolio = defaultClient.getPortfolio;

// ---- Mock client-side encryption helpers (stand-ins for Arcium/ZK client libs) ----
// "mockenc1:" payloads are NOT secure; they let the local mock Arcium cluster decrypt.
function b64(s: string): string {
  return typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64");
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomHex(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** Build a mock-encrypted investment payload. */
export async function sealInvestment(amountUsdc: number, salt = randomHex()): Promise<Pick<InvestInput, "commitment" | "ciphertext" | "proof">> {
  const commitment = await sha256Hex(`${amountUsdc}|${salt}`);
  return { commitment, ciphertext: "mockenc1:" + b64(JSON.stringify({ amountUsdc, salt })), proof: "mockproof:" + randomHex(8) };
}
/** Build a mock-encrypted vote (weight = hidden stake). */
export async function sealVote(choice: "yes" | "no", weight: number, secret = randomHex(), scope = ""): Promise<VoteInput> {
  return {
    nullifier: await sha256Hex(`nullifier|${secret}|${scope}`),
    encryptedVote: "mockenc1:" + b64(JSON.stringify({ choice, weight })),
    proof: "mockproof:" + randomHex(8),
  };
}
