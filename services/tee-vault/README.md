# @harvestia/tee-vault

KYC document vault + regulator-access audit log, designed to run inside an **AWS Nitro Enclave** (or any TEE).
Port `8788`. Only commitments, Merkle roots and audit heads leave the enclave.

## Endpoints
- `GET  /health` — reports `attested` / `mode`
- `POST /kyc/submit` `{ encryptedDoc }` — doc is already encrypted client-side; the enclave seals it again (AES-256-GCM, enclave-resident key) and returns `{ commitment, salt, status, root }`. `commitment = sha256("harvestia-kyc-v1" | sha256(encryptedDoc) | salt)`.
- `POST /kyc/review/:commitment` (header `x-reviewer-key`) `{ status: "verified"|"rejected" }`
- `GET  /kyc/root` — Merkle root (sorted-pair SHA-256) of **verified** commitments; published on-chain and used as the public input to the ZK "KYC-verified" membership circuit.
- `GET  /kyc/proof/:commitment` — Merkle path for the investor's client-side prover.
- `POST /regulator/access` `{ request: { regulatorId, commitment, reason, timestamp, nonce }, signature }` — Ed25519 signature over the canonical JSON of `request`, by a key in `REGULATOR_KEYS`. Rejects unknown keys, bad signatures, >5 min clock skew and replayed nonces. The access is appended to the audit log **before** the document is released.
- `GET  /audit/head` — `{ head, length, chainValid }`. Each entry hash = `sha256(prevHash | canonical({seq, at, event}))`; publish `head` periodically (e.g. to Solana memo) so the log is externally tamper-evident.

## Attestation flow (production)
1. Build the service into an enclave image (`nitro-cli build-enclave`) → reproducible **PCR0/1/2** measurements, published in the repo/release.
2. On boot the enclave requests an **attestation document** from the Nitro Security Module (NSM), signed by the AWS Nitro PKI and containing the PCRs plus an ephemeral enclave public key.
3. The sealing key is fetched from **AWS KMS** using a key policy with `kms:RecipientAttestation:PCR0` conditions — KMS only releases the key into an enclave with the expected measurements. The parent EC2 instance never sees it.
4. Clients (web app, regulators) fetch the attestation doc, verify the AWS cert chain and PCRs, then encrypt to the enclave's ephemeral key. Traffic reaches the enclave over vsock via the parent proxy.
5. `NITRO_ENCLAVE=1` is set only inside the enclave image.

## Locally
Runs as a plain Node process, **unattested**: random in-memory sealing key, state lost on restart, `/health` reports `mode: "local-unattested"`. `KYC_AUTO_VERIFY` defaults on (set `0` to require review). Do not store real KYC data.

```
npm install && npm run dev      # http://localhost:8788
npm test && npm run build && npm start
```
Env: `PORT`, `REGULATOR_KEYS` (JSON `{ id: PEM }`), `REVIEWER_KEY` (required in production; random dev key printed at startup if unset), `KYC_AUTO_VERIFY`, `CORS_ORIGIN`.
