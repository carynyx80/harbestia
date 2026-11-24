# Deploying Harvestia

The company wallet **`DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx`** ends up in control of
everything, but it **does not sign anything during the deploy**. A separate, throwaway
"deployer" wallet pays all the costs. After the deploy, that deployer has no special
power and you can empty it.

## What it costs (exact numbers for the current build)

Rent is the same on every cluster. These figures come from `solana rent`, using the real `.so` sizes
(`harvestia.so` = 610,560 bytes, `harvestia_hook.so` = 196,280 bytes, `--max-len` = exact size):

| Item | SOL | Refunded? |
|---|---|---|
| harvestia ProgramData rent | 4.250701680 | locked while the program exists |
| harvestia_hook ProgramData rent | 1.367312880 | locked while the program exists |
| 2 × Program account rent | 0.002282880 | locked |
| Write buffer (largest, held during the deploy) | 4.250646000 | **yes**, returned to the deployer after the deploy |
| Transaction fees (about 820 write txs, estimate) | 0.004180000 | no |
| Config account and company USDC account rent | 0.003953280 | locked |
| **Peak balance needed** | **9.879076720** | |
| **Script's minimum (peak + 5% margin)** | **10.373030556** | |
| **Net cost once done** | **≈ 5.63** | |

The localnet rehearsal spent 5.628300720 SOL, and the estimate was 5.628430720 SOL.
**Fund the deployer with 10.4 SOL.** About 4.7 SOL comes back to the deployer afterwards.
If mainnet is congested, add `PRIORITY_FEE=<micro-lamports>`. That raises fees a little.

## What the company wallet controls

* **Upgrade authority of both programs.** Only the company can upgrade the code or make it immutable.
* **`config.admin`.** Signs `approve_campaign` and the other admin actions, plus `transfer_admin`.
* **`config.reviewer`.** Signs `reviewer_decide` (second quorum failure).
* **Treasury.** The success fee goes to the company's own USDC token account (its associated token account).
  The program checks at init that the treasury's mint is USDC and its owner is the admin,
  so fees cannot be sent anywhere else.

## How the company signs later

The admin actions are normal transactions signed by the company wallet:

* **Phantom / Solflare.** Connect the company wallet to the Harvestia admin UI and approve the transaction.
  A Ledger hardware wallet behind Phantom is strongly recommended.
* **Recommended: a Squads multisig** (https://squads.so). Create a Squads vault, for example 2 of 3 founders.
  Then do both of these, as proposals the members approve:
  1. Admin: the current company wallet calls `transfer_admin(<squads vault>)`.
     Note: the treasury stays at the original company USDC account. If fees should also go to Squads,
     put the vault in `COMPANY_WALLET` *before* the deploy. The script supports vault PDAs.
  2. Upgrade authority: `solana program set-upgrade-authority <id> --new-upgrade-authority <vault>`,
     signed by the company wallet.
  Better still, deploy with `COMPANY_WALLET=<squads vault address>` from the start.

## Run it

Prerequisites: run `anchor build` in `chain/`, and have `node` and the Solana CLI installed.
Then, from `chain/scripts/`:

```bash
# cost check only (makes no changes):
ESTIMATE_ONLY=1 ./deploy.sh mainnet-beta /path/to/funded-deployer.json

# real mainnet deploy (asks you to type "yes"):
./deploy.sh mainnet-beta /path/to/funded-deployer.json
```

The defaults are `COMPANY_WALLET=DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx`,
mainnet `USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (devnet uses
`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) and `FEE_BPS=500`.
Use `RPC_URL_OVERRIDE=<paid RPC>` for a faster mainnet RPC.

What the script does:
1. Prints the cost compared with the deployer's balance. It stops if the deployer is short.
2. Runs `solana program deploy`, with `--max-len` set to the exact `.so` size, for both program IDs in `target/deploy`.
3. Runs `set-upgrade-authority` to give upgrade authority to the company, with `--skip-new-upgrade-authority-signer-check`.
4. Runs `init-config.ts`. It creates the company's USDC account (the deployer pays), then calls
   `initialize_config(admin=COMPANY, reviewer=COMPANY, fee_bps=500)`.
5. Runs `verify.ts`. It checks admin, reviewer and mint, and checks that the treasury owner is the company.

You can safely re-run the script. Steps that are already done are skipped. If a deploy fails partway,
re-run it: the buffer keypairs are kept in `~/.harvestia-deploy-buffers/<cluster>/`.
To reclaim a stuck buffer's SOL, run `solana program close <buffer>`.

After it finishes, move any SOL left on the deployer back to the company, then throw the deployer key away.

## Localnet rehearsal (free)

```bash
solana-test-validator --reset --quiet --ledger /tmp/hv-ledger &
solana-keygen new -o /tmp/deployer.json --no-bip39-passphrase --silent
solana -u localhost airdrop 50 $(solana-keygen pubkey /tmp/deployer.json)
cd chain/scripts
export USDC_MINT=$(RPC_URL=http://127.0.0.1:8899 DEPLOYER_KEYPAIR=/tmp/deployer.json npx tsx localnet-mock-usdc.ts)
COMPANY_WALLET=<any local pubkey> ./deploy.sh localnet /tmp/deployer.json
```
