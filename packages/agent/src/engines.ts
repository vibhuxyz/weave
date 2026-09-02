import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);

/**
 * An ACP engine: any process that speaks Agent Client Protocol over stdio.
 *
 * The whole point of ACP is that the client does not care which agent is on
 * the other end. Everything above this file — sessions, permissions, the
 * ledger, the runner, the UI — is engine-agnostic; this registry is the only
 * place an engine is named.
 *
 * Adding one is a row here plus the npm dependency. It is not a code change
 * anywhere else.
 */
export interface AcpEngine {
  /** Stable id used in configs, ledgers, and eval reports. */
  id: string;
  label: string;
  /** npm package that ships the ACP server. */
  packageName: string;
  /** Key in that package's `bin` map. */
  binName: string;
  /** Extra argv after the entry script. */
  args?: string[];
  /** Extra env for the child process. */
  env?: Record<string, string>;
  /** Shown when the package is not installed. */
  install?: string;
}

export const ENGINES: Record<string, AcpEngine> = {
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    packageName: "@agentclientprotocol/claude-agent-acp",
    binName: "claude-agent-acp",
    install: "pnpm -F @berd/agent add @agentclientprotocol/claude-agent-acp",
  },

  // Declared but not installed. Each is a real ACP server; adding one means
  // installing its package, not writing an adapter. Verify `binName` against
  // the package's own manifest before trusting it — that is exactly the
  // mistake that cost time with claude-agent-acp, whose exports["."] points at
  // the library while the ACP server is the bin.
  codex: {
    id: "codex",
    label: "Codex",
    packageName: "@zed-industries/codex-acp",
    binName: "codex-acp",
    install: "pnpm -F @berd/agent add @zed-industries/codex-acp",
  },
  amp: {
    id: "amp",
    label: "Amp",
    packageName: "@sourcegraph/amp",
    binName: "amp-acp",
    install: "pnpm -F @berd/agent add @sourcegraph/amp",
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    packageName: "@google/gemini-cli",
    binName: "gemini",
    args: ["--experimental-acp"],
    install: "pnpm -F @berd/agent add @google/gemini-cli",
  },
};

export const DEFAULT_ENGINE_ID = "claude-code";

export function getEngine(id: string = DEFAULT_ENGINE_ID): AcpEngine {
  const engine = ENGINES[id];
  if (!engine) {
    throw new Error(
      `Unknown engine "${id}". Known: ${Object.keys(ENGINES).join(", ")}`,
    );
  }
  return engine;
}

/**
 * Resolve an engine's executable entry from its own manifest.
 *
 * NOT `require.resolve(pkg)`: a package's `exports["."]` usually points at its
 * library entry, while the ACP server is the *bin*. Reading `bin[binName]` is
 * the only reliable way.
 */
export function resolveEngineEntry(engine: AcpEngine): string {
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${engine.packageName}/package.json`);
  } catch {
    throw new Error(
      `${engine.label} is not installed (${engine.packageName}).` +
        (engine.install ? `\n  ${engine.install}` : ""),
    );
  }

  const manifest = require(manifestPath) as { bin?: Record<string, string> | string };
  const bin = manifest.bin;
  const relative = typeof bin === "string" ? bin : bin?.[engine.binName];
  if (!relative) {
    throw new Error(
      `${engine.packageName} has no bin "${engine.binName}". ` +
        `Check its package.json — the ACP server may be published under a different name.`,
    );
  }
  return resolve(dirname(manifestPath), relative);
}

/** Engines whose package is actually present. */
export function installedEngines(): AcpEngine[] {
  return Object.values(ENGINES).filter((engine) => {
    try {
      resolveEngineEntry(engine);
      return true;
    } catch {
      return false;
    }
  });
}
