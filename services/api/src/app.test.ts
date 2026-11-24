import { test } from "node:test";
import assert from "node:assert/strict";
import { sealInvestment, sealVote } from "@harvestia/sdk";
import { createApp as createAppRaw, resolveSecret, type AppDeps } from "./app.js";
import { DAY_MS } from "./rules.js";

const ADMIN = "test-admin-key";
const createApp = (d: AppDeps = {}) => createAppRaw({ adminKey: ADMIN, ...d });
const j = (body: unknown, admin = false) => ({ method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": ADMIN } : {}) }, body: JSON.stringify(body) });

test("seed has 3 campaigns incl. FreshBox", async () => {
  const { app } = createApp();
  const list = await (await app.request("/campaigns")).json();
  assert.equal(list.length, 3);
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
