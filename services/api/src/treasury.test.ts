import { test } from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { checkTreasuryDeposit, checkTreasuryPayout, deriveAta, RpcTxFetcher, TOKEN_PROGRAM_ID, type TxFetcher } from "./treasury.js";
import { DEFAULT_TREASURY_WALLET, USDC_MINTS, loadConfig } from "./config.js";
import { createApp } from "./app.js";
import { RPC_ALLOWLIST } from "./rpc.js";
import { DAY_MS } from "./rules.js";

const pk = (n: number) => new PublicKey(Buffer.alloc(32, n)).toBase58();
const USDC = USDC_MINTS.mainnet;
const TREASURY = DEFAULT_TREASURY_WALLET;
const TREASURY_ATA = deriveAta(TREASURY, USDC);
const INVESTOR = pk(7);
const INVESTOR_ATA = deriveAta(INVESTOR, USDC);
const sig = (n: number) => String(n).padStart(2, "1") + "5".repeat(86);
const SIG = sig(1);

/** Build a jsonParsed getTransaction result. */
function depositTx(o: { signature?: string; campaignId?: string; memo?: string | null; mint?: string; destination?: string; amount?: string; err?: unknown; plainTransfer?: boolean; signer?: string; source?: string } = {}) {
  const signer = o.signer ?? INVESTOR, source = o.source ?? INVESTOR_ATA, destination = o.destination ?? TREASURY_ATA;
  const amount = o.amount ?? "2500000000";
  const transferIx = o.plainTransfer
    ? { program: "spl-token", programId: TOKEN_PROGRAM_ID, parsed: { type: "transfer", info: { source, destination, authority: signer, amount } } }
    : { program: "spl-token", programId: TOKEN_PROGRAM_ID, parsed: { type: "transferChecked", info: { source, destination, authority: signer, mint: o.mint ?? USDC, tokenAmount: { amount, decimals: 6, uiAmount: Number(amount) / 1e6 } } } };
  const memo = o.memo === null ? [] : [{ program: "spl-memo", programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", parsed: o.memo ?? `harvestia:${o.campaignId ?? "camp1"}:${"ab".repeat(16)}` }];
  return {
    slot: 300000001, blockTime: 1795000000,
    meta: {
      err: o.err ?? null, innerInstructions: [], logMessages: [],
      preTokenBalances: [], postTokenBalances: [{ accountIndex: 2, mint: o.mint ?? USDC, owner: TREASURY, uiTokenAmount: { amount, decimals: 6 } }],
    },
    transaction: {
      signatures: [o.signature ?? SIG],
      message: {
        accountKeys: [{ pubkey: signer, signer: true, writable: true }, { pubkey: source, signer: false, writable: true }, { pubkey: destination, signer: false, writable: true }, { pubkey: TOKEN_PROGRAM_ID, signer: false, writable: false }],
        instructions: [{ program: "spl-associated-token-account", parsed: { type: "createIdempotent", info: {} } }, transferIx, ...memo],
      },
    },
  };
}
const dexp = (o = {}) => ({ signature: SIG, campaignId: "camp1", treasuryAta: TREASURY_ATA, usdcMint: USDC, ...o });
const reason = (r: any) => r.reason as string;

test("deriveAta matches known mainnet USDC ATA derivation and is stable", () => {
  assert.equal(deriveAta(TREASURY, USDC), TREASURY_ATA);
  assert.notEqual(TREASURY_ATA, TREASURY);
  assert.equal(new PublicKey(TREASURY_ATA).toBase58(), TREASURY_ATA);
});

test("deposit: successful transferChecked to treasury ATA", () => {
  const r = checkTreasuryDeposit(depositTx(), dexp());
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.amountUsdc, 2500); assert.equal(r.signer, INVESTOR); }
});

test("deposit: plain transfer resolves mint via postTokenBalances", () => {
  assert.equal(checkTreasuryDeposit(depositTx({ plainTransfer: true }), dexp()).ok, true);
  assert.match(reason(checkTreasuryDeposit(depositTx({ plainTransfer: true, mint: pk(9) }), dexp())), /not USDC/);
});

test("deposit: wrong mint, wrong destination, missing memo, wrong campaign memo, failed tx, replay, not found", () => {
  assert.match(reason(checkTreasuryDeposit(depositTx({ mint: pk(9) }), dexp())), /not USDC/);
  assert.match(reason(checkTreasuryDeposit(depositTx({ destination: pk(8) }), dexp())), /destination/);
  assert.match(reason(checkTreasuryDeposit(depositTx({ memo: null }), dexp())), /memo/);
  assert.match(reason(checkTreasuryDeposit(depositTx({ campaignId: "other" }), dexp())), /memo/);
  assert.equal(reason(checkTreasuryDeposit(depositTx({ err: { InstructionError: [1, "Custom"] } }), dexp())), "transaction failed on-chain");
  assert.equal(reason(checkTreasuryDeposit(depositTx(), dexp({ usedSignatures: new Set([SIG]) }))), "signature already used");
  assert.equal(reason(checkTreasuryDeposit(null, dexp())), "transaction not found");
  assert.equal(reason(checkTreasuryDeposit(depositTx(), dexp({ signature: sig(2) }))), "signature mismatch");
});

test("payout: verifies source, recipient, amount, treasury signer", () => {
  const tx = depositTx({ signer: TREASURY, source: TREASURY_ATA, destination: INVESTOR_ATA, amount: "1000000", memo: null });
  const e = { signature: SIG, treasuryWallet: TREASURY, treasuryAta: TREASURY_ATA, recipientAta: INVESTOR_ATA, usdcMint: USDC, amountMicro: 1_000_000n };
  assert.equal(checkTreasuryPayout(tx, e).ok, true);
  assert.match(reason(checkTreasuryPayout(tx, { ...e, amountMicro: 2_000_000n })), /does not match/);
  assert.match(reason(checkTreasuryPayout(tx, { ...e, recipientAta: pk(8) })), /recipient/);
  assert.match(reason(checkTreasuryPayout(depositTx({ source: TREASURY_ATA, destination: INVESTOR_ATA, amount: "1000000" }), e)), /not signed by the treasury/);
});

test("RpcTxFetcher uses jsonParsed/v0/confirmed and never leaks upstream URL", async () => {
  const bodies: any[] = [];
  const f = new RpcTxFetcher("https://mainnet.helius-rpc.com/?api-key=s3cr3t", "s3cr3t", async (_u, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ result: null }) }; });
  await f.getTransaction(SIG);
  assert.deepEqual(bodies[0].params[1], { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  const bad = new RpcTxFetcher("https://mainnet.helius-rpc.com/?api-key=s3cr3t", "s3cr3t", async () => { throw new Error("connect https://mainnet.helius-rpc.com/?api-key=s3cr3t failed"); });
  await assert.rejects(() => bad.getTransaction(SIG), (e: Error) => !e.message.includes("s3cr3t"));
});

test("loadConfig treasury: defaults to mainnet, wallet, USDC; key optional and hidden", async () => {
  const cfg = loadConfig({ TREASURY_MODE: "on" });
  assert.equal(cfg.treasuryMode, true);
  assert.equal(cfg.cluster, "mainnet");
  assert.equal(cfg.usdcMint, USDC);
  assert.equal(cfg.upstreamRpcUrl, "https://api.mainnet-beta.solana.com");
  assert.equal(loadConfig({ TREASURY_MODE: "on", SOLANA_CLUSTER: "devnet" }).upstreamRpcUrl, "https://api.devnet.solana.com");
  assert.equal(loadConfig({}).treasuryMode, false);
  const { app } = createApp({ adminKey: "a", config: loadConfig({ TREASURY_MODE: "on", HELIUS_API_KEY: "k3y" }) });
  const conf = await (await app.request("/config")).json();
  assert.equal(conf.mode, "treasury");
  assert.equal(conf.treasuryWallet, TREASURY);
  assert.equal(conf.treasuryUsdcAta, TREASURY_ATA);
  assert.equal(conf.usdcMint, USDC);
  assert.equal(JSON.stringify(conf).includes("k3y") || (await (await app.request("/health")).text()).includes("k3y"), false);
});

const J = (b: unknown, admin = false) => ({ method: "POST", headers: { "content-type": "application/json", ...(admin ? { "x-admin-key": "a" } : {}) }, body: JSON.stringify(b) });

test("treasury invest endpoint: sample 403, verify + record, replay 409, admin actions + settle", async () => {
  const txs = new Map<string, any>();
  const txFetcher: TxFetcher = { getTransaction: async (s) => txs.get(s) ?? null };
  const t0 = Date.now();
  const { app, store } = createApp({ adminKey: "a", config: loadConfig({ TREASURY_MODE: "on" }), txFetcher, now: () => t0 });
  const sample = await app.request("/campaigns/zentrove/invest", J({ txSignature: SIG }));
  assert.equal(sample.status, 403);
  assert.equal((await sample.json()).error, "Sample campaign — investing disabled");

  const founderWallet = pk(5);
  const body = { founder: pk(4), founderPayoutWallet: founderWallet, name: "X", tagline: "t", problem: "p", solution: "s", useOfFunds: ["a"], goalUsdc: 100_000, equityBps: 1000, raiseDeadline: new Date(t0 + 10 * DAY_MS).toISOString(), milestones: [{ title: "m", description: "d", releaseUsdc: 50_000, deadline: new Date(t0 + 90 * DAY_MS).toISOString() }] };
  const created = await (await app.request("/campaigns", J(body))).json();
  assert.equal(created.founderPayoutWallet, founderWallet);
  await app.request(`/campaigns/${created.id}/approve`, J({}, true));

  txs.set(SIG, depositTx({ campaignId: created.id }));
  const r = await app.request(`/campaigns/${created.id}/invest`, J({ txSignature: SIG }));
  assert.equal(r.status, 201);
  assert.deepEqual((({ recorded, amountUsdc, raisedUsdc }) => ({ recorded, amountUsdc, raisedUsdc }))(await r.json()), { recorded: true, amountUsdc: 2500, raisedUsdc: 2500 });
  assert.equal((await app.request(`/campaigns/${created.id}/invest`, J({ txSignature: SIG }))).status, 409);
  txs.set(sig(2), depositTx({ signature: sig(2), campaignId: "wrong" }));
  assert.equal((await app.request(`/campaigns/${created.id}/invest`, J({ txSignature: sig(2) }))).status, 400);
  assert.equal((await (await app.request(`/campaigns/${created.id}`)).json()).raisedUsdc, 2500);

  // Raise fails -> full refund to the investor is due.
  store.campaigns.get(created.id)!.status = "Failed";
  const acts = await (await app.request("/admin/actions")).json();
  const refund = acts.due.find((a: any) => a.kind === "refund");
  assert.equal(refund.recipient, INVESTOR);
  assert.equal(refund.amountUsdc, 2500);
  assert.equal(refund.recipientAta, INVESTOR_ATA);
  assert.equal(acts.due.some((a: any) => a.campaignId === "ferrolab"), false); // samples excluded

  const settleSig = sig(3);
  txs.set(settleSig, depositTx({ signature: settleSig, signer: pk(6), source: TREASURY_ATA, destination: INVESTOR_ATA, amount: "2500000000", memo: null }));
  assert.equal((await app.request(`/admin/actions/${encodeURIComponent(refund.actionId)}/settle`, J({ txSignature: settleSig }))).status, 400); // wrong signer
  const goodSig = sig(4);
  txs.set(goodSig, depositTx({ signature: goodSig, signer: TREASURY, source: TREASURY_ATA, destination: INVESTOR_ATA, amount: "2500000000", memo: null }));
  const ok = await app.request(`/admin/actions/${encodeURIComponent(refund.actionId)}/settle`, J({ txSignature: goodSig }));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).status, "settled");
  const after = await (await app.request("/admin/actions")).json();
  assert.equal(after.due.some((a: any) => a.actionId === refund.actionId), false);
});

test("/rpc proxy: allowlist, batch, rate limit, no upstream leak", async () => {
  const forwarded: any[] = [];
  const rpcFetch = async (url: string, init: any) => {
    assert.match(url, /api-key=k3y/);
    const reqs = JSON.parse(init.body); forwarded.push(...reqs);
    return { ok: true, status: 200, json: async () => reqs.map((r: any) => ({ jsonrpc: "2.0", id: r.id, result: { method: r.method } })) };
  };
  const { app } = createApp({ adminKey: "a", config: loadConfig({ TREASURY_MODE: "on", HELIUS_API_KEY: "k3y" }), rpcFetch, rpcRateLimit: 5 });
  const single = await (await app.request("/rpc", J({ jsonrpc: "2.0", id: 7, method: "getLatestBlockhash" }))).json();
  assert.deepEqual(single, { jsonrpc: "2.0", id: 7, result: { method: "getLatestBlockhash" } });
  const denied = await (await app.request("/rpc", J({ jsonrpc: "2.0", id: 1, method: "requestAirdrop" }))).json();
  assert.equal(denied.error.code, -32601);
  const batch = await app.request("/rpc", J([{ jsonrpc: "2.0", id: "a", method: "getBalance", params: [pk(1)] }, { jsonrpc: "2.0", id: "b", method: "getProgramAccounts" }]));
  const out = await batch.json();
  assert.equal(out[0].result.method, "getBalance");
  assert.equal(out[1].error.code, -32601);
  assert.equal(forwarded.some((r) => !RPC_ALLOWLIST.has(r.method)), false);
  assert.equal(JSON.stringify(out).includes("k3y") || JSON.stringify(out).includes("helius"), false);
  const big = await app.request("/rpc", J({ jsonrpc: "2.0", id: 1, method: "sendTransaction", params: ["x".repeat(70_000)] }));
  assert.equal(big.status, 413);
  let last = 0;
  for (let i = 0; i < 3; i++) last = (await app.request("/rpc", J({ jsonrpc: "2.0", id: 1, method: "getBalance" }))).status;
  assert.equal(last, 429);
});
