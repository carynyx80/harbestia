import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // @heliuslabs/spr -> @lightprotocol/hasher.rs: its ESM build has a dead-code
    // `new URL("hasher_wasm_simd_bg.wasm", import.meta.url)` Turbopack can't resolve.
    // The CJS "fat" build inlines the same wasm, so use it instead.
    resolveAlias: {
      "@lightprotocol/hasher.rs": "./node_modules/@lightprotocol/hasher.rs/dist/browser-fat/cjs/index_browser_fat.cjs",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
