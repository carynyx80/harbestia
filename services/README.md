# Harvestia services

| package | port | start |
|---|---|---|
| `sdk/` (`@harvestia/sdk`) | – | `npm install && npm run build` (build first; `api` depends on it via `file:../sdk`) |
| `api/` | 8787 | `npm install && npm run dev` |
| `tee-vault/` | 8788 | `npm install && npm run dev` — see `tee-vault/README.md` |

Each package has `dev`, `build`, `test`. API admin header: `x-admin-key: $ADMIN_KEY` (env `ADMIN_KEY`, required in production; random dev key printed at startup if unset). MOCK PRIVACY: amounts and votes are NOT encrypted (`privacyMode: "mock"` in /health). CORS origin `http://localhost:3000` (env `CORS_ORIGIN`).

## API privacy model
- `POST /campaigns/:id/invest` takes `{ commitment, ciphertext, proof }`. The API never decrypts: the `SumProvider` (Arcium MXE; local `MockArciumSum`) adds the ciphertext to an encrypted running sum and returns only `amountRevealedTotal`, which becomes the public `raisedUsdc`.
- Votes `{ nullifier, encryptedVote, proof }` are stored sealed; reused nullifiers are rejected (409). `finalize` hands sealed ballots to a pluggable `TallyProvider` (default `MockArciumTally`) which reveals only outcome, turnout and yes share.
- `GET /portfolio/:viewKeyHash` returns only blobs encrypted to the investor's view key.
- The mock `mockenc1:` ciphertexts / `mockproof:` proofs (see `sealInvestment` / `sealVote` in the SDK) are NOT secure; they stand in for the Arcium and ZK client libraries from `privacy/`.

## Rules (`api/src/rules.ts`, pure, tested)
Voter cap 10% of total weight; quorum 20% of stake; 7-day window; first No → `Resubmitted` (30-day window, `resubmitUsed`); second No → `Refunded` + campaign `Refunding`; quorum fails once → new 7-day round, twice → appeal to reviewer (admin `finalize` with `reviewerApprove`); all milestones Released → `Completed`; 7-day exit window after each vote; pro-rata refunds; 5% success fee; upfront `upfrontBps`. `finalize` with `{ force: true }` skips the 7-day wait for demos (blocked in `NODE_ENV=production` without admin).
