// Browser-only Helius Privacy Rings deposit (shield) flow, built on @heliuslabs/spr.
// Amounts are hidden inside the pool; the depositing wallet and the deposit amount
// are PUBLIC on the deposit transaction itself (Rings hide balances, not addresses).
// No API keys here: the RPC URL comes from NEXT_PUBLIC_SOLANA_RPC_URL or GET /config.

import type { PublicKey, VersionedTransaction as VersionedTransactionT } from "@solana/web3.js";
import type { Transaction as KitTransaction } from "@solana/kit";

export type DepositStep = "register" | "build" | "sign" | "confirm" | "record";

export interface WalletBridge {
  publicKey: PublicKey;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  /** Wallet signs and submits; returns the base58 signature. */
  sendTransaction: (tx: VersionedTransactionT) => Promise<string>;
}

export interface HeliusDepositInput {
  wallet: WalletBridge;
  rpcUrl: string;
  /** Asset mint to shield (USDC on the selected cluster). */
  mint: string;
  /** Base units (USDC has 6 decimals). */
  amount: bigint;
  onStep: (s: DepositStep) => void;
}

/** Circle's devnet USDC; override with NEXT_PUBLIC_USDC_MINT. */
export const DEPOSIT_MINT = process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;

export function usdcToBaseUnits(usd: number): bigint {
  return BigInt(Math.round(usd * 10 ** USDC_DECIMALS));
}

async function toWeb3Tx(tx: KitTransaction): Promise<VersionedTransactionT> {
  const [{ getTransactionEncoder }, { VersionedTransaction }] = await Promise.all([
    import("@solana/kit"),
    import("@solana/web3.js"),
  ]);
  const bytes = getTransactionEncoder().encode(tx);
  return VersionedTransaction.deserialize(new Uint8Array(bytes));
}

/**
 * 1. Derive the shielded identity from a wallet signature over the SDK's derivation message.
 * 2. Register it in the user registry if this wallet has no record yet (one-time onboarding).
 * 3. Build the encrypted deposit with buildDepositTransaction, wallet signs + sends.
 * 4. Wait for confirmation. Returns the deposit signature.
 */
export async function heliusShieldDeposit({ wallet, rpcUrl, mint, amount, onStep }: HeliusDepositInput): Promise<{ txSignature: string; shieldedOwnerHash: string }> {
  const [spr, sprWallet, sprKeypair, kit] = await Promise.all([
    import("@heliuslabs/spr"),
    import("@heliuslabs/spr/wallet"),
    import("@heliuslabs/spr/keypair"),
    import("@solana/kit"),
  ]);

  onStep("register");
  const owner = kit.address(wallet.publicKey.toBase58());
  const client = await spr.createSprClient({ solanaRpcUrl: rpcUrl, commitment: "confirmed" });

  const message = sprKeypair.ed25519DerivationMessage(sprKeypair.bytes32(wallet.publicKey.toBytes()));
  const derivationSeed = await wallet.signMessage(message);
  const keys = spr.LocalShieldedKeys.fromDerivationSeed({ solanaPublicKey: owner, derivationSeed });
  try {
    const shielded = keys.address();

    const registered = await sprWallet.isWalletRegistered({ rpc: client, owner });
    if (!registered) {
      const regTx = await sprWallet.buildRegistrationTransaction({ client, owner, address: shielded, payer: owner });
      if (regTx) {
        const sig = await wallet.sendTransaction(await toWeb3Tx(regTx));
        await client.confirmTransaction(kit.signature(sig));
      }
    }

    onStep("build");
    const depositTx = await spr.buildDepositTransaction({
      client,
      feePayer: owner,
      depositor: owner,
      recipient: shielded,
      asset: kit.address(mint),
      amount,
    });

    onStep("sign");
    const txSignature = await wallet.sendTransaction(await toWeb3Tx(depositTx));

    onStep("confirm");
    await client.confirmTransaction(kit.signature(txSignature));

    const ownerHash = Array.from(shielded.ownerHash() as Uint8Array, (b) => b.toString(16).padStart(2, "0")).join("");
    return { txSignature, shieldedOwnerHash: ownerHash };
  } finally {
    keys.destroy();
  }
}
