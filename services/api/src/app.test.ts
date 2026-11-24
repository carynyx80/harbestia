import { test } from "node:test";
import assert from "node:assert/strict";
import { sealClaim, sealInvestment, sealVote, openMockClaim } from "@harvestia/sdk";
import { createApp as createAppRaw, resolveSecret, type AppDeps } from "./app.js";
import { DAY_MS } from "./rules.js";

const ADMIN = "test-admin-key";
const createApp = (d: AppDeps = {}) => createAppRaw({ adminKey: ADMIN, ...d });
const j = (body: unknown, admin = false) => ({ method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": ADMIN } : {}) }, body: JSON.stringify(body) });

test("seed has 5 campaigns incl. FreshBox", async () => {
  const { app } = createApp();
  const list = await (await app.request("/campaigns")).json();
  assert.equal(list.length, 5);
  const fb = list.find((c: any) => c.id === "freshbox");
  assert.equal(fb.goalUsdc, 500_000);
  assert.deepEqual(fb.milestones.map((m: any) => m.releaseUsdc), [150_000, 150_000, 100_000]);
});

test("create -> approve -> private invest updates only public total", async () => {
  const { app } = createApp();
  const body = { founder: "F".repeat(44), name: "X", tagline: "t", problem: "p", solution: "s", useOfFunds: ["a"], goalUsdc: 100_000, equityBps: 1000, raiseDeadline: new Date(Date.now() + 10 * DAY_MS).toISOString(), milestones: [{ title: "m", description: "d", releaseUsdc: 50_000, deadline: new Date(Date.now() + 90 * DAY_MS).toISOString() }] };
  const created = await (await app.request("/campaigns", j(body))).json();
  assert.equal(created.status, "Draft");
  assert.equal((await app.request(`/campaigns/${created.id}/approve`, j({}))).status, 401);
  assert.equal((await (await app.request(`/campaigns/${created.id}/approve`, j({}, true))).json()).status, "Raising");
  const inv = await sealInvestment(2500);
  const r = await (await app.request(`/campaigns/${created.id}/invest`, j({ ...inv, viewKeyHash: "ab".repeat(16), encryptedNote: "enc-blob" }))).json();
  assert.equal(r.amountRevealedTotal, 2500);
  assert.equal((await app.request(`/campaigns/${created.id}/invest`, j(inv))).status, 409); // reused commitment
  const pf = await (await app.request(`/portfolio/${"ab".repeat(16)}`)).json();
  assert.equal(pf.entries[0].encryptedNote, "enc-blob");
  assert.equal("amountUsdc" in pf.entries[0], false);
});

test("vote: reused nullifier rejected; finalize approves FreshBox M3", async () => {
  const { app } = createApp();
  const v1 = await sealVote("yes", 50_000, "alice", "freshbox:0");
  const v2 = await sealVote("yes", 50_000, "bob", "freshbox:0");
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/vote", j(v1))).status, 200);
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/vote", j(v1))).status, 409);
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/vote", j(v2))).status, 200);
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/finalize", j({}))).status, 409); // window open
  const fin = await (await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }, true))).json();
  assert.equal(fin.tally.outcome, "Approved");
  assert.equal(fin.milestone.status, "Released");
  assert.ok(fin.round.exitWindowClosesAt);
});

test("quorum failure reopens vote, second failure goes to reviewer", async () => {
  const { app } = createApp();
  const f1 = await (await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }, true))).json();
  assert.equal(f1.tally.outcome, "QuorumFailed");
  assert.equal(f1.milestone.status, "Voting");
  assert.equal(f1.round.quorumFailures, 1);
  assert.equal(f1.round.appealToReviewer, false);
  const f2 = await (await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }, true))).json();
  assert.equal(f2.round.appealToReviewer, true);
  const f3 = await (await app.request("/campaigns/freshbox/milestones/0/finalize", j({ reviewerApprove: false }, true))).json();
  assert.equal(f3.milestone.status, "Resubmitted");
});

test("validation errors return 400", async () => {
  const { app } = createApp();
  const r = await app.request("/campaigns/freshbox/milestones/0/vote", j({ nullifier: "zz" }));
  assert.equal(r.status, 400);
});

test("first quorum failure extends the same window by exactly 3 days", async () => {
  const { app, store } = createApp();
  const before = Date.parse(store.rounds.get("freshbox:0")!.closesAt);
  const v = await sealVote("yes", 1_000, "carol", "freshbox:0");
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/vote", j(v))).status, 200);
  const f1 = await (await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }, true))).json();
  assert.equal(f1.tally.outcome, "QuorumFailed");
  assert.equal(Date.parse(f1.round.closesAt), before + 3 * DAY_MS);
  assert.equal(f1.round.ballots, 1); // ballots kept: it is an extension, not a new vote
});

test("force-finalize requires admin key and is disabled in production", async () => {
  const { app } = createApp();
  assert.equal((await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }))).status, 401);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.equal((await app.request("/campaigns/freshbox/milestones/0/finalize", j({ force: true }, true))).status, 403);
  } finally { process.env.NODE_ENV = prev; }
});

test("admin key: wrong key rejected; production refuses to start without ADMIN_KEY", async () => {
  const { app } = createApp();
  const bad = { method: "POST", headers: { "content-type": "application/json", "x-admin-key": "dev-admin" }, body: "{}" };
  assert.equal((await app.request("/campaigns/lantern-games/approve", bad)).status, 401);
  const saved = { NODE_ENV: process.env.NODE_ENV, ADMIN_KEY: process.env.ADMIN_KEY, HARVESTIA_ADMIN_KEY: process.env.HARVESTIA_ADMIN_KEY };
  process.env.NODE_ENV = "production"; delete process.env.ADMIN_KEY; delete process.env.HARVESTIA_ADMIN_KEY;
  try {
    assert.throws(() => createAppRaw({ seed: false }), /ADMIN_KEY must be set/);
    process.env.ADMIN_KEY = "from-env";
    assert.equal(resolveSecret(["ADMIN_KEY"], "t"), "from-env");
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});

test("health reports mock privacy; campaigns carry lockupEndsAt and fee fields", async () => {
  const { app } = createApp();
  const h = await (await app.request("/health")).json();
  assert.equal(h.privacyMode, "mock");
  const fb = await (await app.request("/campaigns/freshbox")).json();
  assert.equal(Date.parse(fb.lockupEndsAt), Date.parse(fb.raiseDeadline) + 365 * DAY_MS);
  assert.equal(fb.successFeeUsdc, 25_000);
  assert.equal(fb.founderUpfrontUsdc, 75_000);
  assert.equal(fb.lockedUsdc, 500_000 - 100_000); // fee never reduces locked funds
  const list = await (await app.request("/campaigns")).json();
  assert.ok(list.every((c: any) => typeof c.lockupEndsAt === "string"));
});

// ================= Offerings (v2) =================
const base = (over: Record<string, unknown> = {}) => ({ founder: "F".repeat(44), name: "X", tagline: "t", problem: "p", solution: "s", useOfFunds: ["a"], goalUsdc: 100_000, raiseDeadline: new Date(Date.now() + 10 * DAY_MS).toISOString(), milestones: [{ title: "m", description: "d", releaseUsdc: 50_000, deadline: new Date(Date.now() + 90 * DAY_MS).toISOString() }], ...over });
const tokenBlock = { symbol: "ABC", totalSupply: 1_000_000, investorAllocationBps: 1000, targetLaunchDate: new Date(Date.now() + 100 * DAY_MS).toISOString() };
const equityBlock = { equityBps: 1000, payout: { basis: "revenue", shareBps: 800 } };

test("seed shows offering variety with computed status fields", async () => {
  const { app } = createApp();
  const list = await (await app.request("/campaigns")).json();
  const by = Object.fromEntries(list.map((c: any) => [c.id, c]));
  assert.equal(by.freshbox.offering.kind, "equity");
  assert.equal(by.freshbox.payoutStatus.lastPaidPeriod, 3);
  assert.equal(by.freshbox.payoutStatus.consecutiveLate, 0);
  assert.equal(by.freshbox.payoutStatus.defaulted, false);
  assert.equal(by["sunshare-coop"].offering.kind, "both");
  assert.equal(by["sunshare-coop"].offering.token.symbol, "SUN");
  assert.ok(by["sunshare-coop"].payoutStatus && by["sunshare-coop"].tokenStatus);
  assert.equal(by["lantern-games"].offering.token.symbol, "LNTRN");
  assert.equal(by["lantern-games"].offering.token.vesting.months, 12);
  assert.equal(by.tidepool.category, "crypto");
  assert.equal(by.tidepool.tokenStatus.launched, false);
  assert.equal("payoutStatus" in by.tidepool, false);
  assert.equal(by["kiln-coffee"].offering.equity.payout.basis, "profit");
  assert.equal(by["kiln-coffee"].offering.equity.payout.shareBps, 1200);
  const ledger = await (await app.request("/campaigns/freshbox/payouts")).json();
  assert.deepEqual(ledger.entries.map((e: any) => [e.period, e.status, e.paidUsdc]), [[1, "ON_TIME", 720], [2, "ON_TIME", 1000], [3, "ON_TIME", 1280]]);
  assert.equal((await app.request("/campaigns/tidepool/payouts")).status, 404);
});

test("POST /campaigns validates offering kinds", async () => {
  const { app } = createApp();
  const ok = await app.request("/campaigns", j(base({ category: "crypto", offering: { kind: "token", token: tokenBlock } })));
  assert.equal(ok.status, 201);
  const c = await ok.json();
  assert.equal(c.equityBps, 0);
  assert.deepEqual(c.offering.token.vesting, { cliffMonths: 0, months: 12 });
  assert.equal(c.tokenStatus.launched, false);
  const both = await (await app.request("/campaigns", j(base({ offering: { kind: "both", equity: equityBlock, token: tokenBlock } })))).json();
  assert.equal(both.equityBps, 1000);
  assert.equal(both.offering.equity.payout.startsAfterDays, 90);
  assert.equal((await app.request("/campaigns", j(base({ offering: { kind: "equity" } })))).status, 400);
  assert.equal((await app.request("/campaigns", j(base({ offering: { kind: "token", token: tokenBlock, equity: equityBlock } })))).status, 400);
  assert.equal((await app.request("/campaigns", j(base({ offering: { kind: "token", token: { ...tokenBlock, symbol: "bad sym" } } })))).status, 400);
  assert.equal((await app.request("/campaigns", j(base({ category: "spaceships", equityBps: 1000 })))).status, 400);
  assert.equal((await app.request("/campaigns", j(base({ equityBps: 500, offering: { kind: "equity", equity: equityBlock } })))).status, 400);
  assert.equal((await app.request("/campaigns", j(base()))).status, 400); // v1 needs equityBps
  const v1 = await (await app.request("/campaigns", j(base({ equityBps: 1000 })))).json();
  assert.equal(v1.equityBps, 1000);
  assert.equal(v1.offering, undefined);
});

test("payout deposit -> ledger -> private pro-rata claim (no double claim)", async () => {
  let t = Date.now();
  const { app, store } = createApp({ now: () => t });
  const fb = store.campaigns.get("freshbox")!;
  // Give FreshBox two known positions summing to the public total via the mock cluster.
  const a = await sealInvestment(100_000), b = await sealInvestment(400_000);
  store.positions.set("freshbox", new Map([[a.commitment, { ciphertext: a.ciphertext, payoutDebt: 0n, tokensClaimed: 0 }], [b.commitment, { ciphertext: b.ciphertext, payoutDebt: 0n, tokensClaimed: 0 }]]));
  store.payoutAcc.set("freshbox", 0n);
  assert.equal(fb.raisedUsdc, 500_000);
  // Period 4 not ended yet
  assert.equal((await app.request("/campaigns/freshbox/payouts", j({ period: 4, basisAmountUsdc: 20_000 }))).status, 409);
  assert.equal((await app.request("/campaigns/freshbox/payouts", j({ period: 3, basisAmountUsdc: 1 }))).status, 409); // already paid
  t += 12 * DAY_MS; // P4 ended 2 days ago, still within grace
  assert.equal((await app.request("/campaigns/freshbox/payouts", j({ period: 4, basisAmountUsdc: 20_000, amountUsdc: 999 }))).status, 400);
  const e = await (await app.request("/campaigns/freshbox/payouts", j({ period: 4, basisAmountUsdc: 20_000, reportUri: "ipfs://r4" }))).json();
  assert.equal(e.paidUsdc, 1600);
  assert.equal(e.status, "ON_TIME");
  const ca = await (await app.request("/campaigns/freshbox/payouts/claim", j(sealClaim(a.commitment)))).json();
  assert.equal("amount" in ca, false);
  assert.deepEqual(openMockClaim(ca.encryptedClaim), { amount: 320, unit: "USDC" }); // 20% of 1600
  const again = await (await app.request("/campaigns/freshbox/payouts/claim", j(sealClaim(a.commitment)))).json();
  assert.equal(openMockClaim(again.encryptedClaim).amount, 0);
  const cb = await (await app.request("/campaigns/freshbox/payouts/claim", j(sealClaim(b.commitment)))).json();
  assert.equal(openMockClaim(cb.encryptedClaim).amount, 1280);
  assert.equal((await app.request("/campaigns/freshbox/payouts/claim", j({ positionCommitment: "cd".repeat(32), proof: "mockproof:abcdef12" }))).status, 404);
  assert.equal((await app.request("/campaigns/freshbox/payouts/claim", j({ positionCommitment: a.commitment, proof: "nope-nope-nope" }))).status, 400);
});

test("3 missed payouts -> LATE x3 -> payoutDefault flag", async () => {
  let t = Date.now();
  const { app } = createApp({ now: () => t });
  t += (10 + 30 * 2 + 16) * DAY_MS; // P4,P5,P6 ended and past due, unpaid
  const fb = await (await app.request("/campaigns/freshbox")).json();
  assert.equal(fb.payoutStatus.consecutiveLate, 3);
  assert.equal(fb.payoutStatus.defaulted, true);
  assert.ok(fb.flags.includes("PayoutDefault"));
  const ledger = await (await app.request("/campaigns/freshbox/payouts")).json();
  assert.deepEqual(ledger.entries.slice(3).map((x: any) => x.status), ["LATE", "LATE", "LATE"]);
});

test("token register + vested claim; overdue flag", async () => {
  let t = Date.now();
  const { app, store } = createApp({ now: () => t });
  const created = await (await app.request("/campaigns", j(base({ offering: { kind: "token", token: { ...tokenBlock, vesting: { cliffMonths: 1, months: 4 } } } })))).json();
  const id = created.id;
  assert.equal((await app.request(`/campaigns/${id}/approve`, j({}, true))).status, 200);
  const inv = await sealInvestment(25_000);
  assert.equal((await app.request(`/campaigns/${id}/invest`, j(inv))).status, 201);
  const inv2 = await sealInvestment(75_000);
  assert.equal((await app.request(`/campaigns/${id}/invest`, j(inv2))).status, 201);
  const mint = "M".repeat(44);
  assert.equal((await app.request(`/campaigns/${id}/token`, j({ mint, depositAmount: 100_000 }))).status, 409); // still Raising
  store.campaigns.get(id)!.status = "Active";
  assert.equal((await app.request(`/campaigns/${id}/token/claim`, j(sealClaim(inv.commitment)))).status, 409); // not launched
  assert.equal((await app.request(`/campaigns/${id}/token`, j({ mint, depositAmount: 5 }))).status, 400);
  const ts = await (await app.request(`/campaigns/${id}/token`, j({ mint, depositAmount: 100_000 }))).json();
  assert.equal(ts.launched, true);
  assert.equal(ts.mint, mint);
  assert.equal((await app.request(`/campaigns/${id}/token`, j({ mint, depositAmount: 100_000 }))).status, 409);
  t += 15 * DAY_MS; // before 1-month cliff
  assert.equal(openMockClaim((await (await app.request(`/campaigns/${id}/token/claim`, j(sealClaim(inv.commitment)))).json()).encryptedClaim).amount, 0);
  t += 45 * DAY_MS; // 2 of 4 months -> 50% of 25,000 = 12,500
  const c1 = openMockClaim((await (await app.request(`/campaigns/${id}/token/claim`, j(sealClaim(inv.commitment)))).json()).encryptedClaim);
  assert.deepEqual(c1, { amount: 12_500, unit: "ABC" });
  t += 365 * DAY_MS;
  assert.equal(openMockClaim((await (await app.request(`/campaigns/${id}/token/claim`, j(sealClaim(inv.commitment)))).json()).encryptedClaim).amount, 12_500);
  // Overdue: Tidepool target +6 months, not launched; jump past target + 180d
  const tp = await (await app.request("/campaigns/tidepool")).json();
  assert.equal(tp.tokenStatus.overdue, true);
  assert.ok(tp.flags.includes("TokenOverdue"));
});
