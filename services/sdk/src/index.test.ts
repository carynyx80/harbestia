import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, sealClaim, sealInvestment, sealVote, openMockClaim } from "./index.js";

test("sealInvestment produces commitment + mock ciphertext", async () => {
  const s = await sealInvestment(1000, "abc");
  assert.equal(s.commitment.length, 64);
  assert.ok(s.ciphertext.startsWith("mockenc1:"));
});

test("sealVote nullifier is deterministic per secret+scope", async () => {
  const a = await sealVote("yes", 10, "s", "c:0");
  const b = await sealVote("no", 10, "s", "c:0");
  assert.equal(a.nullifier, b.nullifier);
});

test("client builds URLs and throws typed errors", async () => {
  const calls: string[] = [];
  const fake = (async (url: string, init: any) => {
    calls.push(`${init.method} ${url}`);
    return new Response(JSON.stringify({ error: "nope" }), { status: 404 });
  }) as any;
  const c = createClient({ baseUrl: "http://x/", fetch: fake });
  await assert.rejects(() => c.getCampaign("a b"), /nope/);
  assert.deepEqual(calls, ["GET http://x/campaigns/a%20b"]);
});

test("offering v2 client methods hit SPEC endpoints", async () => {
  const calls: string[] = [];
  const fake = (async (url: string, init: any) => {
    calls.push(`${init.method} ${url}`);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;
  const c = createClient({ baseUrl: "http://x", fetch: fake });
  const cl = sealClaim("ab".repeat(32));
  await c.depositPayout("fb", { period: 1, basisAmountUsdc: 1000 });
  await c.listPayouts("fb");
  await c.claimPayout("fb", cl);
  await c.registerToken("fb", { mint: "M".repeat(44), depositAmount: 1 });
  await c.claimTokens("fb", cl);
  assert.deepEqual(calls, ["POST http://x/campaigns/fb/payouts", "GET http://x/campaigns/fb/payouts", "POST http://x/campaigns/fb/payouts/claim", "POST http://x/campaigns/fb/token", "POST http://x/campaigns/fb/token/claim"]);
  assert.ok(cl.proof.startsWith("mockproof:"));
});

test("openMockClaim decodes mockenc1 payloads", () => {
  const enc = "mockenc1:" + Buffer.from(JSON.stringify({ amount: 12.5, unit: "USDC" })).toString("base64");
  assert.deepEqual(openMockClaim(enc), { amount: 12.5, unit: "USDC" });
});
