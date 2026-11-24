# Helius Privacy Rings adapter (`privacy/ts/src/helius.ts`)

Built against **`@heliuslabs/spr@0.9.0-alpha`** and **`@solana/kit@8.6.0`**. Every SDK name below was checked
against the installed `.d.ts` files and also resolved at runtime. The adapter uses the SDK's high-level
`build*Transaction` builders, which handle UTXO selection, the asset registry and proving. It does not use the
low-level `depositInstruction`/`ConfidentialTransfer` path from the guides.

## Exports

| Export | Signature | SDK calls used |
|---|---|---|
| `HELIUS_RINGS_PROGRAM_IDS` | `Record<"mainnet"\|"devnet", { shieldedPool, userRegistry }>` | Matches the SDK's `SHIELDED_POOL_PROGRAM_ID` and `USER_REGISTRY_PROGRAM_ID` (the same on both clusters) |
| `loadHeliusSdk()` | `() => Promise<HeliusSdk>` | Dynamic `import("@heliuslabs/spr")`, `"@heliuslabs/spr/keypair"`, `"@solana/kit"` |
| `serverSigner(keyPair, sdk?, signMessage?)` | `(CryptoKeyPair, ...) => Promise<RingsSigner>` | kit `getAddressFromPublicKey`, `partiallySignTransaction`; WebCrypto Ed25519 sign |
| `derivationMessage(address, sdk?)` | `(string) => Promise<Uint8Array>` | `ed25519DerivationMessage` (off-chain msg v0, payload `"TSPP/derive/v1"`) |
| `new HeliusRingsAdapter({ cluster, rpcUrl, signer, derivationSeed?, sdk? })` | | `createSprClient({ solanaRpcUrl })` |
| `.shieldedAddress()` | `() => Promise<string>` (hex of `ShieldedAddress.toBytes()`) | `LocalKeys.fromDerivationSeed({ solanaPublicKey, derivationSeed }, client.proofService)` |
| `.buildRegisterTxs()` | `() => Promise<Transaction[]>` (UNSIGNED; `[]` if already registered) | `buildRegistrationTransaction`, `buildSetMergeEncryptionTransaction({ scheme: MergeEncryptionScheme.PoseidonCtrV1 })` |
| `.buildShieldTx(p: ShieldParams)` | `=> Promise<Transaction>` (UNSIGNED) | `buildDepositTransaction({ client, feePayer, depositor, recipient, asset, amount, splTokenAccount?, memo? })` |
| `.buildPrivateTransferTx(p)` | `=> Promise<Transaction>` (UNSIGNED, already proven) | `syncWallet`, then `buildTransferTransaction({ client, wallet, keys, feePayer, recipient, asset, amount })` |
| `.buildUnshieldTx(p)` | `=> Promise<Transaction>` (UNSIGNED) | `syncWallet`, then `buildWithdrawalTransaction({ ..., recipient, asset, amount })` |
| `.signAndSend(tx)` | `=> Promise<TxResult>` | `signer.signTransaction`, kit `getBase64EncodedWireTransaction`, `client.solanaRpc.sendTransaction(..., {encoding:"base64"})`, `client.confirmTransaction` (returns the slot) |
| `.register()`, `.shield()`, `.privateTransfer()`, `.unshield()` | `RingsAdapter` methods: build, then `signAndSend` | as above |
| `.getEncryptedBalance(owner, mint)` | `=> Promise<EncryptedBalance>` | `new Wallet({ identity })`, `syncWallet`, `getPrivateTokenBalances(wallet)` |
| `withRetry(fn, rpcUrl?, attempts=3)` | Retries transient network errors and scrubs the RPC URL / `api-key=` out of error text | none |

The builders return a compiled `@solana/kit` `Transaction` with empty signatures. The browser flow is:
build, then the wallet signs (`signTransaction`), then the app sends it. On a server, use `serverSigner(keyPair)`
with `signAndSend`. Mints are base58 strings. `"SOL"` maps to the SDK's `SOL_MINT`
(`11111111111111111111111111111111`). For a recipient, pass either a registered Solana address (the SDK resolves
it through the user registry) or a shielded-address hex string from `.shieldedAddress()`.

## Onboarding and required accounts
1. **Derive the shielded keys.** The wallet signs `derivationMessage(address)` once. The 64-byte signature is the
   seed. It is SECRET: anyone holding it can decrypt the wallet's history. Never persist it unencrypted, and never
   sign that message for a third-party site.
2. **Register.** `buildRegisterTxs()` creates the user-registry PDA (nullifier and viewing public keys) under
   `regy3W...` and sets merge encryption. The owner pays rent. This step is needed for others to send to this
   Solana address. Without it, the SDK turns a transfer to that address into a public withdrawal. Deposits do not
   require registration.
3. **SPL tokens.** Pass `splTokenAccount` (the depositor's ATA). `buildDepositTransaction` prepends the mint's
   interface/vault creation when it is missing (`createSplInterface` defaults to true).
4. **Fees.** The fee payer is the signer. Proving runs on the Helius prover behind `rpcUrl`, so proof inputs
   (plaintext UTXO data) reach Helius.

## Hidden vs visible (default ring)
- **Hidden:** private balances and amounts inside transfers, and change amounts.
- **Visible:** sender and recipient addresses on transfers (the default ring is confidential, not anonymous);
  deposit wallet, mint and amount; withdrawal recipient, mint and amount; deposit memos (`publicMemo`).
- Anonymous Custom Rings are not live yet. The SDK has `proveAnonymousRingTransact`, but the adapter does not use it.

## Devnet test steps
1. Get a Helius devnet RPC URL and keep it in an env var only. Fund a devnet keypair with SOL.
2. Create the signer: `serverSigner(await createKeyPairFromBytes(secret))` from kit, then
   `new HeliusRingsAdapter({ cluster: "devnet", rpcUrl: process.env.HELIUS_RPC!, signer })`.
3. Run `await a.register()`.
4. Run `await a.shield({ from: signer.address, mint: "SOL", amount: 10_000_000n })`.
5. Check `await a.getEncryptedBalance(signer.address, "SOL")`. Expect `amount` 10_000_000n.
6. Run a second registered wallet B, then `a.privateTransfer({ mint: "SOL", amount: 1_000_000n, toShieldedAddress: B.address })`.
   Then `b.getEncryptedBalance(...)`.
7. Run `a.unshield({ mint: "SOL", amount: 1_000_000n, to: signer.address })`.

This sequence has **not been run against devnet yet**. Only mocked unit tests and a module-load check were run.

## Open questions
- `buildTransferTransaction` has no memo field, so `privateTransfer({ memo })` throws `NotImplementedAdapterError`.
  Harvestia needs another channel for campaign IDs and position commitments.
- Program-owned vaults: the SDK has `ShieldedAddress.forPda` and a `program/` export (`shielded-pda`,
  `program-transaction`). Milestone escrow could use these, but we have not explored them.
- Balances need a full `syncWallet` on every call. In-memory wallet state is cached per adapter instance. For
  persistence, use `loadPersistedWallet`/`syncPersistedWallet`, which are not wired up yet.
- UTXO count limit: a transfer fails with `WALLET_TOO_MANY_INPUTS` above the input limit. In that case, call
  `buildMergeTransaction` first (not wrapped).
- Concurrency: two first-time SPL deposits of the same mint built in parallel will collide (SDK doc note).
- llms.txt names `@heliuslabs/zolana`, but the published and installed package is `@heliuslabs/spr`.
