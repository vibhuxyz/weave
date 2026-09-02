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
      "@berd/protocol": here("../../packages/protocol/src/index.ts"),
      "@berd/agent": here("../../packages/agent/src/index.ts"),
      "@berd/core": here("../../packages/core/src/index.ts"),
    },
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
});
