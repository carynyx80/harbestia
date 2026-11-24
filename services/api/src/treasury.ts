// Treasury mode (v4): money flows through a company-controlled treasury wallet (custodial).
// This module holds the PURE verification logic for USDC deposits (invest) and payouts
// (company settles releases/refunds/payout distributions), ATA derivation, admin action
// computation, and a network-injectable getTransaction client. No keys are ever held here.
import { PublicKey } from "@solana/web3.js";
import type { Campaign } from "@harvestia/sdk/types";
import { redact } from "./config.js";
import * as R from "./rules.js";

export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const MEMO_PROGRAM_IDS = ["MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo"];
export const USDC_DECIMALS = 6;

/** SPL associated token address (classic Token program) for owner + mint. */
export function deriveAta(owner: string, mint: string): string {
  const [ata] = PublicKey.findProgramAddressSync(
    [new PublicKey(owner).toBuffer(), new PublicKey(TOKEN_PROGRAM_ID).toBuffer(), new PublicKey(mint).toBuffer()],
    new PublicKey(ATA_PROGRAM_ID),
  );
  return ata.toBase58();
}

export const isPubkey = (s: unknown): s is string => {
  if (typeof s !== "string") return false;
  try { return new PublicKey(s).toBase58() === s; } catch { return false; }
};

export const toUsdc = (micro: bigint): number => Number(micro) / 10 ** USDC_DECIMALS;
export const usdcToMicro = (usdc: number): bigint => BigInt(Math.round(usdc * 10 ** USDC_DECIMALS));

type Fail = { ok: false; reason: string };
export type DepositResult = { ok: true; amountMicro: bigint; amountUsdc: number; signer: string; slot: number; memo: string } | Fail;
export type PayoutResult = { ok: true; amountMicro: bigint; slot: number } | Fail;

const keyOf = (k: unknown): string | undefined =>
  typeof k === "string" ? k : k && typeof (k as any).pubkey === "string" ? (k as any).pubkey : undefined;

interface Parsed { accountKeys: string[]; signers: string[]; ixs: any[]; meta: any }

function base(tx: any, signature: string, used?: ReadonlySet<string>): Parsed | Fail {
  if (used?.has(signature)) return { ok: false, reason: "signature already used" };
  if (!tx || typeof tx !== "object") return { ok: false, reason: "transaction not found" };
  const meta = tx.meta;
  if (!meta) return { ok: false, reason: "transaction has no meta" };
  if (meta.err !== null && meta.err !== undefined) return { ok: false, reason: "transaction failed on-chain" };
  const sigs: unknown = tx.transaction?.signatures;
  if (!Array.isArray(sigs) || sigs[0] !== signature) return { ok: false, reason: "signature mismatch" };
  const msg = tx.transaction?.message ?? {};
  const rawKeys: any[] = Array.isArray(msg.accountKeys) ? msg.accountKeys : [];
  const accountKeys = rawKeys.map(keyOf).filter(Boolean) as string[];
  const signers = rawKeys.filter((k) => k && typeof k === "object" && k.signer === true).map(keyOf).filter(Boolean) as string[];
  const loaded = meta.loadedAddresses ?? {};
  for (const a of [...(loaded.writable ?? []), ...(loaded.readonly ?? [])]) if (typeof a === "string") accountKeys.push(a);
  const ixs: any[] = [...(Array.isArray(msg.instructions) ? msg.instructions : [])];
  for (const inner of Array.isArray(meta.innerInstructions) ? meta.innerInstructions : []) ixs.push(...(inner?.instructions ?? []));
  return { accountKeys, signers, ixs, meta };
}

interface TokenTransfer { source: string; destination: string; authority?: string; mint?: string; amount: bigint }

/** Extract parsed SPL token transfer / transferChecked instructions; resolve mint for `transfer` via token balances. */
function tokenTransfers(p: Parsed): TokenTransfer[] {
  const mintOfAccount = (addr: string): string | undefined => {
    for (const b of [...(p.meta.postTokenBalances ?? []), ...(p.meta.preTokenBalances ?? [])]) {
      if (p.accountKeys[b?.accountIndex] === addr && typeof b.mint === "string") return b.mint;
    }
    return undefined;
  };
  const out: TokenTransfer[] = [];
  for (const ix of p.ixs) {
    const isToken = ix?.program === "spl-token" || ix?.programId === TOKEN_PROGRAM_ID || ix?.programId === TOKEN_2022_PROGRAM_ID;
    const t = ix?.parsed?.type;
    if (!isToken || (t !== "transfer" && t !== "transferChecked")) continue;
    const info = ix.parsed.info ?? {};
    const rawAmt = t === "transferChecked" ? info.tokenAmount?.amount : info.amount;
    if (typeof rawAmt !== "string" || !/^\d+$/.test(rawAmt)) continue;
    if (t === "transferChecked" && info.tokenAmount?.decimals !== undefined && info.tokenAmount.decimals !== USDC_DECIMALS) continue;
    out.push({
      source: info.source, destination: info.destination, authority: info.authority ?? info.multisigAuthority,
      mint: t === "transferChecked" ? info.mint : (mintOfAccount(info.destination) ?? mintOfAccount(info.source)),
      amount: BigInt(rawAmt),
    });
  }
  return out;
}

function memos(p: Parsed): string[] {
  const out: string[] = [];
  for (const ix of p.ixs) {
    if (ix?.program === "spl-memo" || MEMO_PROGRAM_IDS.includes(ix?.programId)) {
      if (typeof ix.parsed === "string") out.push(ix.parsed);
    }
  }
  for (const line of p.meta.logMessages ?? []) {
    const m = /^Program log: Memo \(len \d+\): "(.*)"$/.exec(String(line));
    if (m) out.push(m[1]);
  }
  return out;
}

export interface DepositExpectations {
  signature: string;
  campaignId: string;
  treasuryAta: string;
  usdcMint: string;
  usedSignatures?: ReadonlySet<string>;
}

/** Pure: verify an investor's USDC deposit to the treasury ATA (getTransaction jsonParsed result). */
export function checkTreasuryDeposit(tx: any, exp: DepositExpectations): DepositResult {
  const p = base(tx, exp.signature, exp.usedSignatures);
  if ("ok" in p) return p;
  const transfers = tokenTransfers(p);
  if (transfers.length === 0) return { ok: false, reason: "transaction contains no SPL token transfer" };
  const toTreasury = transfers.filter((t) => t.destination === exp.treasuryAta);
  if (toTreasury.length === 0) return { ok: false, reason: "transfer destination is not the treasury USDC account" };
  const usdc = toTreasury.filter((t) => t.mint === exp.usdcMint);
  if (usdc.length === 0) return { ok: false, reason: "transferred token is not USDC" };
  const amountMicro = usdc.reduce((s, t) => s + t.amount, 0n);
  if (amountMicro <= 0n) return { ok: false, reason: "transfer amount is zero" };
  const prefix = `harvestia:${exp.campaignId}:`;
  const memo = memos(p).find((m) => m.startsWith(prefix));
  if (!memo) return { ok: false, reason: `memo "${prefix}<commitment>" missing` };
  const signer = usdc[0].authority ?? p.signers[0] ?? p.accountKeys[0];
  if (!signer) return { ok: false, reason: "no signer" };
  return { ok: true, amountMicro, amountUsdc: toUsdc(amountMicro), signer, slot: Number(tx.slot ?? 0), memo };
}

export interface PayoutExpectations {
  signature: string;
  treasuryWallet: string;
  treasuryAta: string;
  recipientAta: string;
  usdcMint: string;
  amountMicro: bigint;
  usedSignatures?: ReadonlySet<string>;
}

/** Pure: verify a company payout (USDC from treasury ATA to recipient ATA, exact amount, signed by treasury wallet). */
export function checkTreasuryPayout(tx: any, exp: PayoutExpectations): PayoutResult {
  const p = base(tx, exp.signature, exp.usedSignatures);
  if ("ok" in p) return p;
  if (!p.signers.includes(exp.treasuryWallet)) return { ok: false, reason: "transaction not signed by the treasury wallet" };
  const transfers = tokenTransfers(p).filter((t) => t.source === exp.treasuryAta);
  if (transfers.length === 0) return { ok: false, reason: "no USDC transfer from the treasury account" };
  const toRecipient = transfers.filter((t) => t.destination === exp.recipientAta);
  if (toRecipient.length === 0) return { ok: false, reason: "transfer destination is not the expected recipient USDC account" };
  const usdc = toRecipient.filter((t) => t.mint === exp.usdcMint && (t.authority === undefined || t.authority === exp.treasuryWallet));
  if (usdc.length === 0) return { ok: false, reason: "transferred token is not USDC (or wrong authority)" };
  const amountMicro = usdc.reduce((s, t) => s + t.amount, 0n);
  if (amountMicro !== exp.amountMicro) return { ok: false, reason: `amount ${toUsdc(amountMicro)} USDC does not match expected ${toUsdc(exp.amountMicro)} USDC` };
  return { ok: true, amountMicro, slot: Number(tx.slot ?? 0) };
}

// ---------------- Admin actions (computed from state) ----------------
export interface TreasuryInvestment { signature: string; investor: string; amountMicro: bigint; at: number }
export interface Settlement { txSignature: string; settledAt: number }
export type ActionKind = "upfront" | "release" | "refund" | "payout";
export interface AdminAction {
  actionId: string; kind: ActionKind; campaignId: string; recipient: string; recipientAta: string;
  amountUsdc: number; amountMicro: string; description: string;
  status: "due" | "settled"; txSignature: string | null;
}

/** Sum investments per investor pubkey (micro-USDC). */
export function investorTotals(list: TreasuryInvestment[]): Map<string, bigint> {
  const m = new Map<string, bigint>();
  for (const i of list) m.set(i.investor, (m.get(i.investor) ?? 0n) + i.amountMicro);
  return m;
}

function proRata(totals: Map<string, bigint>, pool: bigint): [string, bigint][] {
  const sum = [...totals.values()].reduce((s, v) => s + v, 0n);
  if (sum <= 0n || pool <= 0n) return [];
  return [...totals.entries()].map(([k, v]) => [k, (pool * v) / sum] as [string, bigint]).filter(([, a]) => a > 0n);
}

export function computeAdminActions(args: {
  campaigns: Campaign[];
  investments: Map<string, TreasuryInvestment[]>;
  payouts: Map<string, { period: number; paidUsdc: number }[]>;
  settled: Map<string, Settlement>;
  usdcMint: string;
}): AdminAction[] {
  const out: AdminAction[] = [];
  const push = (a: Omit<AdminAction, "recipientAta" | "amountUsdc" | "amountMicro" | "status" | "txSignature">, micro: bigint) => {
    if (micro <= 0n || !isPubkey(a.recipient)) return;
    const s = args.settled.get(a.actionId);
    out.push({ ...a, recipientAta: deriveAta(a.recipient, args.usdcMint), amountMicro: micro.toString(), amountUsdc: toUsdc(micro), status: s ? "settled" : "due", txSignature: s?.txSignature ?? null });
  };
  for (const camp of args.campaigns) {
    if (camp.sample) continue; // sample campaigns never hold real money
    const founderWallet = camp.founderPayoutWallet ?? camp.founder;
    const totals = investorTotals(args.investments.get(camp.id) ?? []);
    if (camp.status === "Active" || camp.status === "Completed" || camp.status === "Refunding") {
      push({ actionId: `upfront:${camp.id}`, kind: "upfront", campaignId: camp.id, recipient: founderWallet, description: `${camp.name}: upfront tranche (net of 5% success fee)` }, usdcToMicro(R.founderUpfrontUsdc(camp)));
      for (const ms of camp.milestones) {
        if (ms.status !== "Released") continue;
        push({ actionId: `release:${camp.id}:${ms.index}`, kind: "release", campaignId: camp.id, recipient: founderWallet, description: `${camp.name}: milestone ${ms.index + 1} "${ms.title}" released by vote` }, usdcToMicro(ms.releaseUsdc));
      }
    }
    if (camp.status === "Failed" || camp.status === "Refunding") {
      const pool = camp.status === "Failed" ? [...totals.values()].reduce((s, v) => s + v, 0n) : usdcToMicro(R.lockedUsdc(camp));
      for (const [inv, amt] of proRata(totals, pool)) {
        push({ actionId: `refund:${camp.id}:${inv}`, kind: "refund", campaignId: camp.id, recipient: inv, description: `${camp.name}: ${camp.status === "Failed" ? "failed raise" : "failed milestone"} refund (pro-rata)` }, amt);
      }
    }
    for (const d of args.payouts.get(camp.id) ?? []) {
      for (const [inv, amt] of proRata(totals, usdcToMicro(d.paidUsdc))) {
        push({ actionId: `payout:${camp.id}:${d.period}:${inv}`, kind: "payout", campaignId: camp.id, recipient: inv, description: `${camp.name}: monthly payout period ${d.period} (pro-rata)` }, amt);
      }
    }
  }
  return out;
}

// ---------------- Network (injectable) ----------------
export type RpcFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface TxFetcher { getTransaction(signature: string): Promise<any> }

export const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

/** getTransaction(jsonParsed, v0, confirmed) against the upstream RPC; errors are redacted. */
export class RpcTxFetcher implements TxFetcher {
  private readonly f: RpcFetch;
  constructor(private rpcUrl: string, private apiKey?: string, fetchImpl?: RpcFetch) {
    this.f = fetchImpl ?? ((url, init) => globalThis.fetch(url, init));
  }
  async getTransaction(signature: string): Promise<any> {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] });
    try {
      const res = await this.f(this.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(`RPC error ${data.error.code ?? ""}: ${data.error.message ?? "unknown"}`);
      return data?.result ?? null;
    } catch (e) {
      // Never leak the upstream URL or key.
      throw new Error(redact(`getTransaction failed: ${(e as Error).message}`, this.apiKey).split(this.rpcUrl).join("[upstream]"));
    }
  }
}
