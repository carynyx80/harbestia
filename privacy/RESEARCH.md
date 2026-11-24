# Privacy layer research notes (2026-11-24)

About 5 minutes of reading. Everything below comes from the URL next to it. Anything marked
**UNVERIFIED** is something we inferred or remembered and must be checked before devnet.

## Helius Privacy (Solana Privacy Rings, "SPR" / "zolana")

Sources:
- https://www.helius.dev/docs/privacy/llms.txt
- https://www.helius.dev/docs/privacy/concepts.md
- https://www.helius.dev/docs/privacy/sdk.md
- https://www.helius.dev/docs/privacy/guides/deposit.md
- https://www.helius.dev/docs/privacy/guides/transfer.md
- Examples: https://github.com/helius-labs/zolana-examples (`typescript-client/examples/deposit_transfer_withdraw.ts`)

Facts:
- Status: **beta, devnet only**. Mainnet is not launched and the programs are under audit.
- Packages: the SDK page names `@heliuslabs/spr@^0.9.0-alpha`, used with `@solana/kit@^8.3.0`, and a
  subpath `@heliuslabs/spr/interface`. llms.txt instead names `@heliuslabs/zolana`.
  **Open question:** which package name is current? We built the adapter against `@heliuslabs/spr`.
- Rust crates: `zolana-client`, `zolana-interface`, `zolana-keypair`, `zolana-transaction`. CLI: `zolana dev start` (localnet).
- Operations: deposit (public to private), transfer (private to private), withdraw (private to public),
  read balance, read history. Private balances are UTXOs ("Private Solana Token Accounts").
- Client: `createSprClient({ solanaRpcUrl })` and `ShieldedKeypair.fromKeypair(kp)`, which provides
  `.toSolanaSigner()` and `.shieldedAddress()`. The shielded address provides `.confidentialViewTag()` and `.ownerHash()`.
- Deposit: `depositInstruction({ tree: client.tree, depositor, deposits: [{ asset, viewTag, recipientOwnerHash, amount }] })`.
  The asset is `DepositAsset.sol()` or `DepositAsset.spl({ mint, sourceTokenAccount, tokenProgram })`.
- Transfer: `ProofInputUtxo.fromKeypair`, then `new ConfidentialTransfer(senderAddr, inputs, payer)`, then
  `.send(recipient, mint, amt)`, then `.sign(sender, assets)`, then
  `client.proveTransact(inputs, LocalKeys.fromKeypair(sender, client.proofService))`, then
  `transactInstruction({ payer, ownerSigners, inputTree, outputTree, data })`. **The RPC provider generates the ZK proof.**
- Withdraw: the same transact path with `.withdraw(mint, amt, WithdrawalTarget.sol({recipient}))` and `TransactWithdrawal`.
- Balance: `client.getShieldedTransactionsBySignature(sig, atSlot(slot))`, then
  `decryptToBalances({ keypair, registry, transactions })`, then `.balance(mint)`. No owner-wide scan is documented.
- Ring types:
  - The **Default Ring** is confidential and permissionless. It hides the asset and amount but **sender and recipient addresses are public**.
  - **Custom Rings** can be anonymous, which also hides sender and recipient. They are relayer-submitted and add policy
    (allowlists, limits, freeze, auditor). The Custom Ring program ID is public.
- All rings currently share **one state Merkle tree**. That is good for the anonymity set.
- Public deposits and withdrawals reveal the wallet and amount. Memos on deposits are public.
- A transfer to a recipient without a Private Wallet becomes a withdrawal, so the UI must label it that way.
- Delegated mode shares a viewing key with the provider, which then sees balances and history (view only).
- The pages we read do not mention a TEE.

Open questions:
1. How exactly to build the asset `registry` and pick UTXOs for transfers.
2. Is there an indexer endpoint to list a wallet's UTXOs? (See endpoints.md, which we have not read.)
3. Can a PDA-owned or program-controlled vault hold a shielded balance? Milestone escrow needs this. The docs only show keypair owners.
4. What does onboarding to an anonymous Custom Ring cost, and what are its policy-proof requirements?
5. Which package name is current: `spr` or `zolana`?

## Arcium (MPC, Arcis)

Sources:
- https://docs.arcium.com/developers/arcis
- https://docs.arcium.com/developers/arcis/quick-reference
- https://docs.arcium.com/developers/js-client-library
- https://docs.arcium.com/developers/js-client-library/encryption.md
- API reference: https://ts.arcium.com/api (not read)

Facts:
- `#[encrypted] mod` contains circuits. `#[instruction] pub fn` marks an entry point callable from Solana.
- `Enc<Shared, T>`: the client and the MXE can decrypt. `Enc<Mxe, T>`: only the MXE can decrypt.
  Use `x.to_arcis()` to convert to secret shares, `x.owner.from_arcis(v)` to convert back, and `v.reveal()` to make a value public.
- Control flow: `if/else` and `match` work, and **both branches execute** on a secret condition. `for` loops
  need fixed bounds. There is no `while`, `loop`, `break`, or early `return`.
- Types: integers up to u128, emulated fixed-point floats, `BaseField25519`, fixed arrays (a secret index costs O(n)),
  tuples, and `#[derive(Copy, Clone)]` structs. There is no Vec, String, or HashMap.
  Enums and Option are allowed internally but not in encrypted inputs or outputs.
- TS client `@arcium-hq/client`: `x25519.utils.randomSecretKey()`, `x25519.getPublicKey(sk)`,
  `x25519.getSharedSecret(sk, mxePublicKey)`, `new RescueCipher(shared)`, `.encrypt(plaintext, nonce16)`,
  `.decrypt(ct, nonce)`, and `getMXEPublicKeyWithRetry(provider, programId)`. Other packages: `claimComputationRent`,
  `@arcium-hq/reader` (`getComputationFee`), and `@arcium-hq/staking`.

UNVERIFIED (from memory of Arcium examples, not confirmed in pages we read):
- Creating fresh ciphertexts with `mxe: Mxe` / `owner: Shared` parameters and `mxe.from_arcis(..)`.
- Returning tuples of `Enc<..>` and of revealed values from a single instruction.
- The cost and support of secret/secret `u128` division. `weighted_vote_tally` uses it; there is a fallback noted in the code.
- The `awaitComputationFinalization` and `getComputationAccAddress` names and the `queue_computation` Anchor macro flow.

## Noir (ZK)

We fetched no docs, because the time budget was spent on Helius and Arcium. Circuits use `std::hash::pedersen_hash`,
`Field::to_le_bits`, and `Field::lt`. These are UNVERIFIED against the current nargo. Before compiling, run
`nargo --version` and check the std API. Poseidon moved out of std in recent Noir versions, which is why we chose Pedersen.
The choice of on-chain verifier is open (options include a Solana groth16 or UltraHonk verifier, or verifying inside Arcium).
