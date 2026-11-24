# Harvestia

**Pitch in public. Invest invisible.** Live at [www.harvestia.xyz](https://www.harvestia.xyz) · API at https://api.harvestia.xyz (pending DNS).

**Pitch in public. Invest invisible.** Shark Tank for startups on Solana: founders pitch publicly, investors back them privately, and funds stay locked in a milestone safe until investors vote that the work is done. Missed milestones refund the remaining funds.

> Status: in active development. Privacy integrations (Helius Privacy Rings, Arcium, ZK) are stubbed with mock implementations and the programs are unaudited. Do not use with real funds.

## Repo layout

| Folder | What it is | Deploys to |
|---|---|---|
| `web/` | Next.js 16 frontend (landing + app) | Vercel (root directory `web`) |
| `services/api` | Hono REST API: campaigns, private invest, votes, refunds | Railway (root directory `services`, see `services/railway.json`) |
| `services/sdk` | Typed TypeScript client for the API | built as part of the API |
| `services/tee-vault` | KYC vault service designed for a TEE | not deployed yet |
| `chain/` | Anchor programs: `harvestia` (campaigns, safe, voting) and `harvestia-hook` (Token-2022 lockup/allowlist) | Solana (not deployed) |
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

- Web: `NEXT_PUBLIC_HARVESTIA_API` — base URL of the API.
- API: `ADMIN_KEY` (required in production), `CORS_ORIGIN` (comma-separated allowed origins), `NODE_ENV`.
- Vault: `REVIEWER_KEY`.

Copy the `.env.example` files; never commit real values.

## Tests

```bash
cd chain && cargo test --workspace
cd services/api && npm test
cd privacy/arcium/reference && cargo test
```
