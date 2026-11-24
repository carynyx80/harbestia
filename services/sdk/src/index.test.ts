import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, sealInvestment, sealVote } from "./index.js";

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
