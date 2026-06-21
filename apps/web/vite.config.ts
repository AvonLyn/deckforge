import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@deckforge/deck-ir": r("../../packages/deck-ir/src/index.ts")
    }
  },
  server: {
    port: 5173,
    host: "127.0.0.1"
  }
});
