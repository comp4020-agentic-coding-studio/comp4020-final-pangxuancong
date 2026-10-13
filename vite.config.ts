import { defineConfig } from "vite";

// The browser game lives in src/client and builds to dist/client, which the
// server serves in production (docs/ARCHITECTURE.md): the lobby (index.html)
// and a room (room.html, served at /r/CODE).
export default defineConfig({
  root: "src/client",
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
    rollupOptions: { input: { index: "src/client/index.html", room: "src/client/room.html" } },
    // Phaser alone is over a megabyte; one chunk is fine for one page
    chunkSizeWarningLimit: 2000,
  },
});
