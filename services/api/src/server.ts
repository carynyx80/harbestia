import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";

if (existsSync(".env")) process.loadEnvFile(".env");

const { createApp, MOCK_PRIVACY_BANNER } = await import("./app.js");

const bar = "!".repeat(MOCK_PRIVACY_BANNER.length + 8);
console.warn(`\n${bar}\n!!! ${MOCK_PRIVACY_BANNER} !!!\n${bar}\n`);

const port = Number(process.env.PORT ?? 8787);
let app;
try {
  ({ app } = createApp());
} catch (e) {
  console.error(`[harvestia-api] ${(e as Error).message}`);
  process.exit(1);
}
serve({ fetch: app.fetch, port }, (info) => console.log(`harvestia-api listening on http://localhost:${info.port}`));
