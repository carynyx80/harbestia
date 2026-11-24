import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkShieldTransaction, HeliusVerifier } from "./helius.js";
import { loadConfig, redact, RING_PROGRAM_IDS } from "./config.js";
import { createApp } from "./app.js";
import { DAY_MS } from "./rules.js";

const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/shield-tx.json", import.meta.url), "utf8"));
const SIG: string = fixture().transaction.signatures[0];
const RING = "HvstRingFreshbox111111111111111111111111111";
const PROG = RING_PROGRAM_IDS.devnet;
const NOW = 1795000000;
const exp = (o = {}) => ({ signature: SIG, ringProgramId: PROG, ringAccount: RING, nowSec: NOW + 30, maxAgeSec: 900, ...o });

test("checkShieldTransaction accepts the fixture", () => {
  const r = checkShieldTransaction(fixture(), exp());
  assert.deepEqual(r, { ok: true, slot: 312345678, blockTime: NOW });
});

test("checkShieldTransaction rejects failed / old / wrong program / wrong ring / mismatched sig / missing", () => {
  const failed = fixture(); failed.meta.err = { InstructionError: [1, "Custom"] };
  assert.equal((checkShieldTransaction(failed, exp()) as any).reason, "transaction failed on-chain");
  assert.equal((checkShieldTransaction(fixture(), exp({ nowSec: NOW + 10_000 })) as any).reason, "transaction too old");
  assert.match((checkShieldTransaction(fixture(), exp({ ringProgramId: "Other1111111111111111111111111111111111111" })) as any).reason, /shielded pool program/);
  assert.match((checkShieldTransaction(fixture(), exp({ ringAccount: "Other1111111111111111111111111111111111111" })) as any).reason, /ring account/);
  assert.equal((checkShieldTransaction(fixture(), exp({ signature: "x" })) as any).reason, "signature mismatch");
  assert.equal((checkShieldTransaction(null, exp()) as any).reason, "transaction not found");
});

test("checkShieldTransaction finds ring program in inner instructions", () => {
  const tx = fixture();
  const ringIx = tx.transaction.message.instructions.pop();
  tx.transaction.message.instructions.push({ programId: "Router11111111111111111111111111111111111111", accounts: [], data: "" });
  tx.meta.innerInstructions = [{ index: 1, instructions: [ringIx] }];
  assert.equal(checkShieldTransaction(tx, exp()).ok, true);
});

test("loadConfig: mock default, helius requires key, rpc url built, key redacted", () => {
  assert.deepEqual(loadConfig({}).privacyMode, "mock");
  assert.equal(loadConfig({}).cluster, "devnet");
  assert.throws(() => loadConfig({ PRIVACY_MODE: "helius" }), /HELIUS_API_KEY/);
  assert.throws(() => loadConfig({ SOLANA_CLUSTER: "testnet" }), /SOLANA_CLUSTER/);
  const c = loadConfig({ PRIVACY_MODE: "helius", SOLANA_CLUSTER: "mainnet", HELIUS_API_KEY: "sekret123" });
  assert.equal(c.rpcUrl, "https://mainnet.helius-rpc.com/?api-key=sekret123");
  assert.equal(redact(`fail at ${c.rpcUrl}`, "sekret123").includes("sekret123"), false);
});

test("HeliusVerifier calls getTransaction jsonParsed v0, rejects replays, redacts errors", async () => {
  const bodies: any[] = [];
  const fetch = async (_url: string, init: any) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ result: fixture() }) }; };
  const v = new HeliusVerifier({ rpcUrl: "https://devnet.helius-rpc.com/?api-key=k3y", apiKey: "k3y", ringProgramId: PROG, fetch, now: () => (NOW + 5) * 1000 });
  assert.equal((await v.verify(SIG, RING)).ok, true);
  assert.equal(bodies[0].method, "getTransaction");
  assert.deepEqual(bodies[0].params[1], { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  assert.equal((await v.verify(SIG, RING) as any).reason, "signature already used");
  const bad = new HeliusVerifier({ rpcUrl: "https://devnet.helius-rpc.com/?api-key=k3y", apiKey: "k3y", ringProgramId: PROG, fetch: async () => { throw new Error("connect to https://devnet.helius-rpc.com/?api-key=k3y refused"); } });
  await assert.rejects(() => bad.verify(SIG, RING), (e: Error) => !e.message.includes("k3y"));
});

test("helius mode endpoints: /config, invest with signature, claims await withdrawal", async () => {
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({ result: fixture() }) });
  const config = loadConfig({ PRIVACY_MODE: "helius", HELIUS_API_KEY: "k3y" });
  const t0 = NOW * 1000;
  const shieldVerifier = new HeliusVerifier({ rpcUrl: config.rpcUrl!, apiKey: "k3y", ringProgramId: config.ringProgramId, fetch, now: () => t0 });
  const { app } = createApp({ adminKey: "a", config, shieldVerifier, now: () => t0 });
  const j = (b: unknown, admin = false) => ({ method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": "a" } : {}) }, body: JSON.stringify(b) });
  assert.deepEqual(await (await app.request("/config")).json(), { privacyMode: "helius", cluster: "devnet", ringProgramId: PROG });
  const health = await (await app.request("/health")).text();
  assert.equal(health.includes("k3y"), false);
  assert.equal(JSON.parse(health).cluster, "devnet");
  const body = { founder: "F".repeat(44), name: "X", tagline: "t", problem: "p", solution: "s", useOfFunds: ["a"], goalUsdc: 100_000, equityBps: 1000, ringAccount: RING, raiseDeadline: new Date(t0 + 10 * DAY_MS).toISOString(), milestones: [{ title: "m", description: "d", releaseUsdc: 50_000, deadline: new Date(t0 + 90 * DAY_MS).toISOString() }] };
  const created = await (await app.request("/campaigns", j(body))).json();
  assert.equal(created.ringAccount, RING);
  await app.request(`/campaigns/${created.id}/approve`, j({}, true));
  const r = await app.request(`/campaigns/${created.id}/invest`, j({ txSignature: SIG, commitment: "ab".repeat(32) }));
  assert.equal(r.status, 201);
  assert.equal((await r.json()).status, "confirmed");
  assert.equal((await app.request(`/campaigns/${created.id}/invest`, j({ txSignature: SIG, commitment: "cd".repeat(32) }))).status, 409); // replay
  // campaign without ringAccount refuses
  assert.equal((await app.request("/campaigns/freshbox/invest", j({ txSignature: SIG, commitment: "ef".repeat(32) }))).status, 409);
  const claim = await app.request("/campaigns/freshbox/payouts/claim", j({ positionCommitment: "ab".repeat(32), proof: "whatever1" }));
  assert.equal(claim.status, 202);
  assert.equal((await claim.json()).status, "awaiting_onchain_withdrawal");
});

test("mock mode default: /config reports mock", async () => {
  const { app } = createApp({ adminKey: "a" });
  assert.equal((await (await app.request("/config")).json()).privacyMode, "mock");
});
