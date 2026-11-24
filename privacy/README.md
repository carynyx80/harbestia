# Harvestia privacy layer

The promise is that founders are public and investors are invisible. This folder holds the pieces that keep that promise,
and lists honestly where it does not hold yet.

```
privacy/
  RESEARCH.md                 SDK names/API shapes we found, with sources and open questions
  arcium/encrypted-ixs/       Arcis MPC circuits (not compiled here: no arcium CLI)
  arcium/reference/           Plain-Rust mirror of the circuit math. Run `cargo test` (8 tests)
  zk/                         Noir workspace: lib + 5 circuits (not compiled here: no nargo)
  ts/                         @harvestia/privacy: adapters, interfaces, MockPrivacy. Run `npm test` (7 tests)
```

## Privacy map

| Data | Layer | Who can see it |
|---|---|---|
| Investor identity (KYC docs) | TEE vault (services/tee-vault) | The vault, plus a regulator through an audited request. Chain only sees a commitment in the KYC Merkle root |
| "Is KYC'd" | ZK `kyc_membership` | Everyone sees only "some KYC'd person". The per-campaign nullifier stops one identity from splitting into many wallets |
| Investment amount | Rings deposit + Arcium `record_contribution` | The amount is hidden in the Rings UTXO and as an `Enc<Mxe>` stake. **The public deposit leg reveals it** (see leaks) |
| Total raised | Arcium `sum_raised` | Public. Only the total is revealed |
| Vote choice and weight | Arcium `cast_weighted_vote` / `weighted_vote_tally` | Only yes%, no%, turnout% and quorum_met are revealed |
| One vote per investor | ZK `vote_nullifier` | Public sees a nullifier that cannot be linked to the position |
| Refund / exit amount | Arcium `prorata_refund` (encrypted to the owner) or ZK `refund_claim` (note commitment) | Only the investor |
| "I'm an investor" badge | ZK `investor_badge` | Shows the holder meets a minimum stake. Does not show which campaign or wallet |
| Funds not from a denylisted wallet | ZK `clean_funds` | Shows non-membership in the denylist root without revealing the wallet |
| Founder, milestones, spending, releases | none, public by design | Everyone |

Refund paths: the Arcium path is the default. It needs no client proving and uses the same `Enc<Mxe>` stake as voting.
The ZK `refund_claim` path is a fallback for when the MXE is unavailable. Pick one per deployment so a refund cannot be
claimed twice through two systems.

## Threat model

- **Adversaries:**
  - Chain observers and indexers.
  - Other investors.
  - The founder, who wants to learn who voted no.
  - The Harvestia backend, which is honest but curious.
  - Helius as RPC and prover.
  - A minority of Arcium nodes.
- **Protected against:**
  - Observers linking a wallet to a campaign position or an amount, in an anonymous Ring.
  - Founders learning individual votes or stakes.
  - Whales dominating the vote: the 10% cap is enforced inside MPC on the stake the MXE holds, not on a stake the voter claims.
  - Double voting and double refunds, through nullifiers.
- **Trust assumptions:**
  - Arcium: at least one honest node, depending on the cluster's security model.
  - TEE hardware and attestation for the KYC vault.
  - Soundness of Helius Rings proofs and programs, which are still under audit.
  - Correct generation of the KYC Merkle root by the vault.
- **Out of scope:**
  - Network-level metadata such as IP addresses. Use a relayer or RPC privacy for that.
  - Endpoint compromise of an investor's wallet.

## Known leaks (read before claiming "invisible")

1. **The Default Ring shows addresses.** Confidential mode hides the asset and amount only. Sender and recipient are public,
   so a transfer to the campaign vault reveals that the wallet invested. Anonymity needs an anonymous Custom Ring
   (relayer-submitted) or a fresh shielded wallet funded from a pooled deposit.
2. **Public deposit and withdraw legs reveal the wallet and amount.** If an investor shields exactly $25,000 and then
   invests minutes later, timing and amount correlation de-anonymise them. Mitigations: shield ahead of time, use round
   amounts, add delays. The UI should warn the investor.
3. **Small anonymity sets.** A campaign with 25 investors gives at best a 1-in-25 set. Turnout% times the public total
   raised can reveal the stake of a lone voter. Mitigations: reveal the tally only once at least N votes are in, and
   consider revealing only the pass/fail bit and quorum when there are fewer than about 10 voters.
4. **Percentages leak ratios.** yes% together with the public raisedUsdc bounds the capped yes weight. That is acceptable
   for governance but should be documented to investors.
5. **TEE trust.** Whoever can break or subpoena the vault learns identities. The audit log only detects access; it does not prevent it.
6. **Helius as prover.** The RPC provider generates the transfer proofs (per the docs). Find out what it learns.
   Delegated mode gives Helius view access to balances.
7. **Exit windows.** Withdrawals only happen during the 7-day post-vote window, so all exits cluster in time, which
   shrinks the set of investors an exit could belong to.
8. **The founder's vault unshield is public by design.** Milestone releases are visible amounts, which is intended.
9. **MockPrivacy is not private.** Its "ciphertexts" are plaintext. Never ship it outside dev or tests.

## What needs verification on devnet

- [ ] Whether the Helius package name is `@heliuslabs/spr` or `@heliuslabs/zolana`, and an end-to-end deposit, transfer and withdraw of devnet USDC (SPL path).
- [ ] Whether a program PDA can own a shielded balance (milestone escrow). If it cannot, the vault design changes.
- [ ] How to discover a wallet's UTXOs for `getEncryptedBalance` (indexer endpoint).
- [ ] Anonymous Custom Ring availability, its relayer, and its policy proof (a KYC allowlist would fit here).
- [ ] Arcis compile: `mxe: Mxe` / `owner: Shared` parameters, tuple returns, the cost of u128 secret division in `weighted_vote_tally`.
- [ ] Arcium callback, computation finalization, and gas/fee for each `cast_weighted_vote` (one computation per vote).
- [ ] How the Rings deposit amount gets bound to the `record_contribution` ciphertext. Today nothing proves they are equal. **This is a critical gap.**
      Options: the MXE decrypts the Rings note through a viewing key, or a ZK proof of equality between the note and the Arcium ciphertext.
- [ ] `nargo test --workspace` on all circuits, the choice of hash (Pedersen vs Poseidon2) and how it matches off-chain tree builders, and the choice of on-chain verifier.
- [ ] Denylist indexed-tree builder (sorted, with a 0 sentinel) in services/.

## Usage (local dev)

```ts
import { MockPrivacy } from "@harvestia/privacy";
const p = new MockPrivacy("alice");
const pos = await p.recordContribution("freshbox", await p.encryptAmount(25_000_000_000n));
const proof = await p.prove("vote_nullifier", { secret: "s", campaignId: "freshbox", milestoneIndex: 0, round: 0 });
await p.queueVote("freshbox", 0, pos, await p.encryptBallot(true), proof.publicInputs[1]!);
const result = await p.awaitTally(await p.queueTally("freshbox", 0)); // { yesBps, noBps, turnoutBps, quorumMet }
```

The real implementations (`HeliusRingsAdapter`, `ArciumMxeVoteClient`, `NoirZkProver`) take their SDK modules as injected
dependencies, so this package builds without them. Unimplemented paths throw `NotImplementedAdapterError`.
