import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HeliusRingsAdapter,
  HELIUS_RINGS_PROGRAM_IDS,
  NotImplementedAdapterError,
  withRetry,
  decodeBase58,
  type HeliusSdk,
  type RingsSigner,
} from "../src/index.js";

const OWNER = "11111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const RPC = "https://devnet.helius-rpc.com/?api-key=SECRET123";
const SHIELDED_HEX = "ab".repeat(96);

function fakeSdk(opts: { registered?: boolean; failSend?: number; balances?: { mint: string; amount: bigint; n: number }[] } = {}) {
  const calls: { name: string; args: any }[] = [];
  let sendFails = opts.failSend ?? 0;
  const tx = (tag: string) => ({ messageBytes: new Uint8Array([tag.length]), signatures: {}, tag });
  const addr = { toBytes: () => Buffer.from(SHIELDED_HEX, "hex"), tag: "own-address" };
  const client = {
    proofService: { tag: "prover" },
    solanaRpc: {
      sendTransaction: (wire: string, cfg: unknown) => ({
        send: async () => {
          calls.push({ name: "sendTransaction", args: { wire, cfg } });
          if (sendFails-- > 0) throw new Error("fetch failed");
          return "SIG1";
        },
      }),
    },
    confirmTransaction: async () => 42n,
  };
  const spr = {
    SOL_MINT,
    MergeEncryptionScheme: { Disabled: 0, PoseidonCtrV1: 1 },
    createSprClient: async (c: unknown) => (calls.push({ name: "createSprClient", args: c }), client),
    LocalKeys: { fromDerivationSeed: (i: unknown, p: unknown) => (calls.push({ name: "fromDerivationSeed", args: { i, p } }), { address: () => addr }) },
    Wallet: class { identity: unknown; constructor(i: any) { this.identity = i.identity; } },
    ShieldedAddress: { fromBytes: (b: Uint8Array) => ({ parsed: Buffer.from(b).toString("hex") }) },
    syncWallet: async (i: unknown) => (calls.push({ name: "syncWallet", args: i }), { storedUtxos: 1 }),
    getPrivateTokenBalances: () => (opts.balances ?? []).map((b) => ({ assetId: 2n, mint: b.mint, amount: b.amount, utxos: new Array(b.n) })),
    buildDepositTransaction: async (i: unknown) => (calls.push({ name: "buildDepositTransaction", args: i }), tx("deposit")),
    buildTransferTransaction: async (i: unknown) => (calls.push({ name: "buildTransferTransaction", args: i }), tx("transfer")),
    buildWithdrawalTransaction: async (i: unknown) => (calls.push({ name: "buildWithdrawalTransaction", args: i }), tx("withdraw")),
    buildRegistrationTransaction: async (i: unknown) => (calls.push({ name: "buildRegistrationTransaction", args: i }), opts.registered ? undefined : tx("register")),
    buildSetMergeEncryptionTransaction: async (i: unknown) => (calls.push({ name: "buildSetMergeEncryptionTransaction", args: i }), tx("merge")),
  };
  const sdk = {
    spr,
    keypair: { ed25519DerivationMessage: (pk: Uint8Array) => new Uint8Array([9, ...pk]) },
    kit: {
      getBase64EncodedWireTransaction: (t: any) => `wire:${t.tag}:${t.signed ? "signed" : "unsigned"}`,
      partiallySignTransaction: async (_k: unknown, t: any) => ({ ...t, signed: true }),
      getAddressFromPublicKey: async () => OWNER,
    },
  } as unknown as HeliusSdk;
  return { sdk, calls };
}

const signer = (): RingsSigner & { msgs: Uint8Array[] } => {
  const msgs: Uint8Array[] = [];
  return {
    address: OWNER,
    msgs,
    signTransaction: async (t: any) => ({ ...t, signed: true }),
    signMessage: async (m) => (msgs.push(m), new Uint8Array(64).fill(7)),
  };
};

test("program ids per cluster", () => {
  assert.equal(HELIUS_RINGS_PROGRAM_IDS.mainnet.shieldedPool, "ring1GaLCuJnkUMVkX2JeZLTTX17wKsV4fZmPVzXANW");
  assert.equal(HELIUS_RINGS_PROGRAM_IDS.devnet.userRegistry, "regy3WAeRXMYuMYxr5iK3Bf9Arr3PcxGxyzAddbiqDQ");
  assert.throws(() => new HeliusRingsAdapter({ cluster: "testnet" as any, rpcUrl: RPC, signer: signer() }));
});

test("keys derive from wallet signature over the TSPP derive message; rpcUrl passed through", async () => {
  const { sdk, calls } = fakeSdk();
  const s = signer();
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: s, sdk });
  assert.equal(await a.shieldedAddress(), SHIELDED_HEX);
  assert.deepEqual(calls.find((c) => c.name === "createSprClient")!.args, { solanaRpcUrl: RPC });
  assert.deepEqual([...s.msgs[0]!], [9, ...decodeBase58(OWNER)]);
  const d = calls.find((c) => c.name === "fromDerivationSeed")!.args;
  assert.equal(d.i.solanaPublicKey, OWNER);
  assert.equal(d.i.derivationSeed.length, 64);
  assert.equal(d.p.tag, "prover");
});

test("register builds registry + merge-encryption txs, or none when registered", async () => {
  const { sdk, calls } = fakeSdk();
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk });
  const txs = await a.buildRegisterTxs();
  assert.deepEqual(txs.map((t: any) => t.tag), ["register", "merge"]);
  assert.equal(calls.find((c) => c.name === "buildSetMergeEncryptionTransaction")!.args.scheme, 1);
  const res = await a.register();
  assert.equal(res.length, 2);
  const r2 = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk: fakeSdk({ registered: true }).sdk });
  assert.deepEqual(await r2.buildRegisterTxs(), []);
});

test("buildShieldTx returns UNSIGNED deposit tx; shield signs and sends", async () => {
  const { sdk, calls } = fakeSdk();
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk });
  const tx: any = await a.buildShieldTx({ from: OWNER, mint: USDC, amount: 5n, splTokenAccount: OWNER });
  assert.equal(tx.signed, undefined);
  const args = calls.find((c) => c.name === "buildDepositTransaction")!.args;
  assert.equal(args.asset, USDC);
  assert.equal(args.amount, 5n);
  assert.equal(args.feePayer, OWNER);
  assert.equal(args.recipient.tag, "own-address");
  assert.equal(args.splTokenAccount, OWNER);
  const r = await a.shield({ from: OWNER, mint: "SOL", amount: 1n, recipientShieldedAddress: SHIELDED_HEX });
  assert.deepEqual(r, { signature: "SIG1", slot: 42n });
  const last = calls.filter((c) => c.name === "buildDepositTransaction").at(-1)!.args;
  assert.equal(last.asset, SOL_MINT);
  assert.equal(last.recipient.parsed, SHIELDED_HEX);
  assert.equal(calls.find((c) => c.name === "sendTransaction")!.args.wire, "wire:deposit:signed");
  await assert.rejects(a.shield({ from: OWNER, mint: USDC, amount: 0n }), /positive/);
});

test("privateTransfer syncs wallet then builds transfer with keys; memo unsupported", async () => {
  const { sdk, calls } = fakeSdk();
  const a = new HeliusRingsAdapter({ cluster: "mainnet", rpcUrl: RPC, signer: signer(), sdk });
  await a.privateTransfer({ mint: USDC, amount: 3n, toShieldedAddress: OWNER });
  const names = calls.map((c) => c.name);
  assert.ok(names.indexOf("syncWallet") < names.indexOf("buildTransferTransaction"));
  const args = calls.find((c) => c.name === "buildTransferTransaction")!.args;
  assert.equal(args.recipient, OWNER);
  assert.equal(args.amount, 3n);
  assert.ok(args.keys && args.wallet);
  await assert.rejects(a.privateTransfer({ mint: USDC, amount: 1n, toShieldedAddress: OWNER, memo: new Uint8Array([1]) }), NotImplementedAdapterError);
});

test("unshield builds withdrawal to public recipient", async () => {
  const { sdk, calls } = fakeSdk();
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk });
  await a.unshield({ mint: USDC, amount: 2n, to: OWNER });
  const args = calls.find((c) => c.name === "buildWithdrawalTransaction")!.args;
  assert.equal(args.recipient, OWNER);
  assert.equal(args.asset, USDC);
});

test("getEncryptedBalance decrypts own balance only", async () => {
  const { sdk } = fakeSdk({ balances: [{ mint: USDC, amount: 77n, n: 3 }] });
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk });
  assert.deepEqual(await a.getEncryptedBalance(OWNER, USDC), { mint: USDC, amount: 77n, utxoCount: 3 });
  assert.deepEqual(await a.getEncryptedBalance(SHIELDED_HEX, SOL_MINT), { mint: SOL_MINT, amount: 0n, utxoCount: 0 });
  await assert.rejects(a.getEncryptedBalance("someoneElse", USDC), NotImplementedAdapterError);
});

test("send retries transient errors and never leaks the api key", async () => {
  const { sdk, calls } = fakeSdk({ failSend: 2 });
  const a = new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: RPC, signer: signer(), sdk });
  await a.shield({ from: OWNER, mint: USDC, amount: 1n });
  assert.equal(calls.filter((c) => c.name === "sendTransaction").length, 3);
  await assert.rejects(
    withRetry(async () => { throw new Error(`fetch failed ${RPC}`); }, RPC, 2, 1),
    (e: Error) => !e.message.includes("SECRET123"),
  );
});
