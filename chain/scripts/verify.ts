// Read-only check of the on-chain Config against COMPANY_WALLET / USDC_MINT.
import { getAccount } from "@solana/spl-token";
import { setup } from "./common";

async function main() {
  const { connection, program, company, usdcMint, configPda } = setup();
  const cfg: any = await (program.account as any).config.fetch(configPda);
  const mintInfo = await connection.getAccountInfo(usdcMint);
  const ta = await getAccount(connection, cfg.treasury, "confirmed", mintInfo!.owner);
  const rows: [string, string, string][] = [
    ["config.admin", cfg.admin.toBase58(), company.toBase58()],
    ["config.reviewer", cfg.reviewer.toBase58(), company.toBase58()],
    ["config.usdc_mint", cfg.usdcMint.toBase58(), usdcMint.toBase58()],
    ["treasury.owner", ta.owner.toBase58(), company.toBase58()],
    ["treasury.mint", ta.mint.toBase58(), usdcMint.toBase58()],
  ];
  let ok = true;
  console.log(`config PDA ${configPda.toBase58()}  treasury ${cfg.treasury.toBase58()}  fee_bps ${cfg.feeBps}`);
  for (const [k, got, want] of rows) {
    const pass = got === want; ok &&= pass;
    console.log(`${pass ? "OK  " : "FAIL"} ${k} = ${got}${pass ? "" : ` (expected ${want})`}`);
  }
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
