// REHEARSAL ONLY: creates a 6-decimal mock USDC mint on localnet, prints its address.
import { createMint } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { loadKeypair, need } from "./common";

async function main() {
  const rpc = need("RPC_URL");
  if (!/127\.0\.0\.1|localhost/.test(rpc)) throw new Error("mock mint is for localnet only");
  const payer = loadKeypair(need("DEPLOYER_KEYPAIR"));
  const mint = await createMint(new Connection(rpc, "confirmed"), payer, payer.publicKey, null, 6);
  console.log(mint.toBase58());
}
main().catch((e) => { console.error(e); process.exit(1); });
