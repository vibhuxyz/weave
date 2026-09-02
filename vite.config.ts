import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same "@/" alias Berd uses, so anything copied out of berd/src/ keeps
    // working with its original import paths.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
