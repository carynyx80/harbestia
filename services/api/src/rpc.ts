// POST /rpc: JSON-RPC proxy with a method allowlist. The browser never sees the upstream URL or key.
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { RpcFetch } from "./treasury.js";

export const RPC_ALLOWLIST = new Set([
  "getLatestBlockhash", "getAccountInfo", "getBalance", "getTokenAccountsByOwner", "getSignatureStatuses",
  "sendTransaction", "simulateTransaction", "getTransaction", "getMinimumBalanceForRentExemption", "getTokenAccountBalance",
]);
export const RPC_MAX_BODY_BYTES = 64 * 1024;
export const RPC_MAX_BATCH = 20;

export interface RpcProxyOptions {
  upstreamUrl: string;
  fetch?: RpcFetch;
  /** Requests per IP per window (default 60/min). */
  limit?: number;
  windowMs?: number;
  now?: () => number;
}

const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function clientIp(c: any): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return c.req.header("x-real-ip") ?? c.env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export function registerRpcProxy(app: Hono, opts: RpcProxyOptions) {
  const f: RpcFetch = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));
  const limit = opts.limit ?? 60, windowMs = opts.windowMs ?? 60_000, now = opts.now ?? Date.now;
  const hits = new Map<string, { start: number; count: number }>();

  app.post("/rpc", bodyLimit({ maxSize: RPC_MAX_BODY_BYTES, onError: (c) => c.json(rpcError(null, -32600, "request body too large"), 413) }), async (c) => {
    const ip = clientIp(c), t = now();
    const h = hits.get(ip);
    if (!h || t - h.start >= windowMs) hits.set(ip, { start: t, count: 1 });
    else if (++h.count > limit) return c.json(rpcError(null, -32005, "rate limit exceeded"), 429);
    if (hits.size > 10_000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);

    const raw = await c.req.json().catch(() => undefined);
    if (raw === undefined) return c.json(rpcError(null, -32700, "parse error"), 400);
    const batch = Array.isArray(raw);
    const reqs: any[] = batch ? raw : [raw];
    if (reqs.length === 0 || reqs.length > RPC_MAX_BATCH) return c.json(rpcError(null, -32600, `batch must contain 1-${RPC_MAX_BATCH} requests`), 400);

    const results: any[] = new Array(reqs.length);
    const forward: { i: number; req: any }[] = [];
    reqs.forEach((r, i) => {
      if (!r || typeof r !== "object" || r.jsonrpc !== "2.0" || typeof r.method !== "string") results[i] = rpcError(r?.id, -32600, "invalid request");
      else if (!RPC_ALLOWLIST.has(r.method)) results[i] = rpcError(r.id, -32601, `method not allowed: ${r.method.slice(0, 64)}`);
      else forward.push({ i, req: { jsonrpc: "2.0", id: r.id ?? null, method: r.method, ...(r.params !== undefined ? { params: r.params } : {}) } });
    });

    if (forward.length) {
      let upstream: any;
      try {
        // Re-number ids so responses map back unambiguously.
        const body = JSON.stringify(forward.map((x, k) => ({ ...x.req, id: k })));
        const res = await f(opts.upstreamUrl, { method: "POST", headers: { "content-type": "application/json" }, body });
        upstream = await res.json();
      } catch {
        upstream = undefined;
      }
      const arr: any[] = Array.isArray(upstream) ? upstream : [];
      forward.forEach((x, k) => {
        const r = arr.find((u) => u && u.id === k);
        results[x.i] = r ? { ...r, id: x.req.id } : rpcError(x.req.id, -32603, "upstream RPC error");
      });
    }
    return c.json(batch ? results : results[0]);
  });
}
