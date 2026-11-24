# Where your money sits: the Harvestia treasury model

**Pitch in public. Invest invisible.** That is where Harvestia is headed. This page explains how it works today.

## The short version

Your USDC goes to the Harvestia treasury wallet, a public address anyone can audit. Funds are released to founders milestone by milestone after investors vote, and refunded if milestones are missed.

- Treasury wallet: `DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx`
- Audit it: https://solscan.io/account/DtvUDyUhkehQzp1qWKxaCvYQtm6uHU7QMuSiHeLg3Scx

## How a deal moves

1. **You invest.** You sign a normal USDC transfer from your wallet to the treasury. A memo links it to the campaign. Our API checks the transaction on Solana mainnet before counting it.
2. **The raise closes.** The company sends the founder's upfront tranche from the treasury.
3. **Investors vote on each milestone.** Seven days, 20% quorum, 10% voter cap.
4. **Release or refund.** On a Yes, the company pays the next tranche to the founder. On a failed milestone (No twice) or a failed raise, the company refunds the remaining funds to investors pro-rata.

## What is enforced by code, and what is not

There is no custom on-chain program. Releases and refunds are executed **by the company** after investor votes, not by a smart contract. What code does guarantee is transparency: every USDC transfer into and out of the treasury is public on Solana.

## Is it private?

Not yet. Today your transfer to the treasury is a standard mainnet USDC transfer and is visible on-chain. The privacy layer is in development: Helius Privacy Rings is being integrated first, with Arcium (private vote tallies) and ZK proofs (private credentials and claims) to follow. None of these are live.

## What if Harvestia disappears?

This model is custodial: the company holds the treasury key, so you depend on the company to release or refund funds. The balance and history stay publicly checkable on Solscan, but no code forces a refund. To reduce this risk we plan to move the treasury to a multisig with independent signers.
