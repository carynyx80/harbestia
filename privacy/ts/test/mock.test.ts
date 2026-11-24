import { test } from "node:test";
import assert from "node:assert/strict";
import { MockPrivacy, HeliusRingsAdapter, NotImplementedAdapterError, prorataRefund } from "../src/index.js";

const USDC = 1_000_000n;
const MINT = "USDC-mint";

test("shield / privateTransfer / unshield move hidden balances", async () => {
  const m = new MockPrivacy("alice");
  m.fund("alice", MINT, 100n * USDC);
  await m.shield({ from: "alice", mint: MINT, amount: 60n * USDC });
  const vault = m.shieldedAddressOf("vault");
  await m.privateTransfer({ mint: MINT, amount: 25n * USDC, toShieldedAddress: vault });
  await m.unshield({ mint: MINT, amount: 5n * USDC, to: "alice" });
  assert.equal((await m.getEncryptedBalance(m.shieldedAddressOf("alice"), MINT)).amount, 30n * USDC);
  assert.equal((await m.getEncryptedBalance(vault, MINT)).amount, 25n * USDC);
  assert.equal(m.publicBalances.get(`alice:${MINT}`), 45n * USDC);
  await assert.rejects(m.unshield({ mint: MINT, amount: 1000n * USDC, to: "alice" }), /insufficient/);
});

test("weighted tally caps whales and matches the Rust reference vector", async () => {
  const m = new MockPrivacy();
  const stakes: [bigint, boolean][] = [
    [200_000n * USDC, false],
    [30_000n * USDC, true],
    [30_000n * USDC, true],
    [30_000n * USDC, true],
    [30_000n * USDC, true],
  ];
  const refs: string[] = [];
  for (const [s] of stakes) refs.push(await m.recordContribution("freshbox", await m.encryptAmount(s)));
  // remaining $180k from silent investors
  await m.recordContribution("freshbox", await m.encryptAmount(180_000n * USDC));
  assert.equal(await m.sumRaised("freshbox"), 500_000n * USDC);

  for (let i = 0; i < stakes.length; i++) {
    const proof = await m.prove("vote_nullifier", { secret: `s${i}`, campaignId: "freshbox", milestoneIndex: 0, round: 0 });
    assert.ok(await m.verify(proof));
    await m.queueVote("freshbox", 0, refs[i]!, await m.encryptBallot(stakes[i]![1]), proof.publicInputs[1]!);
  }
  const r = await m.awaitTally(await m.queueTally("freshbox", 0));
  assert.deepEqual(r, { yesBps: 7058, noBps: 2941, turnoutBps: 6400, quorumMet: true });
});

test("nullifier blocks double voting", async () => {
  const m = new MockPrivacy();
  const ref = await m.recordContribution("c", await m.encryptAmount(10n));
  const p = await m.prove("vote_nullifier", { secret: "x", campaignId: "c", milestoneIndex: 0, round: 0 });
  await m.queueVote("c", 0, ref, await m.encryptBallot(true), p.publicInputs[1]!);
  await assert.rejects(m.queueVote("c", 0, ref, await m.encryptBallot(false), p.publicInputs[1]!), /already used/);
  const p2 = await m.prove("vote_nullifier", { secret: "x", campaignId: "c", milestoneIndex: 0, round: 1 });
  assert.notEqual(p2.publicInputs[1], p.publicInputs[1]); // resubmission round gets a fresh nullifier
});

test("quorum fails below 20% turnout", async () => {
  const m = new MockPrivacy();
  const small = await m.recordContribution("q", await m.encryptAmount(199n));
  await m.recordContribution("q", await m.encryptAmount(801n));
  await m.queueVote("q", 1, small, await m.encryptBallot(true), "n1");
  const r = await m.awaitTally(await m.queueTally("q", 1));
  assert.equal(r.quorumMet, false);
  assert.equal(r.turnoutBps, 1990);
});

test("pro-rata refund", async () => {
  const m = new MockPrivacy();
  const ref = await m.recordContribution("f", await m.encryptAmount(50_000n * USDC));
  await m.recordContribution("f", await m.encryptAmount(450_000n * USDC));
  assert.equal(await m.prorataRefund(ref, 250_000n * USDC), 25_000n * USDC);
  assert.equal(prorataRefund(1n, 100n, 3n), 33n);
});

test("tampered mock proof fails verification", async () => {
  const m = new MockPrivacy();
  const p = await m.prove("kyc_membership", { secret: "id", campaignId: "a" });
  assert.equal(await m.verify({ ...p, publicInputs: [p.publicInputs[0]!, "00"] }), false);
});

test("Helius adapter stubs throw clear adapter TODOs", async () => {
  const a = new HeliusRingsAdapter({ modules: { spr: {}, iface: {} }, shieldedKeypair: {}, sendAndConfirm: async () => ({ signature: "" }) });
  await assert.rejects(a.privateTransfer({ mint: MINT, amount: 1n, toShieldedAddress: "x" }), NotImplementedAdapterError);
  await assert.rejects(a.getEncryptedBalance("x", MINT), NotImplementedAdapterError);
});
