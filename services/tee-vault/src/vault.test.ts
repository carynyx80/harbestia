import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomBytes } from "node:crypto";
import { AuditLog, canonical, merkleProof, merkleRoot, verifyMerkleProof, sha256 } from "./vault.js";
import { createVaultApp } from "./app.js";

test("merkle proofs verify for every leaf", () => {
  const leaves = Array.from({ length: 7 }, (_, i) => sha256(String(i)));
  const root = merkleRoot(leaves);
  for (const l of leaves) assert.ok(verifyMerkleProof(l, merkleProof(leaves, l)!, root));
  assert.equal(verifyMerkleProof(sha256("x"), [], root), false);
});

test("audit log is hash chained and tamper-evident", () => {
  const log = new AuditLog();
  log.append({ a: 1 }); log.append({ b: 2 });
  assert.ok(log.verifyChain());
  (log.all()[0].event as any).a = 99; // event object is mutable inside frozen entry -> detect
  assert.equal(log.verifyChain(), false);
});

test("kyc submit -> root; regulator access requires valid signature and is audited", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const { app } = createVaultApp({ regulators: { "sec-demo": pem }, autoVerify: true, reviewerKey: "test-reviewer" });
  const sub = await (await app.request("/kyc/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ encryptedDoc: "client-encrypted-blob-xyz" }) })).json();
  const root = await (await app.request("/kyc/root")).json();
  assert.equal(root.leaves, 1);
  assert.equal(root.root, sub.commitment);
  const request = { regulatorId: "sec-demo", commitment: sub.commitment, reason: "subpoena 123", timestamp: new Date().toISOString(), nonce: randomBytes(8).toString("hex") };
  const signature = sign(null, Buffer.from(canonical(request)), privateKey).toString("base64");
  const post = (b: unknown) => app.request("/regulator/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  assert.equal((await post({ request: { ...request, reason: "tampered" }, signature })).status, 403);
  const ok = await post({ request, signature });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).encryptedDoc, "client-encrypted-blob-xyz");
  assert.equal((await post({ request, signature })).status, 409); // replay
  const head = await (await app.request("/audit/head")).json();
  assert.equal(head.length, 2);
  assert.equal(head.chainValid, true);
});

test("reviewer key: hardcoded dev-reviewer rejected; production refuses without REVIEWER_KEY", async () => {
  const { app } = createVaultApp({ regulators: {}, reviewerKey: "test-reviewer" });
  const r = await app.request("/kyc/review/" + "0".repeat(64), { method: "POST", headers: { "content-type": "application/json", "x-reviewer-key": "dev-reviewer" }, body: JSON.stringify({ status: "verified" }) });
  assert.equal(r.status, 401);
  const saved = { NODE_ENV: process.env.NODE_ENV, REVIEWER_KEY: process.env.REVIEWER_KEY, KYC_REVIEWER_KEY: process.env.KYC_REVIEWER_KEY };
  process.env.NODE_ENV = "production"; delete process.env.REVIEWER_KEY; delete process.env.KYC_REVIEWER_KEY;
  try { assert.throws(() => createVaultApp({ regulators: {} }), /REVIEWER_KEY must be set/); }
  finally { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
});
