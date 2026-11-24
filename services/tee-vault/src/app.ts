import { randomBytes, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { Vault, verifyRegulatorSignature } from "./vault.js";

export interface VaultDeps {
  vault?: Vault;
  /** regulatorId -> Ed25519 public key (PEM). */
  regulators?: Record<string, string>;
  autoVerify?: boolean;
  reviewerKey?: string;
  maxSkewMs?: number;
}

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);
const Submit = z.object({ encryptedDoc: z.string().min(16).max(5_000_000) });
const Access = z.object({
  request: z.object({ regulatorId: z.string().min(1).max(128), commitment: hex64, reason: z.string().min(3).max(1000), timestamp: z.string(), nonce: z.string().min(8).max(128) }),
  signature: z.string().min(16),
});

export function loadRegulatorsFromEnv(): Record<string, string> {
  // REGULATOR_KEYS='{"sec-demo":"-----BEGIN PUBLIC KEY-----\n..."}'
  try { return JSON.parse(process.env.REGULATOR_KEYS ?? "{}"); } catch { return {}; }
}

export function resolveReviewerKey(): string {
  const v = process.env.REVIEWER_KEY || process.env.KYC_REVIEWER_KEY;
  if (v) return v;
  if (process.env.NODE_ENV === "production") throw new Error("REVIEWER_KEY must be set when NODE_ENV=production (refusing to start)");
  const key = randomBytes(24).toString("hex");
  console.warn(`[tee-vault] REVIEWER_KEY not set; generated a random development key for this process: ${key}`);
  return key;
}

function safeEqual(a: string | undefined, b: string): boolean {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createVaultApp(deps: VaultDeps = {}) {
  const vault = deps.vault ?? new Vault();
  const regulators = deps.regulators ?? loadRegulatorsFromEnv();
  const autoVerify = deps.autoVerify ?? process.env.KYC_AUTO_VERIFY !== "0";
  const reviewerKey = deps.reviewerKey ?? resolveReviewerKey();
  const maxSkew = deps.maxSkewMs ?? 5 * 60_000;
  const seenNonces = new Set<string>();
  const attested = process.env.NITRO_ENCLAVE === "1";

  const app = new Hono();
  app.use("*", cors({ origin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(",") }));

  app.get("/health", (c) => c.json({ ok: true, service: "harvestia-tee-vault", attested, mode: attested ? "nitro-enclave" : "local-unattested" }));

  app.post("/kyc/submit", async (c) => {
    const r = Submit.safeParse(await c.req.json().catch(() => ({})));
    if (!r.success) return c.json({ error: "validation failed", details: r.error.flatten() }, 400);
    const { commitment, salt } = vault.submit(r.data.encryptedDoc, undefined, autoVerify);
    return c.json({ commitment, salt, status: vault.get(commitment)!.status, root: vault.root() }, 201);
  });

  app.post("/kyc/review/:commitment", async (c) => {
    if (!safeEqual(c.req.header("x-reviewer-key"), reviewerKey)) return c.json({ error: "reviewer key required" }, 401);
    const body = z.object({ status: z.enum(["verified", "rejected"]) }).safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "validation failed" }, 400);
    if (!vault.setStatus(c.req.param("commitment"), body.data.status, "reviewer")) return c.json({ error: "not found" }, 404);
    return c.json({ ok: true, root: vault.root() });
  });

  app.get("/kyc/root", (c) => c.json({ root: vault.root(), leaves: vault.verifiedCommitments().length }));

  app.get("/kyc/proof/:commitment", (c) => {
    const proof = vault.proof(c.req.param("commitment"));
    if (!proof) return c.json({ error: "commitment not verified" }, 404);
    return c.json({ root: vault.root(), proof });
  });

  app.post("/regulator/access", async (c) => {
    const r = Access.safeParse(await c.req.json().catch(() => ({})));
    if (!r.success) return c.json({ error: "validation failed", details: r.error.flatten() }, 400);
    const { request, signature } = r.data;
    const pem = regulators[request.regulatorId];
    if (!pem) return c.json({ error: "unknown regulator" }, 403);
    if (!verifyRegulatorSignature(request, signature, pem)) return c.json({ error: "bad signature" }, 403);
    const ts = Date.parse(request.timestamp);
    if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > maxSkew) return c.json({ error: "stale request" }, 403);
    if (seenNonces.has(request.nonce)) return c.json({ error: "replayed nonce" }, 409);
    seenNonces.add(request.nonce);
    const rec = vault.get(request.commitment);
    if (!rec) return c.json({ error: "commitment not found" }, 404);
    // Log BEFORE release so every disclosure is on the chain.
    const entry = vault.audit.append({ type: "regulator.access", regulatorId: request.regulatorId, commitment: request.commitment, reason: request.reason, nonce: request.nonce, signature });
    // Document is returned still client-encrypted; the enclave only removes its own seal.
    return c.json({ auditSeq: entry.seq, auditHash: entry.hash, encryptedDoc: vault.unseal(rec.sealed).toString("utf8") });
  });

  app.get("/audit/head", (c) => c.json({ head: vault.audit.head, length: vault.audit.length, chainValid: vault.audit.verifyChain() }));

  return { app, vault };
}
