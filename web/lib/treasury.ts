// Treasury mode (v4): plain SPL USDC transfers to/from the company treasury wallet.
// Browser-safe. All RPC goes through {API}/rpc (no keys client-side).
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
/** Rent for a new token account (165 bytes) — 0.00203928 SOL. */
export const ATA_RENT_LAMPORTS = 2_039_280;
/** Base fee + priority fee headroom. */
export const FEE_BUFFER_LAMPORTS = 300_000;
export const PRIORITY_MICRO_LAMPORTS = 50_000;
const DEFAULT_CU = 200_000;

export const solscanTx = (sig: string, cluster = "mainnet-beta") =>
  `https://solscan.io/tx/${sig}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
export const solscanAccount = (addr: string, cluster = "mainnet-beta") =>
  `https://solscan.io/account/${addr}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;

/**
 * fetch wrapper that drops web3.js's custom "solana-client" header so the request to
 * {API}/rpc stays CORS-simple (only content-type), whatever the proxy's allowed headers.
 */
export const proxyFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  headers.delete("solana-client");
  return fetch(input, { ...init, headers });
};

export function makeConnection(rpcUrl: string, commitment: Commitment = "confirmed") {
  // We never subscribe (no websockets through the proxy); confirmation is by polling.
  return new Connection(rpcUrl, { commitment, disableRetryOnRateLimit: false, fetch: proxyFetch });
}

export function usdcToBase(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than 0.");
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}
export const baseToUsdc = (b: bigint | number) => Number(b) / 10 ** USDC_DECIMALS;

export function randomCommitment(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function memoInstruction(text: string, signer: PublicKey) {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    data: new TextEncoder().encode(text) as Buffer,
  });
}

export interface WalletBalances {
  lamports: number;
  usdcBase: bigint;
  /** Token account holding the most USDC (prefer the ATA). null if none. */
  usdcSource: PublicKey | null;
}

export async function getWalletBalances(connection: Connection, owner: PublicKey, mint: PublicKey): Promise<WalletBalances> {
  const [lamports, parsed] = await Promise.all([
    connection.getBalance(owner, "confirmed"),
    connection.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed"),
  ]);
  const ata = getAssociatedTokenAddressSync(mint, owner, true);
  let total = BigInt(0);
  let best: { pk: PublicKey; amt: bigint } | null = null;
  for (const { pubkey, account } of parsed.value) {
    const info = (account.data as { parsed?: { info?: { tokenAmount?: { amount?: string } } } }).parsed?.info;
    const amt = BigInt(info?.tokenAmount?.amount ?? "0");
    total += amt;
    if (!best || amt > best.amt || (amt === best.amt && pubkey.equals(ata))) best = { pk: pubkey, amt };
  }
  return { lamports, usdcBase: total, usdcSource: best && best.amt > BigInt(0) ? best.pk : null };
}

export async function accountExists(connection: Connection, pk: PublicKey) {
  return (await connection.getAccountInfo(pk, "confirmed")) !== null;
}

export interface Transfer {
  to: PublicKey; // wallet owner
  amountBase: bigint;
}

/** Build instructions: CU limit + price, then per transfer createATAIdempotent + transferChecked, then memo. */
export function buildTransferIxs(opts: {
  payer: PublicKey;
  source: PublicKey; // payer's USDC token account
  mint: PublicKey;
  transfers: Transfer[];
  memo: string;
  computeUnits?: number;
  microLamports?: number;
}): TransactionInstruction[] {
  const ixs: TransactionInstruction[] = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: opts.computeUnits ?? DEFAULT_CU }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.microLamports ?? PRIORITY_MICRO_LAMPORTS }),
  ];
  for (const t of opts.transfers) {
    const destAta = getAssociatedTokenAddressSync(opts.mint, t.to, true);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(opts.payer, destAta, t.to, opts.mint));
    ixs.push(createTransferCheckedInstruction(opts.source, opts.mint, destAta, opts.payer, t.amountBase, USDC_DECIMALS));
  }
  ixs.push(memoInstruction(opts.memo, opts.payer));
  return ixs;
}

export function compileTx(payer: PublicKey, blockhash: string, ixs: TransactionInstruction[]) {
  return new VersionedTransaction(new TransactionMessage({ payerKey: payer, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message());
}

/** Human-readable simulation error. */
export function explainSimError(err: unknown, logs: string[] | null | undefined): string {
  const text = [JSON.stringify(err), ...(logs ?? [])].join("\n");
  if (/insufficient funds/i.test(text)) return "Insufficient USDC in your token account for this amount.";
  if (/InsufficientFundsForRent|insufficient lamports|AccountNotFound|InsufficientFundsForFee/i.test(text))
    return "Not enough SOL to pay the network fee (and token account rent). Add ~0.003 SOL to this wallet.";
  if (/BlockhashNotFound/i.test(text)) return "Network blockhash expired — please try again.";
  if (/owner does not match|InvalidAccountData/i.test(text)) return "Your USDC token account is invalid for this mint.";
  const last = (logs ?? []).filter((l) => /error|failed/i.test(l)).slice(-1)[0];
  return `Simulation failed: ${last ?? JSON.stringify(err)}`;
}

/**
 * Simulate (sigVerify off, replace blockhash), return CU used. Throws a plain-language error.
 */
export async function simulateOrThrow(connection: Connection, tx: VersionedTransaction): Promise<number> {
  const sim = await connection.simulateTransaction(tx, { sigVerify: false, replaceRecentBlockhash: true, commitment: "confirmed" });
  if (sim.value.err) throw new Error(explainSimError(sim.value.err, sim.value.logs));
  return sim.value.unitsConsumed ?? DEFAULT_CU;
}

export type ConfirmProgress = (info: { resent: number }) => void;

/**
 * Send a signed tx through our RPC, re-broadcast every 2s, poll status until confirmed
 * or the blockhash expires (block height estimated from getLatestBlockhash since the
 * proxy allowlist has no getBlockHeight: lastValidBlockHeight(latest) - 150 ≈ current height).
 */
export async function sendAndConfirm(
  connection: Connection,
  signed: VersionedTransaction,
  lastValidBlockHeight: number,
  onProgress?: ConfirmProgress,
): Promise<string> {
  const raw = signed.serialize();
  const sig = await connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 });
  let resent = 0;
  const started = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: false })).value[0];
    if (st?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(st.err)}`);
    if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return sig;
    const { lastValidBlockHeight: lv } = await connection.getLatestBlockhash("confirmed");
    const height = lv - 150;
    if (height > lastValidBlockHeight) {
      const fin = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value[0];
      if (fin && !fin.err && fin.confirmationStatus) return sig;
      throw new Error("Transaction expired before it was confirmed (network congestion). No funds moved — please try again.");
    }
    if (Date.now() - started > 120_000) throw new Error(`Still unconfirmed after 2 minutes. Check Solscan for ${sig} before retrying.`);
    connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => undefined);
    onProgress?.({ resent: ++resent });
  }
}

/** Plain-language wallet errors. */
export function walletErrorMessage(e: unknown): string {
  const err = e as { name?: string; message?: string; error?: { code?: number; message?: string }; code?: number };
  const msg = `${err?.message ?? ""} ${err?.error?.message ?? ""}`;
  const code = err?.code ?? err?.error?.code;
  if (code === 4001 || /reject|declin|cancel|denied/i.test(msg)) return "You cancelled the request in your wallet.";
  if (err?.name === "WalletNotReadyError") return "That wallet isn't installed or ready. Install it (or open this page in its in-app browser) and reload.";
  if (err?.name === "WalletNotConnectedError" || /not connected/i.test(msg)) return "Wallet disconnected. Reconnect and try again.";
  if (err?.name === "WalletWindowClosedError") return "The wallet window was closed before you approved.";
  if (/network|cluster|genesis/i.test(msg)) return "Your wallet seems to be on a different network. Switch it to Solana Mainnet and retry.";
  return msg.trim() || err?.name || String(e);
}
