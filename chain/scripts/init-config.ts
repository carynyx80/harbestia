// Creates the company wallet's USDC ATA (payer = deployer) if missing, then
// calls initialize_config(admin = COMPANY, reviewer = COMPANY, fee_bps).
// The company wallet signs NOTHING here.
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { setup } from "./common";

async function main() {
  const { connection, payer, program, company, usdcMint, configPda } = setup();
  const reviewer = process.env.REVIEWER_WALLET ? new (require("@solana/web3.js").PublicKey)(process.env.REVIEWER_WALLET) : company;
  const feeBps = Number(process.env.FEE_BPS ?? "500");

  const mintInfo = await connection.getAccountInfo(usdcMint);
  if (!mintInfo) throw new Error(`USDC mint ${usdcMint.toBase58()} not found on this cluster`);
  const tokenProgram = mintInfo.owner; // classic SPL Token for USDC
  // allowOwnerOffCurve = true so a Squads vault (PDA) also works as COMPANY_WALLET.
  const treasury = getAssociatedTokenAddressSync(usdcMint, company, true, tokenProgram);

  if (!(await connection.getAccountInfo(treasury))) {
    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, treasury, company, usdcMint, tokenProgram),
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" });
    console.log(`created company USDC ATA ${treasury.toBase58()} (tx ${sig})`);
  } else {
    console.log(`company USDC ATA exists: ${treasury.toBase58()}`);
  }

  if (await connection.getAccountInfo(configPda)) {
    console.log(`config ${configPda.toBase58()} already initialized - skipping`);
    return;
  }
  const sig = await program.methods
    .initializeConfig(company, reviewer, feeBps)
    .accountsPartial({ payer: payer.publicKey, config: configPda, usdcMint, treasury })
    .rpc();
  console.log(`initialize_config ok: config=${configPda.toBase58()} admin=${company.toBase58()} reviewer=${reviewer.toBase58()} fee_bps=${feeBps} (tx ${sig})`);
}

main().catch((e) => { console.error(e); process.exit(1); });
