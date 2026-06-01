import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@katrekat/game-core": fileURLToPath(new URL("../shared/game-core/src/index.ts", import.meta.url))
    }
  }
});
