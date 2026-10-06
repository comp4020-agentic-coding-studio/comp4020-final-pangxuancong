import { defineConfig } from "vite";

// The browser game lives in src/client and builds to dist/client, which the
// server serves in production (docs/ARCHITECTURE.md).
export default defineConfig({
  root: "src/client",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    // Phaser alone is over a megabyte; one chunk is fine for one page
    chunkSizeWarningLimit: 2000,
  },
});
