import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";

if (existsSync(".env")) process.loadEnvFile(".env");

const { createVaultApp } = await import("./app.js");

const port = Number(process.env.PORT ?? 8788);
let app;
try {
  ({ app } = createVaultApp());
} catch (e) {
  console.error(`[tee-vault] ${(e as Error).message}`);
  process.exit(1);
}
if (process.env.NITRO_ENCLAVE !== "1") console.warn("[tee-vault] running LOCALLY and UNATTESTED - do not store real KYC data");
serve({ fetch: app.fetch, port }, (info) => console.log(`harvestia-tee-vault listening on http://localhost:${info.port}`));
