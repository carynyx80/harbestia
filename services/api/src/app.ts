import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import type { Campaign, Milestone } from "@harvestia/sdk/types";
import * as R from "./rules.js";
import { Store, seed } from "./store.js";
import { MockArciumSum, MockArciumTally, MockProofVerifier, type ProofVerifier, type SumProvider, type TallyProvider } from "./privacy.js";

export interface AppDeps {
  store?: Store;
  tally?: TallyProvider;
  sum?: SumProvider;
  verifier?: ProofVerifier;
  adminKey?: string;
  now?: () => number;
  seed?: boolean;
}

const hex = z.string().regex(/^[0-9a-fA-F]{16,128}$/);
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "must be ISO date");
const CreateCampaign = z.object({
  founder: z.string().min(32).max(64),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(160),
  problem: z.string().min(1).max(2000),
  solution: z.string().min(1).max(2000),
  useOfFunds: z.array(z.string().min(1)).min(1).max(12),
  goalUsdc: z.number().int().positive(),
  equityBps: z.number().int().min(1).max(10_000),
  upfrontBps: z.number().int().min(0).max(10_000).default(R.DEFAULT_UPFRONT_BPS),
  raiseDeadline: isoDate,
  minInvestors: z.number().int().min(1).default(R.DEFAULT_MIN_INVESTORS),
  milestones: z.array(z.object({ title: z.string().min(1), description: z.string().min(1), releaseUsdc: z.number().int().positive(), deadline: isoDate })).min(1).max(10),
});
const Invest = z.object({ commitment: hex, ciphertext: z.string().min(8).max(8192), proof: z.string().min(8).max(16384), viewKeyHash: hex.optional(), encryptedNote: z.string().max(8192).optional() });
const Vote = z.object({ nullifier: hex, encryptedVote: z.string().min(8).max(8192), proof: z.string().min(8).max(16384) });
const Evidence = z.object({ evidenceUri: z.string().min(3).max(512) });
const Finalize = z.object({ force: z.boolean().optional(), reviewerApprove: z.boolean().optional() }).default({});
const Spending = z.object({ date: isoDate.optional(), description: z.string().min(1).max(500), amountUsdc: z.number().positive(), milestoneIndex: z.number().int().min(0).nullable().optional(), txSig: z.string().max(128).nullable().optional() });

export const PRIVACY_MODE = "mock" as const;
export const MOCK_PRIVACY_BANNER = "MOCK PRIVACY — amounts and votes are NOT encrypted";

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
  const store = deps.store ?? new Store();
  const sum = deps.sum ?? new MockArciumSum();
  const tallyProvider = deps.tally ?? new MockArciumTally();
  const verifier = deps.verifier ?? new MockProofVerifier();
  const adminKey = deps.adminKey ?? resolveSecret(["ADMIN_KEY", "HARVESTIA_ADMIN_KEY"], "harvestia-api");
  const now = deps.now ?? Date.now;
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
  const withRules = (camp: Campaign) => ({ ...camp, lockupEndsAt: new Date(R.lockupEndsAt(Date.parse(camp.raiseDeadline))).toISOString() });

  app.get("/health", (c) => c.json({ ok: true, service: "harvestia-api", privacyMode: PRIVACY_MODE, privacyWarning: MOCK_PRIVACY_BANNER, tally: tallyProvider.name, sum: sum.name, time: new Date(now()).toISOString() }));

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
      useOfFunds: d.useOfFunds, goalUsdc: d.goalUsdc, raisedUsdc: 0, equityBps: d.equityBps, upfrontBps: d.upfrontBps,
      raiseDeadline: new Date(d.raiseDeadline).toISOString(), minInvestors: d.minInvestors, status: "Draft",
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
    if (camp.status !== "Raising") return c.json({ error: `campaign is ${camp.status}, not Raising` }, 409);
    if (now() > Date.parse(camp.raiseDeadline)) return c.json({ error: "raise deadline passed" }, 409);
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

  app.get("/portfolio/:viewKeyHash", (c) => {
    const vk = c.req.param("viewKeyHash");
    return c.json({ viewKeyHash: vk, entries: store.portfolio.get(vk) ?? [] });
  });

  return { app, store };
}
