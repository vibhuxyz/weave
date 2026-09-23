import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Same "@/" alias Berd uses, so the 230 copied files keep their imports.
      "@": here("./src"),
      // Workspace packages resolve to source — no build step between them.
      "@weave/protocol": here("../../packages/protocol/src/index.ts"),
      "@weave/agent": here("../../packages/agent/src"),
      "@weave/core": here("../../packages/core/src"),
    },
  },
  optimizeDeps: {
    entries: ["index.html", "src/**/*.{ts,tsx}"],
  },
  server: {
    port: 5180,
    strictPort: true,
    watch: {
      // reference/ is 1,822 files of Berd source kept only for copying from.
      // Watching it slows dev-server startup for no benefit, and would get
      // worse with every package added.
      ignored: ["**/reference/**", "**/.berd/**", "**/src-tauri/target/**"],
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
});
