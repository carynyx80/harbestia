// Verifies client-submitted Helius Privacy Rings shield (deposit) transactions.
// The investor's browser wallet signs the shield tx; the API never holds keys and never
// sees plaintext amounts: it only checks that a successful, recent tx invoked the ring
// program and touched the campaign's ring/deposit account.
import { redact } from "./config.js";

export interface VerifyExpectations {
  signature: string;
  ringProgramId: string;
  ringAccount: string;
  nowSec: number;
  maxAgeSec: number;
}

export type VerifyResult = { ok: true; slot: number; blockTime: number } | { ok: false; reason: string };

const keyOf = (k: unknown): string | undefined =>
  typeof k === "string" ? k : k && typeof (k as any).pubkey === "string" ? (k as any).pubkey : undefined;

/** Pure: check a getTransaction(jsonParsed) result against expectations. No I/O. */
export function checkShieldTransaction(tx: any, exp: VerifyExpectations): VerifyResult {
  if (!tx || typeof tx !== "object") return { ok: false, reason: "transaction not found" };
  const meta = tx.meta;
  if (!meta) return { ok: false, reason: "transaction has no meta" };
  if (meta.err !== null && meta.err !== undefined) return { ok: false, reason: "transaction failed on-chain" };
  const sigs: unknown = tx.transaction?.signatures;
  if (!Array.isArray(sigs) || sigs[0] !== exp.signature) return { ok: false, reason: "signature mismatch" };
  const blockTime = tx.blockTime;
  if (typeof blockTime !== "number") return { ok: false, reason: "transaction has no blockTime" };
  if (blockTime > exp.nowSec + 60) return { ok: false, reason: "transaction blockTime is in the future" };
  if (exp.nowSec - blockTime > exp.maxAgeSec) return { ok: false, reason: "transaction too old" };

  const msg = tx.transaction?.message ?? {};
  const accountKeys: string[] = (Array.isArray(msg.accountKeys) ? msg.accountKeys : []).map(keyOf).filter(Boolean) as string[];
  const loaded = meta.loadedAddresses ?? {};
  for (const a of [...(loaded.writable ?? []), ...(loaded.readonly ?? [])]) if (typeof a === "string") accountKeys.push(a);

  const ixs: any[] = [...(Array.isArray(msg.instructions) ? msg.instructions : [])];
  for (const inner of Array.isArray(meta.innerInstructions) ? meta.innerInstructions : []) ixs.push(...(inner?.instructions ?? []));
  const programOf = (ix: any): string | undefined =>
    typeof ix?.programId === "string" ? ix.programId : typeof ix?.programIdIndex === "number" ? accountKeys[ix.programIdIndex] : undefined;
  const ringIxs = ixs.filter((ix) => programOf(ix) === exp.ringProgramId);
  if (ringIxs.length === 0) return { ok: false, reason: "transaction does not invoke the shielded pool program" };

  const ixAccounts = ringIxs.flatMap((ix) => (Array.isArray(ix.accounts) ? ix.accounts : []).map((a: unknown) => typeof a === "number" ? accountKeys[a] : keyOf(a)));
  if (!ixAccounts.includes(exp.ringAccount) && !accountKeys.includes(exp.ringAccount)) {
    return { ok: false, reason: "transaction does not reference the campaign ring account" };
  }
  return { ok: true, slot: Number(tx.slot ?? 0), blockTime };
}

export type RpcFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface ShieldVerifier {
  verify(signature: string, ringAccount: string): Promise<VerifyResult>;
}

export interface HeliusVerifierOptions {
  rpcUrl: string;
  ringProgramId: string;
  apiKey?: string;
  fetch?: RpcFetch;
  now?: () => number;
  maxAgeSec?: number;
}

const SIG_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

export class HeliusVerifier implements ShieldVerifier {
  private used = new Set<string>();
  private pending = new Set<string>();
  private readonly f: RpcFetch;
  private readonly now: () => number;
  private readonly maxAgeSec: number;
  constructor(private opts: HeliusVerifierOptions) {
    this.f = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.now = opts.now ?? Date.now;
    this.maxAgeSec = opts.maxAgeSec ?? 15 * 60;
  }

  async fetchTransaction(signature: string): Promise<any> {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] });
    try {
      const res = await this.f(this.opts.rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const data = await res.json();
      if (data?.error) throw new Error(`RPC error ${data.error.code ?? ""}: ${data.error.message ?? "unknown"}`);
      return data?.result ?? null;
    } catch (e) {
      throw new Error(redact(`getTransaction failed: ${(e as Error).message}`, this.opts.apiKey));
    }
  }

  async verify(signature: string, ringAccount: string): Promise<VerifyResult> {
    if (!SIG_RE.test(signature)) return { ok: false, reason: "malformed signature" };
    if (this.used.has(signature) || this.pending.has(signature)) return { ok: false, reason: "signature already used" };
    this.pending.add(signature);
    try {
      const tx = await this.fetchTransaction(signature);
      const r = checkShieldTransaction(tx, { signature, ringProgramId: this.opts.ringProgramId, ringAccount, nowSec: Math.floor(this.now() / 1000), maxAgeSec: this.maxAgeSec });
      if (r.ok) this.used.add(signature);
      return r;
    } finally {
      this.pending.delete(signature);
    }
  }
}
