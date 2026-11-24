# Harvestia

Live at [www.harvestia.xyz](https://www.harvestia.xyz) · API at https://api.harvestia.xyz (pending DNS)

**Pitch in public. Invest invisible.** Shark Tank for startups on Solana: founders pitch publicly, investors back them in USDC, and funds are released milestone by milestone after investors vote that the work is done. Missed milestones are refunded.

> Status: in active development. Funds are custodial (held by the company treasury wallet). Privacy integrations (Helius Privacy Rings, Arcium, ZK) are being integrated and are **not live**: mainnet USDC transfers are visible on-chain today.

## Treasury model (v4)

There is no custom on-chain program in production. The Anchor programs in `chain/` are not deployed.

- **Where money sits:** the Harvestia treasury wallet [`DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx`](https://solscan.io/account/DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx), publicly auditable on Solscan. Only the company holds its key.
- **Invest:** the investor signs a plain SPL USDC transfer to the treasury's USDC token account, with a memo `harvestia:<campaignId>:<commitment>`. The API verifies the transaction on mainnet before recording it.
- **Release & refund:** done by the company wallet, not by code. After an investor vote passes, the company pays the founder's tranche; when a raise or milestone fails, the company refunds investors pro-rata. The admin page `/app/admin` (visible only to the treasury wallet) builds these transfers for signing, and the API verifies and records them.
- **Trust:** this is custodial. Investors rely on the company to execute releases and refunds; every transfer is visible on Solscan. We recommend moving the treasury to a multisig with independent signers.
- **Privacy:** Helius Privacy Rings sits behind `PRIVACY_MODE=helius` and is off by default. Arcium and ZK circuits in `privacy/` are not live.

See [`content/treasury-model.md`](content/treasury-model.md) for the plain-language explainer.

## Repo layout

| Folder | What it is | Deploys to |
|---|---|---|
| `web/` | Next.js 16 frontend (landing + app) | Vercel (root directory `web`) |
| `services/api` | Hono REST API: campaigns, private invest, votes, refunds | Railway (root directory `services`, see `services/railway.json`) |
| `services/sdk` | Typed TypeScript client for the API | built as part of the API |
| `services/tee-vault` | KYC vault service designed for a TEE | not deployed yet |
| `chain/` | Anchor programs: `harvestia` (campaigns, safe, voting) and `harvestia-hook` (Token-2022 lockup/allowlist) | not deployed (replaced by treasury model) |
| `privacy/` | Arcium circuits, Noir ZK circuits, Helius Rings adapter | — |
| `brand/` | Logo, X header, article banner | — |

## Local development

```bash
# API (port 8787)
cd services/sdk && npm ci && npm run build
cd ../api && npm ci && npm run dev

# Web (port 3000)
cd web && npm ci && npm run dev
```

## Environment variables

- Web: `NEXT_PUBLIC_HARVESTIA_API` — base URL of the API; `NEXT_PUBLIC_SOLANA_CLUSTER=mainnet`, `NEXT_PUBLIC_TREASURY_WALLET`, `NEXT_PUBLIC_USDC_MINT`.
- API: `ADMIN_KEY` (required in production), `CORS_ORIGIN` (comma-separated allowed origins), `NODE_ENV`, `TREASURY_MODE=on`, `SOLANA_CLUSTER=mainnet`, `TREASURY_WALLET`, `USDC_MINT`, `HELIUS_API_KEY` (optional).
- Vault: `REVIEWER_KEY`.

Copy the `.env.example` files; never commit real values.

## Tests

```bash
cd chain && cargo test --workspace
cd services/api && npm test
cd privacy/arcium/reference && cargo test
```
