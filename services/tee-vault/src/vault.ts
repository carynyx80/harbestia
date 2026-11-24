// KYC vault core. Designed to run inside an AWS Nitro Enclave (or other TEE):
// the sealing key never leaves enclave memory; only commitments / Merkle roots / audit heads leave.
import { createCipheriv, createDecipheriv, createHash, createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";

export const sha256 = (...parts: (string | Buffer)[]) => {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
};

// ---------- Merkle tree (sorted-pair sha256, odd leaf promoted) ----------
export function merkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return "0".repeat(64);
  let level = [...leaves].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1];
      if (b === undefined) { next.push(a); continue; }
      const [l, r] = a < b ? [a, b] : [b, a];
      next.push(sha256(Buffer.from(l, "hex"), Buffer.from(r, "hex")));
    }
    level = next;
  }
  return level[0];
}

export function merkleProof(leaves: string[], leaf: string): string[] | null {
  let level = [...leaves].sort();
  let idx = level.indexOf(leaf);
  if (idx < 0) return null;
  const proof: string[] = [];
  while (level.length > 1) {
    const sib = idx % 2 === 0 ? level[idx + 1] : level[idx - 1];
    if (sib !== undefined) proof.push(sib);
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i], b = level[i + 1];
      if (b === undefined) { next.push(a); continue; }
      const [l, r] = a < b ? [a, b] : [b, a];
      next.push(sha256(Buffer.from(l, "hex"), Buffer.from(r, "hex")));
    }
    idx = Math.floor(idx / 2);
    level = next;
  }
  return proof;
}

export function verifyMerkleProof(leaf: string, proof: string[], root: string): boolean {
  let h = leaf;
  for (const s of proof) {
    const [l, r] = h < s ? [h, s] : [s, h];
    h = sha256(Buffer.from(l, "hex"), Buffer.from(r, "hex"));
  }
  return h === root;
}

// ---------- Append-only hash-chained audit log ----------
export interface AuditEntry { seq: number; at: string; prevHash: string; event: Record<string, unknown>; hash: string }

export class AuditLog {
  private entries: AuditEntry[] = [];
  get head() { return this.entries.at(-1)?.hash ?? "0".repeat(64); }
  get length() { return this.entries.length; }
  append(event: Record<string, unknown>, at = new Date().toISOString()): AuditEntry {
    const seq = this.entries.length;
    const prevHash = this.head;
    const hash = sha256(prevHash, canonical({ seq, at, event }));
    const e = Object.freeze({ seq, at, prevHash, event, hash });
    this.entries.push(e);
    return e;
  }
  all(): readonly AuditEntry[] { return this.entries; }
  verifyChain(): boolean {
    let prev = "0".repeat(64);
    return this.entries.every((e, i) => {
      const ok = e.seq === i && e.prevHash === prev && e.hash === sha256(prev, canonical({ seq: e.seq, at: e.at, event: e.event }));
      prev = e.hash;
      return ok;
    });
  }
}

export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as any)[k])}`).join(",")}}`;
}

// ---------- Regulator request signatures (Ed25519) ----------
export interface RegulatorRequest { regulatorId: string; commitment: string; reason: string; timestamp: string; nonce: string }

export function verifyRegulatorSignature(req: RegulatorRequest, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key: KeyObject = createPublicKey(publicKeyPem);
    return verify(null, Buffer.from(canonical(req)), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

// ---------- Vault ----------
export interface KycRecord { commitment: string; sealed: string; status: "pending" | "verified" | "rejected"; createdAt: string }

export class Vault {
  /** Enclave-resident sealing key. In Nitro this is derived from KMS with an attestation-bound policy. */
  private readonly sealKey: Buffer;
  private records = new Map<string, KycRecord>();
  readonly audit = new AuditLog();

  constructor(sealKey: Buffer = randomBytes(32)) { this.sealKey = sealKey; }

  private seal(plain: Buffer): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.sealKey, iv);
    const ct = Buffer.concat([c.update(plain), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
  }
  unseal(sealed: string): Buffer {
    const b = Buffer.from(sealed, "base64");
    const d = createDecipheriv("aes-256-gcm", this.sealKey, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  }

  /** Store an (already client-encrypted) KYC doc, double-sealed with the enclave key. Returns a commitment. */
  submit(encryptedDoc: string, salt = randomBytes(16).toString("hex"), autoVerify = false): { commitment: string; salt: string } {
    const commitment = sha256("harvestia-kyc-v1", sha256(encryptedDoc), salt);
    this.records.set(commitment, { commitment, sealed: this.seal(Buffer.from(encryptedDoc, "utf8")), status: autoVerify ? "verified" : "pending", createdAt: new Date().toISOString() });
    this.audit.append({ type: "kyc.submit", commitment });
    return { commitment, salt };
  }

  setStatus(commitment: string, status: "verified" | "rejected", by: string): boolean {
    const r = this.records.get(commitment);
    if (!r) return false;
    r.status = status;
    this.audit.append({ type: "kyc.review", commitment, status, by });
    return true;
  }

  get(commitment: string) { return this.records.get(commitment); }
  verifiedCommitments(): string[] { return [...this.records.values()].filter((r) => r.status === "verified").map((r) => r.commitment); }
  root(): string { return merkleRoot(this.verifiedCommitments()); }
  proof(commitment: string) { return merkleProof(this.verifiedCommitments(), commitment); }
}
