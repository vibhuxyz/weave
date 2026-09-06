/**
 * Bundle the ACP WebSocket server into one file the `.app` can ship.
 *
 * Why this exists: in dev the Tauri shell runs `server/index.ts` straight out
 * of the workspace with `node --experimental-strip-types`. A packaged app has
 * neither — no `packages/`, no `node_modules`, and no guarantee the user's
 * node is new enough for type stripping. So the server becomes one plain ESM
 * file with its dependencies inlined, and the only runtime requirement drops
 * from "node 22.6+ inside our pnpm workspace" to "any node 18+".
 *
 * What is deliberately NOT inlined: the ACP engines. `resolveEngineEntry`
 * finds them at runtime through `createRequire`, which esbuild cannot see and
 * must not try to follow — they are separate processes installed into the
 * app's data directory, not libraries of this one.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const outfile = join(desktop, "src-tauri", "resources", "server.mjs");

const result = await build({
  entryPoints: [join(desktop, "server", "index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  // Match the floor in the root manifest's `engines.node`, minus the type
  // stripping we no longer need. Anything older than this is not supported.
  target: "node18",
  sourcemap: true,
  // `ws` reaches for these two native accelerators and works fine without
  // them. Bundling them would pull a compiler into the build for no gain.
  external: ["bufferutil", "utf-8-validate"],
  logLevel: "info",
  metafile: true,
  banner: {
    // Some bundled deps call `require` / `__dirname` even in ESM. Give them
    // real ones anchored at this file rather than letting them throw.
    js: [
      "import { createRequire as __weaveCreateRequire } from 'node:module';",
      "import { fileURLToPath as __weaveFileURLToPath } from 'node:url';",
      "import { dirname as __weaveDirname } from 'node:path';",
      "const require = __weaveCreateRequire(import.meta.url);",
      "const __filename = __weaveFileURLToPath(import.meta.url);",
      "const __dirname = __weaveDirname(__filename);",
    ].join("\n"),
  },
});

const bytes = Object.values(result.metafile.outputs).reduce(
  (total, output) => total + output.bytes,
  0,
);
console.log(`[bundle-server] ${outfile} — ${(bytes / 1024).toFixed(0)} KB`);
