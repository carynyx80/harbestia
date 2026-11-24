import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";

if (existsSync(".env")) process.loadEnvFile(".env");

const { createApp, MOCK_PRIVACY_BANNER, HELIUS_PRIVACY_NOTE } = await import("./app.js");
const { redact } = await import("./config.js");

const port = Number(process.env.PORT ?? 8787);
let app, config;
try {
  ({ app, config } = createApp());
} catch (e) {
  console.error(`[harvestia-api] ${redact((e as Error).message, process.env.HELIUS_API_KEY)}`);
  process.exit(1);
}
const banner = config.privacyMode === "helius" ? `${HELIUS_PRIVACY_NOTE} (${config.cluster})` : MOCK_PRIVACY_BANNER;
const bar = "!".repeat(banner.length + 8);
console.warn(`\n${bar}\n!!! ${banner} !!!\n${bar}\n`);
serve({ fetch: app.fetch, port }, (info) => console.log(`harvestia-api listening on http://localhost:${info.port}`));
