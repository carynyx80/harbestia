import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Campaign, Milestone } from "@harvestia/sdk/types";
import * as R from "./rules.js";
import { Store, seed } from "./store.js";
import { loadConfig, redact, type PrivacyConfig } from "./config.js";
import { HeliusVerifier, type ShieldVerifier } from "./helius.js";
import { registerRpcProxy } from "./rpc.js";
import { checkTreasuryDeposit, checkTreasuryPayout, computeAdminActions, deriveAta, RpcTxFetcher, SIG_RE, type RpcFetch, type TxFetcher } from "./treasury.js";
import { MockArciumClaims, MockArciumSum, MockArciumTally, MockProofVerifier, type ClaimProvider, type ProofVerifier, type SumProvider, type TallyProvider } from "./privacy.js";

export interface AppDeps {
  store?: Store;
  tally?: TallyProvider;
  sum?: SumProvider;
  verifier?: ProofVerifier;
  claims?: ClaimProvider;
  adminKey?: string;
  now?: () => number;
  seed?: boolean;
  /** Privacy config; defaults to loadConfig(process.env) (mock mode unless PRIVACY_MODE=helius). */
  config?: PrivacyConfig;
  /** Shield-tx verifier for helius mode; defaults to a HeliusVerifier on the configured RPC. */
  shieldVerifier?: ShieldVerifier;
  /** Treasury mode: getTransaction client (defaults to upstream RPC). */
  txFetcher?: TxFetcher;
  /** Fetch used by the /rpc proxy (defaults to global fetch). */
  rpcFetch?: RpcFetch;
  /** /rpc per-IP limit per minute (default 60). */
  rpcRateLimit?: number;
}

const hex = z.string().regex(/^[0-9a-fA-F]{16,128}$/);
const base58 = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 Solana address");
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be ISO date");
const Category = z.enum(["business", "crypto", "consumer", "saas", "hardware", "creator", "other"]);
const EquityOfferingSchema = z.object({
  equityBps: z.number().int().min(1).max(10_000),
  payout: z.object({
    basis: z.enum(["revenue", "profit"]),
    shareBps: z.number().int().min(1).max(10_000),
    frequency: z.literal("monthly").default("monthly"),
    startsAfterDays: z.number().int().min(0).max(730).default(R.DEFAULT_PAYOUT_STARTS_AFTER_DAYS),
  }),
});
const TokenOfferingSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9]{2,10}$/, "symbol must be 2-10 uppercase letters/digits"),
  totalSupply: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  investorAllocationBps: z.number().int().min(1).max(10_000),
  targetLaunchDate: isoDate,
  vesting: z.object({ cliffMonths: z.number().int().min(0).max(120).default(0), months: z.number().int().min(0).max(120).default(12) })
    .refine((v) => v.cliffMonths <= v.months || v.months === 0, "cliffMonths must be <= months")
    .default({ cliffMonths: 0, months: 12 }),
});
const OfferingSchema = z.object({
  kind: z.enum(["equity", "token", "both"]),
  equity: EquityOfferingSchema.optional(),
  token: TokenOfferingSchema.optional(),
}).superRefine((o, ctx) => {
  const needEq = o.kind !== "token", needTok = o.kind !== "equity";
  if (needEq && !o.equity) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["equity"], message: `offering.equity is required for kind "${o.kind}"` });
  if (!needEq && o.equity) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["equity"], message: `offering.equity not allowed for kind "token"` });
  if (needTok && !o.token) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["token"], message: `offering.token is required for kind "${o.kind}"` });
  if (!needTok && o.token) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["token"], message: `offering.token not allowed for kind "equity"` });
});
const CreateCampaign = z.object({
  founder: z.string().min(32).max(64),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  problem: z.string().min(1).max(2000),
  solution: z.string().min(1).max(2000),
  useOfFunds: z.array(z.string().min(1)).min(1).max(12),
  goalUsdc: z.number().int().positive(),
  equityBps: z.number().int().min(0).max(10_000).optional(),
  category: Category.optional(),
  offering: OfferingSchema.optional(),
  upfrontBps: z.number().int().min(0).max(10_000).default(R.DEFAULT_UPFRONT_BPS),
  raiseDeadline: isoDate,
  minInvestors: z.number().int().min(1).default(R.DEFAULT_MIN_INVESTORS),
  ringAccount: base58.optional(),
  founderPayoutWallet: base58.optional(),
  milestones: z.array(z.object({ title: z.string().min(1), description: z.string().min(1), releaseUsdc: z.number().int().positive(), deadline: isoDate })).min(1).max(10),
}).superRefine((d, ctx) => {
  if (!d.offering) {
    if (d.equityBps === undefined || d.equityBps < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["equityBps"], message: "equityBps (>= 1) is required when no offering is given" });
    return;
  }
  const eq = d.offering.equity?.equityBps;
  if (eq !== undefined && d.equityBps !== undefined && d.equityBps !== eq) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["equityBps"], message: "equityBps must equal offering.equity.equityBps" });
  if (eq === undefined && d.equityBps) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["equityBps"], message: "token-only offerings sell no equity; omit equityBps or set 0" });
});
const DepositPayout = z.object({
  period: z.number().int().min(1).max(1200),
  basisAmountUsdc: z.number().min(0).max(1e12),
  amountUsdc: z.number().min(0).optional(),
  reportUri: z.string().min(3).max(512).optional(),
  txSig: z.string().max(128).optional(),
});
const Claim = z.object({ positionCommitment: hex, proof: z.string().min(8).max(16384) });
const RegisterToken = z.object({ mint: z.string().min(32).max(64), depositAmount: z.number().int().positive(), txSig: z.string().max(128).optional() });
const HeliusInvest = z.object({ txSignature: z.string().min(64).max(90), commitment: hex, viewKeyHash: hex.optional(), encryptedNote: z.string().max(8192).optional() });
const TreasuryInvest = z.object({ txSignature: z.string().regex(SIG_RE, "malformed signature") });
const Settle = z.object({ txSignature: z.string().regex(SIG_RE, "malformed signature") });
const Invest = z.object({ commitment: hex, ciphertext: z.string().min(8).max(8192), proof: z.string().min(8).max(16384), viewKeyHash: hex.optional(), encryptedNote: z.string().max(8192).optional() });
const Vote = z.object({ nullifier: hex, encryptedVote: z.string().min(8).max(8192), proof: z.string().min(8).max(16384) });
const Evidence = z.object({ evidenceUri: z.string().min(3).max(512) });
const Finalize = z.object({ force: z.boolean().optional(), reviewerApprove: z.boolean().optional() }).default({});
const Spending = z.object({ date: isoDate.optional(), description: z.string().min(1).max(500), amountUsdc: z.number().positive(), milestoneIndex: z.number().int().min(0).nullable().optional(), txSig: z.string().max(128).nullable().optional() });

export const PRIVACY_MODE = "mock" as const;
export const MOCK_PRIVACY_BANNER = "MOCK PRIVACY — amounts and votes are NOT encrypted";
export const HELIUS_PRIVACY_NOTE = "HELIUS PRIVACY RINGS — deposits verified on-chain; vote tally and sum remain MOCK";

const isProduction = () => process.env.NODE_ENV === "production";

/**
 * Resolve a shared secret from env. Production: refuse to start without it.
 * Development: generate a random key and print it once.
 */
export function resolveSecret(envNames: string[], label: string): string {
  for (const n of envNames) {
    const v = process.env[n];
    if (v && v.length > 0) return v;
  }
  if (isProduction()) throw new Error(`${envNames[0]} must be set when NODE_ENV=production (refusing to start)`);
  const key = randomBytes(24).toString("hex");
  console.warn(`[${label}] ${envNames[0]} not set; generated a random development key for this process: ${key}`);
  return key;
}

export function safeEqual(a: string | undefined, b: string): boolean {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createApp(deps: AppDeps = {}) {
  const config = deps.config ?? loadConfig(process.env);
  const store = deps.store ?? new Store();
  const sum = deps.sum ?? new MockArciumSum();
  const tallyProvider = deps.tally ?? new MockArciumTally();
  const verifier = deps.verifier ?? new MockProofVerifier();
  const claims = deps.claims ?? new MockArciumClaims();
  const adminKey = deps.adminKey ?? resolveSecret(["ADMIN_KEY", "HARVESTIA_ADMIN_KEY"], "harvestia-api");
  const now = deps.now ?? Date.now;
  const helius = config.privacyMode === "helius";
  const shieldVerifier: ShieldVerifier | undefined = deps.shieldVerifier
    ?? (helius ? new HeliusVerifier({ rpcUrl: config.rpcUrl!, apiKey: config.heliusApiKey, ringProgramId: config.ringProgramId, now }) : undefined);
  const treasury = config.treasuryMode;
  const treasuryUsdcAta = deriveAta(config.treasuryWallet, config.usdcMint);
  const txFetcher: TxFetcher = deps.txFetcher ?? new RpcTxFetcher(config.upstreamRpcUrl, config.heliusApiKey, deps.rpcFetch);
  const pendingSigs = new Set<string>();
  const publicConfig = treasury
    ? { mode: "treasury" as const, cluster: config.cluster, treasuryWallet: config.treasuryWallet, treasuryUsdcAta, usdcMint: config.usdcMint, privacyMode: config.privacyMode, ringProgramId: config.ringProgramId }
    : { privacyMode: config.privacyMode, cluster: config.cluster, ringProgramId: config.ringProgramId };
  const awaitingWithdrawal = (camp: Campaign, kind: "payout" | "token" | "refund") => ({
    status: "awaiting_onchain_withdrawal", kind, campaignId: camp.id, ...publicConfig, ringAccount: camp.ringAccount ?? null,
    instructions: [
      "Withdrawals are settled on-chain through Helius Privacy Rings; the API never holds funds or keys.",
      `In your browser wallet, build and sign an unshield (withdraw) transaction against program ${config.ringProgramId} on ${config.cluster}${camp.ringAccount ? ` for ring account ${camp.ringAccount}` : ""}.`,
      "Your claimable amount is computed privately; it is not returned by this API.",
    ],
  });
  if (deps.seed !== false) seed(store, now());
  for (const c of store.campaigns.values()) sum.seed(c.id, c.raisedUsdc);

  const app = new Hono();
  app.use("*", cors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","), allowHeaders: ["content-type", "x-admin-key"], allowMethods: ["GET", "POST", "OPTIONS"] }));
  app.onError((err, c) => {
    if (err instanceof R.RuleError) return c.json({ error: err.message }, 409);
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  const parse = async <T extends z.ZodTypeAny>(c: any, schema: T): Promise<{ ok: true; data: z.infer<T> } | { ok: false; res: Response }> => {
    const raw = await c.req.json().catch(() => undefined);
    const r = schema.safeParse(raw ?? {});
    if (!r.success) return { ok: false, res: c.json({ error: "validation failed", details: r.error.flatten() }, 400) };
    return { ok: true, data: r.data };
  };
  const getC = (id: string) => store.campaigns.get(id);
  const getM = (c: Campaign, idx: string): Milestone | undefined => c.milestones[Number(idx)];
  const isAdmin = (c: any) => safeEqual(c.req.header("x-admin-key"), adminKey);
  const payoutDeposits = (id: string) => new Map((store.payouts.get(id) ?? []).map((d) => [d.period, d.depositedAt] as [number, number]));
  const payoutStatusOf = (camp: Campaign) => {
    const eq = camp.offering?.equity;
    if (!eq) return undefined;
    const { statuses: _s, ...pub } = R.computePayoutStatus(Date.parse(camp.raiseDeadline), eq.payout.startsAfterDays, payoutDeposits(camp.id), now());
    return pub;
  };
  const tokenStatusOf = (camp: Campaign) => {
    const tok = camp.offering?.token;
    if (!tok) return undefined;
    const launch = store.tokens.get(camp.id);
    const target = Date.parse(tok.targetLaunchDate);
    return {
      ...R.computeTokenStatus(target, launch, now()),
      launchedAt: launch ? new Date(launch.launchedAt).toISOString() : null,
      investorAllocation: R.investorTokenAllocation(tok.totalSupply, tok.investorAllocationBps),
      overdueAt: new Date(target + R.TOKEN_OVERDUE_MS).toISOString(),
    };
  };
  const withRules = (camp: Campaign) => {
    const payoutStatus = payoutStatusOf(camp), tokenStatus = tokenStatusOf(camp);
    const flags: NonNullable<Campaign["flags"]> = [];
    if (payoutStatus?.defaulted) flags.push("PayoutDefault");
    if (tokenStatus?.overdue) flags.push("TokenOverdue");
    return {
      ...camp,
      lockupEndsAt: new Date(R.lockupEndsAt(Date.parse(camp.raiseDeadline))).toISOString(),
      ...(payoutStatus ? { payoutStatus } : {}),
      ...(tokenStatus ? { tokenStatus } : {}),
      flags,
    };
  };
  const ledgerOf = (camp: Campaign) => {
    const eq = camp.offering!.equity!;
    const close = Date.parse(camp.raiseDeadline);
    const deposits = new Map((store.payouts.get(camp.id) ?? []).map((d) => [d.period, d]));
    const st = R.computePayoutStatus(close, eq.payout.startsAfterDays, payoutDeposits(camp.id), now());
    const entries = st.statuses.map((status, i) => {
      const k = i + 1, b = R.payoutPeriod(close, eq.payout.startsAfterDays, k), d = deposits.get(k);
      return {
        period: k, periodStart: new Date(b.start).toISOString(), periodEnd: new Date(b.end).toISOString(), dueDate: new Date(b.due).toISOString(),
        basis: eq.payout.basis, basisAmountUsdc: d?.basisAmountUsdc ?? null, paidUsdc: d?.paidUsdc ?? 0, status,
        depositedAt: d ? new Date(d.depositedAt).toISOString() : null, reportUri: d?.reportUri ?? null, txSig: d?.txSig ?? null,
      };
    });
    const { statuses: _s, ...payoutStatus } = st;
    return { campaignId: camp.id, basis: eq.payout.basis, shareBps: eq.payout.shareBps, entries, payoutStatus };
  };
  const totalInvestorShares = (camp: Campaign) => Math.floor(camp.raisedUsdc); // founder-retained shares excluded
  const positionOf = (id: string, commitment: string) => store.positions.get(id)?.get(commitment);

  app.get("/config", (c) => c.json(publicConfig));

  registerRpcProxy(app, { upstreamUrl: config.upstreamRpcUrl, fetch: deps.rpcFetch, limit: deps.rpcRateLimit, now });

  /** Fetch + verify a tx exactly once (replay-safe across concurrent requests). */
  const withSignature = async <T>(sig: string, fn: (tx: any) => T & { ok: boolean }): Promise<(T & { ok: boolean }) | { ok: false; reason: string; status: number }> => {
    if (store.usedSignatures.has(sig) || pendingSigs.has(sig)) return { ok: false, reason: "signature already used", status: 409 };
    pendingSigs.add(sig);
    try {
      let tx;
      try { tx = await txFetcher.getTransaction(sig); } catch (e) {
        return { ok: false, reason: redact(`could not verify transaction: ${(e as Error).message}`, config.heliusApiKey), status: 502 };
      }
      const r = fn(tx);
      if (r.ok) store.usedSignatures.add(sig);
      return r;
    } finally { pendingSigs.delete(sig); }
  };
  const adminActions = () => computeAdminActions({ campaigns: [...store.campaigns.values()], investments: store.treasuryInvestments, payouts: store.payouts, settled: store.settlements, usdcMint: config.usdcMint });

  app.get("/admin/actions", (c) => {
    if (!treasury) return c.json({ error: "treasury mode is off" }, 404);
    const actions = adminActions();
    return c.json({ treasuryWallet: config.treasuryWallet, treasuryUsdcAta, usdcMint: config.usdcMint, cluster: config.cluster, due: actions.filter((a) => a.status === "due"), actions });
  });

  app.post("/admin/actions/:actionId/settle", async (c) => {
    if (!treasury) return c.json({ error: "treasury mode is off" }, 404);
    const actionId = c.req.param("actionId");
    const action = adminActions().find((a) => a.actionId === actionId);
    if (!action) return c.json({ error: "action not found" }, 404);
    if (action.status === "settled") return c.json({ error: "action already settled" }, 409);
    const p = await parse(c, Settle);
    if (!p.ok) return p.res;
    const sig = p.data.txSignature;
    const r = await withSignature(sig, (tx) => checkTreasuryPayout(tx, { signature: sig, treasuryWallet: config.treasuryWallet, treasuryAta: treasuryUsdcAta, recipientAta: action.recipientAta, usdcMint: config.usdcMint, amountMicro: BigInt(action.amountMicro) }));
    if (!r.ok) return c.json({ error: `settlement rejected: ${r.reason}` }, "status" in r ? (r.status as 409 | 502) : 400);
    store.settlements.set(actionId, { txSignature: sig, settledAt: now() });
    return c.json({ ...action, status: "settled", txSignature: sig, settled: true });
  });

  app.get("/health", (c) => c.json({ ok: true, service: "harvestia-api", ...(treasury ? { mode: "treasury" } : {}), privacyMode: config.privacyMode, cluster: config.cluster, privacyWarning: helius ? HELIUS_PRIVACY_NOTE : MOCK_PRIVACY_BANNER, tally: tallyProvider.name, sum: sum.name, time: new Date(now()).toISOString() }));

  app.get("/campaigns", (c) => c.json([...store.campaigns.values()].map(withRules)));

  app.get("/campaigns/:id", (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    return c.json({
      ...withRules(camp), rounds: store.roundsFor(camp.id), investorCount: store.investorCount.get(camp.id) ?? 0,
      lockedUsdc: R.lockedUsdc(camp), successFeeUsdc: R.successFeeUsdc(camp.raisedUsdc), founderUpfrontUsdc: R.founderUpfrontUsdc(camp),
    });
  });

  app.post("/campaigns", async (c) => {
    const p = await parse(c, CreateCampaign);
    if (!p.ok) return p.res;
    const d = p.data;
    const camp: Campaign = {
      id: store.newId(), founder: d.founder, name: d.name, tagline: d.tagline, problem: d.problem, solution: d.solution,
      useOfFunds: d.useOfFunds, goalUsdc: d.goalUsdc, raisedUsdc: 0, equityBps: d.offering?.equity?.equityBps ?? d.equityBps ?? 0, upfrontBps: d.upfrontBps,
      raiseDeadline: new Date(d.raiseDeadline).toISOString(), minInvestors: d.minInvestors, status: "Draft",
      category: d.category ?? "other",
      ...(d.ringAccount ? { ringAccount: d.ringAccount } : {}),
      ...(d.founderPayoutWallet ? { founderPayoutWallet: d.founderPayoutWallet } : {}),
      ...(d.offering ? { offering: {
        kind: d.offering.kind,
        ...(d.offering.equity ? { equity: d.offering.equity } : {}),
        ...(d.offering.token ? { token: { ...d.offering.token, targetLaunchDate: new Date(d.offering.token.targetLaunchDate).toISOString() } } : {}),
      } } : {}),
      milestones: d.milestones.map((x, index) => ({ index, ...x, deadline: new Date(x.deadline).toISOString(), status: "Pending", evidenceUri: null, resubmitUsed: false })),
      spending: [],
    };
    if (!R.milestoneSumValid(camp)) return c.json({ error: "upfront + milestone releases exceed goalUsdc" }, 400);
    if (!R.upfrontCoversFee(camp)) return c.json({ error: `upfrontBps must be >= ${R.SUCCESS_FEE_BPS} so the upfront tranche covers the 5% success fee` }, 400);
    store.campaigns.set(camp.id, camp);
    store.investorCount.set(camp.id, 0);
    sum.seed(camp.id, 0);
    return c.json(withRules(camp), 201);
  });

  app.post("/campaigns/:id/approve", (c) => {
    if (!isAdmin(c)) return c.json({ error: "admin key required" }, 401);
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (camp.status !== "Draft") return c.json({ error: `campaign is ${camp.status}, not Draft` }, 409);
    camp.status = "Raising";
    return c.json(withRules(camp));
  });

  app.post("/campaigns/:id/invest", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (treasury && camp.sample) return c.json({ error: "Sample campaign — investing disabled" }, 403);
    if (camp.status !== "Raising") return c.json({ error: `campaign is ${camp.status}, not Raising` }, 409);
    if (now() > Date.parse(camp.raiseDeadline)) return c.json({ error: "raise deadline passed" }, 409);
    if (treasury) {
      const tp = await parse(c, TreasuryInvest);
      if (!tp.ok) return tp.res;
      const sig = tp.data.txSignature;
      const r = await withSignature(sig, (tx) => checkTreasuryDeposit(tx, { signature: sig, campaignId: camp.id, treasuryAta: treasuryUsdcAta, usdcMint: config.usdcMint }));
      if (!r.ok) return c.json({ error: `deposit rejected: ${r.reason}` }, "status" in r ? (r.status as 409 | 502) : 400);
      const list = store.treasuryInvestments.get(camp.id) ?? [];
      const isNew = !list.some((i) => i.investor === r.signer);
      list.push({ signature: sig, investor: r.signer, amountMicro: r.amountMicro, at: now() });
      store.treasuryInvestments.set(camp.id, list);
      camp.raisedUsdc = Math.round((camp.raisedUsdc + r.amountUsdc) * 1e6) / 1e6;
      sum.seed(camp.id, camp.raisedUsdc);
      const count = (store.investorCount.get(camp.id) ?? 0) + (isNew ? 1 : 0);
      store.investorCount.set(camp.id, count);
      return c.json({ recorded: true, amountUsdc: r.amountUsdc, raisedUsdc: camp.raisedUsdc, investorCount: count, txSignature: sig }, 201);
    }
    if (helius) {
      if (!camp.ringAccount) return c.json({ error: "campaign has no ringAccount configured for Helius Privacy Rings" }, 409);
      const hp = await parse(c, HeliusInvest);
      if (!hp.ok) return hp.res;
      const { txSignature, commitment, viewKeyHash, encryptedNote } = hp.data;
      const seenH = store.commitments.get(camp.id) ?? new Set<string>();
      if (seenH.has(commitment)) return c.json({ error: "commitment already used" }, 409);
      let vr;
      try {
        vr = await shieldVerifier!.verify(txSignature, camp.ringAccount);
      } catch (e) {
        return c.json({ error: redact(`could not verify transaction: ${(e as Error).message}`, config.heliusApiKey) }, 502);
      }
      if (!vr.ok) return c.json({ error: `shield transaction rejected: ${vr.reason}` }, vr.reason === "signature already used" ? 409 : 400);
      seenH.add(commitment);
      store.commitments.set(camp.id, seenH);
      const countH = (store.investorCount.get(camp.id) ?? 0) + 1;
      store.investorCount.set(camp.id, countH);
      const receiptIdH = store.newId();
      if (viewKeyHash && encryptedNote) {
        const list = store.portfolio.get(viewKeyHash) ?? [];
        list.push({ campaignId: camp.id, receiptId: receiptIdH, commitment, encryptedNote, createdAt: new Date(now()).toISOString() });
        store.portfolio.set(viewKeyHash, list);
      }
      return c.json({ receiptId: receiptIdH, status: "confirmed", txSignature, slot: vr.slot, investorCount: countH, amountRevealedTotal: camp.raisedUsdc }, 201);
    }
    const p = await parse(c, Invest);
    if (!p.ok) return p.res;
    const { commitment, ciphertext, proof, viewKeyHash, encryptedNote } = p.data;
    const seen = store.commitments.get(camp.id) ?? new Set<string>();
    if (seen.has(commitment)) return c.json({ error: "commitment already used" }, 409);
    if (!(await verifier.verify("invest", proof, { campaignId: camp.id, commitment }))) return c.json({ error: "invalid proof" }, 400);
    let total: number;
    try {
      ({ amountRevealedTotal: total } = await sum.addToSum(camp.id, ciphertext, commitment));
    } catch (e) {
      return c.json({ error: `encrypted sum rejected: ${(e as Error).message}` }, 400);
    }
    seen.add(commitment);
    store.commitments.set(camp.id, seen);
    camp.raisedUsdc = total;
    const count = (store.investorCount.get(camp.id) ?? 0) + 1;
    store.investorCount.set(camp.id, count);
    const posMap = store.positions.get(camp.id) ?? new Map();
    const shares = BigInt(await claims.sharesOf(ciphertext).catch(() => 0));
    posMap.set(commitment, { ciphertext, payoutDebt: R.payoutDebtFor(shares, store.payoutAcc.get(camp.id) ?? 0n), tokensClaimed: 0 });
    store.positions.set(camp.id, posMap);
    const receiptId = store.newId();
    if (viewKeyHash && encryptedNote) {
      const list = store.portfolio.get(viewKeyHash) ?? [];
      list.push({ campaignId: camp.id, receiptId, commitment, encryptedNote, createdAt: new Date(now()).toISOString() });
      store.portfolio.set(viewKeyHash, list);
    }
    return c.json({ receiptId, amountRevealedTotal: total, investorCount: count }, 201);
  });

  app.post("/campaigns/:id/milestones/:idx/evidence", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const ms = getM(camp, c.req.param("idx"));
    if (!ms) return c.json({ error: "milestone not found" }, 404);
    const p = await parse(c, Evidence);
    if (!p.ok) return p.res;
    const why = R.canSubmitEvidence(ms, camp.status, now()) ?? (R.previousReleased(camp, ms.index) ? null : "previous milestones must be released first");
    if (why) return c.json({ error: why }, 409);
    ms.evidenceUri = p.data.evidenceUri;
    ms.status = "Voting";
    const prev = store.rounds.get(store.roundKey(camp.id, ms.index));
    const round = store.openRound(camp.id, ms.index, now());
    if (prev) round.exitWindowClosesAt = prev.exitWindowClosesAt;
    return c.json({ milestone: ms, round: store.publicRound(round) });
  });

  app.post("/campaigns/:id/milestones/:idx/vote", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const ms = getM(camp, c.req.param("idx"));
    if (!ms) return c.json({ error: "milestone not found" }, 404);
    const round = store.rounds.get(store.roundKey(camp.id, ms.index));
    if (ms.status !== "Voting" || !round || round.appealToReviewer) return c.json({ error: "milestone is not open for voting" }, 409);
    if (!R.isVoteOpen(Date.parse(round.opensAt), Date.parse(round.closesAt), now())) return c.json({ error: "vote window closed" }, 409);
    const p = await parse(c, Vote);
    if (!p.ok) return p.res;
    const { nullifier, encryptedVote, proof } = p.data;
    if (round.nullifiers.has(nullifier)) return c.json({ error: "nullifier already used" }, 409);
    if (!(await verifier.verify("vote", proof, { campaignId: camp.id, milestoneIndex: String(ms.index), nullifier }))) return c.json({ error: "invalid proof" }, 400);
    round.nullifiers.add(nullifier);
    round.ballotsSealed.push({ nullifier, encryptedVote });
    return c.json({ accepted: true, ballots: round.ballotsSealed.length });
  });

  app.post("/campaigns/:id/milestones/:idx/finalize", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const ms = getM(camp, c.req.param("idx"));
    if (!ms) return c.json({ error: "milestone not found" }, 404);
    const round = store.rounds.get(store.roundKey(camp.id, ms.index));
    if (ms.status !== "Voting" || !round) return c.json({ error: "milestone is not in Voting" }, 409);
    const p = await parse(c, Finalize);
    if (!p.ok) return p.res;
    const t = now();
    let result: R.TransitionResult;
    let tallyResult;
    if (round.appealToReviewer) {
      if (!isAdmin(c) || p.data.reviewerApprove === undefined) return c.json({ error: "appeal pending: reviewer (admin) must rule with reviewerApprove" }, 409);
      result = R.applyReviewerRuling(camp, ms.index, p.data.reviewerApprove, t);
      tallyResult = { outcome: p.data.reviewerApprove ? "Approved" : "Rejected", turnout: 0, yesShare: 0 } as const;
    } else {
      const forced = p.data.force === true;
      if (forced && isProduction()) return c.json({ error: "force-finalize is disabled in production" }, 403);
      if (forced && !isAdmin(c)) return c.json({ error: "force requires admin" }, 401);
      const why = R.canFinalize(Date.parse(round.closesAt), t, forced);
      if (why) return c.json({ error: why }, 409);
      tallyResult = await tallyProvider.tally(round.ballotsSealed, camp.raisedUsdc);
      result = R.applyOutcome(camp, ms.index, tallyResult.outcome, round, t);
    }
    camp.milestones[ms.index] = result.milestone;
    camp.status = result.campaignStatus;
    const out = round;
    if (result.reopenVote) {
      // First quorum failure: extend the SAME window once by 3 days (ballots/nullifiers kept).
      round.closesAt = new Date(Date.parse(round.closesAt) + result.extendVoteMs).toISOString();
      round.quorumFailures = result.round.quorumFailures;
    } else {
      round.quorumFailures = result.round.quorumFailures;
      round.appealToReviewer = result.round.appealToReviewer;
      if (!round.appealToReviewer) {
        round.finalizedAt = t;
        round.exitWindowClosesAt = new Date(t + R.EXIT_WINDOW_MS).toISOString();
      }
    }
    return c.json({ tally: tallyResult, milestone: result.milestone, campaign: withRules(camp), round: store.publicRound(out) });
  });

  app.post("/campaigns/:id/spending", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (camp.status === "Draft") return c.json({ error: "campaign not live" }, 409);
    const p = await parse(c, Spending);
    if (!p.ok) return p.res;
    const e = { id: store.newId(), date: p.data.date ? new Date(p.data.date).toISOString() : new Date(now()).toISOString(), description: p.data.description, amountUsdc: p.data.amountUsdc, milestoneIndex: p.data.milestoneIndex ?? null, txSig: p.data.txSig ?? null };
    camp.spending.push(e);
    return c.json(e, 201);
  });

  // ---------------- Offerings (v2): payouts ----------------
  app.get("/campaigns/:id/payouts", (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (!camp.offering?.equity) return c.json({ error: "campaign has no equity payout offering" }, 404);
    return c.json(ledgerOf(camp));
  });

  app.post("/campaigns/:id/payouts", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const eq = camp.offering?.equity;
    if (!eq) return c.json({ error: "campaign has no equity payout offering" }, 409);
    if (camp.status !== "Active" && camp.status !== "Completed") return c.json({ error: `campaign is ${camp.status}; payouts start after the raise closes` }, 409);
    const p = await parse(c, DepositPayout);
    if (!p.ok) return p.res;
    const d = p.data, t = now();
    const close = Date.parse(camp.raiseDeadline);
    const b = R.payoutPeriod(close, eq.payout.startsAfterDays, d.period);
    if (t < b.end) return c.json({ error: `period ${d.period} has not ended yet (ends ${new Date(b.end).toISOString()})` }, 409);
    if ((store.payouts.get(camp.id) ?? []).some((x) => x.period === d.period)) return c.json({ error: `period ${d.period} already paid` }, 409);
    const amount = R.payoutAmountUsdc(d.basisAmountUsdc, eq.payout.shareBps);
    if (d.amountUsdc !== undefined && Math.abs(d.amountUsdc - amount) > 0.005) return c.json({ error: `amountUsdc must equal ${eq.payout.basis} x shareBps = ${amount}` }, 400);
    if (totalInvestorShares(camp) <= 0) return c.json({ error: "no investor shares" }, 409);
    store.recordPayout(camp.id, { period: d.period, basisAmountUsdc: d.basisAmountUsdc, paidUsdc: amount, depositedAt: t, reportUri: d.reportUri ?? null, txSig: d.txSig ?? null }, totalInvestorShares(camp));
    const entry = ledgerOf(camp).entries.find((e) => e.period === d.period)!;
    return c.json(entry, 201);
  });

  app.post("/campaigns/:id/payouts/claim", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (!camp.offering?.equity) return c.json({ error: "campaign has no equity payout offering" }, 409);
    if (helius) return c.json(awaitingWithdrawal(camp, "payout"), 202);
    const p = await parse(c, Claim);
    if (!p.ok) return p.res;
    const pos = positionOf(camp.id, p.data.positionCommitment);
    if (!pos) return c.json({ error: "position not found" }, 404);
    if (!(await verifier.verify("payoutClaim", p.data.proof, { campaignId: camp.id, positionCommitment: p.data.positionCommitment }))) return c.json({ error: "invalid proof" }, 400);
    const shares = BigInt(await claims.sharesOf(pos.ciphertext));
    const acc = store.payoutAcc.get(camp.id) ?? 0n;
    const claimable = R.claimablePayout(shares, acc, pos.payoutDebt);
    pos.payoutDebt = R.payoutDebtFor(shares, acc);
    const claimId = store.newId();
    store.claims.set(claimId, { campaignId: camp.id, kind: "payout", positionCommitment: p.data.positionCommitment, at: now() });
    return c.json({ claimId, positionCommitment: p.data.positionCommitment, encryptedClaim: await claims.sealClaim(R.fromMicro(claimable), "USDC") });
  });

  // ---------------- Offerings (v2): token ----------------
  app.post("/campaigns/:id/token", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const tok = camp.offering?.token;
    if (!tok) return c.json({ error: "campaign has no token offering" }, 409);
    if (camp.status === "Draft" || camp.status === "Raising" || camp.status === "Failed") return c.json({ error: `campaign is ${camp.status}; token registers after the raise closes` }, 409);
    if (store.tokens.has(camp.id)) return c.json({ error: "token already registered" }, 409);
    const p = await parse(c, RegisterToken);
    if (!p.ok) return p.res;
    const alloc = R.investorTokenAllocation(tok.totalSupply, tok.investorAllocationBps);
    if (p.data.depositAmount !== alloc) return c.json({ error: `depositAmount must equal investor allocation ${alloc} ${tok.symbol}` }, 400);
    store.tokens.set(camp.id, { mint: p.data.mint, launchedAt: now(), deposited: alloc, txSig: p.data.txSig ?? null });
    return c.json(tokenStatusOf(camp), 201);
  });

  app.post("/campaigns/:id/token/claim", async (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    const tok = camp.offering?.token;
    if (!tok) return c.json({ error: "campaign has no token offering" }, 409);
    const launch = store.tokens.get(camp.id);
    if (!launch) return c.json({ error: "token not launched" }, 409);
    if (helius) return c.json(awaitingWithdrawal(camp, "token"), 202);
    const p = await parse(c, Claim);
    if (!p.ok) return p.res;
    const pos = positionOf(camp.id, p.data.positionCommitment);
    if (!pos) return c.json({ error: "position not found" }, 404);
    if (!(await verifier.verify("tokenClaim", p.data.proof, { campaignId: camp.id, positionCommitment: p.data.positionCommitment }))) return c.json({ error: "invalid proof" }, 400);
    const shares = await claims.sharesOf(pos.ciphertext);
    const frac = R.vestedFraction(launch.launchedAt, now(), tok.vesting);
    const amount = R.claimableTokens(launch.deposited, shares, totalInvestorShares(camp), frac, pos.tokensClaimed);
    pos.tokensClaimed += amount;
    const claimId = store.newId();
    store.claims.set(claimId, { campaignId: camp.id, kind: "token", positionCommitment: p.data.positionCommitment, at: now() });
    return c.json({ claimId, positionCommitment: p.data.positionCommitment, encryptedClaim: await claims.sealClaim(amount, tok.symbol) });
  });

  app.post("/campaigns/:id/refunds/claim", (c) => {
    const camp = getC(c.req.param("id"));
    if (!camp) return c.json({ error: "campaign not found" }, 404);
    if (camp.status !== "Refunding" && camp.status !== "Failed") return c.json({ error: `campaign is ${camp.status}; refunds open only when Refunding or Failed` }, 409);
    if (helius) return c.json(awaitingWithdrawal(camp, "refund"), 202);
    return c.json({ error: "refund claims are settled on-chain; not available in mock mode" }, 501);
  });

  app.get("/portfolio/:viewKeyHash", (c) => {
    const vk = c.req.param("viewKeyHash");
    return c.json({ viewKeyHash: vk, entries: store.portfolio.get(vk) ?? [] });
  });

  return { app, store, config: publicConfig };
}
