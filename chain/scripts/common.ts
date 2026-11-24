import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

// deploy.sh exports CHAIN_DIR; fallback assumes cwd = chain/scripts.
export const CHAIN_DIR = process.env.CHAIN_DIR ?? path.resolve(process.cwd(), "..");

export function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`missing env ${name}`); process.exit(2); }
  return v;
}

export function loadKeypair(p: string): Keypair {
  // Reads the keypair file; never prints it.
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, "utf8"))));
}

export function setup() {
  const rpc = need("RPC_URL");
  const payer = loadKeypair(need("DEPLOYER_KEYPAIR"));
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync(path.join(CHAIN_DIR, "target/idl/harvestia.json"), "utf8"));
  const program = new anchor.Program(idl, provider);
  const company = new PublicKey(need("COMPANY_WALLET"));
  const usdcMint = new PublicKey(need("USDC_MINT"));
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
  return { connection, provider, payer, program, company, usdcMint, configPda };
}
