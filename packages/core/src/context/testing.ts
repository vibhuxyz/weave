import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runGit } from "../worktree/index.ts";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export const MARKETPLACE: Readonly<Record<string, string>> = {
  "package.json": json({ name: "shop", private: true, workspaces: ["apps/*", "packages/*"] }),
  "apps/api/package.json": json({ name: "api", scripts: { dev: "tsx src/server.ts", test: "node --test", typecheck: "tsc --noEmit" }, dependencies: { express: "^4", "@shop/contracts": "*", "@shop/ledger": "*" } }),
  "apps/api/tsconfig.json": json({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["src/*"] } } }),
  "apps/api/src/server.ts": `import express from "express";\nimport { payoutRouter } from "@/payouts/payout.routes";\nimport { orderRouter } from "./orders/order.routes";\nexport const app = express();\napp.use(payoutRouter);\napp.use(orderRouter);\n`,
  "apps/api/src/payouts/payout.routes.ts": `import { Router } from "express";\nimport { SellerPayoutService } from "./payout.service";\nexport const payoutRouter = Router();\nconst service = new SellerPayoutService();\npayoutRouter.post("/v1/sellers/:sellerId/payouts", createSellerPayout);\npayoutRouter.get("/v1/sellers/:sellerId/payouts", listSellerPayouts);\nexport async function createSellerPayout(req: unknown) { return service.createPayout(req); }\nexport async function listSellerPayouts() { return []; }\n`,
  "apps/api/src/payouts/payout.service.ts": `import { recordPayout } from "@shop/ledger";\nimport { findSeller } from "../sellers/seller.repo";\nexport class SellerPayoutService {\n  async createPayout(input: unknown) {\n    const seller = await findSeller(input);\n    bus.emit("payout.created", seller);\n    return recordPayout(seller);\n  }\n}\n`,
  "apps/api/src/payouts/payout.service.test.ts": `import { SellerPayoutService } from "./payout.service";\nnew SellerPayoutService();\n`,
  "apps/api/src/sellers/seller.repo.ts": `export async function findSeller(input: unknown) { return input; }\n`,
  "apps/api/src/orders/order.routes.ts": `import { Router } from "express";\nexport const orderRouter = Router();\norderRouter.get("/v1/orders", listOrders);\nexport function listOrders() { return []; }\n`,
  "apps/web/package.json": json({ name: "web", scripts: { dev: "vite", build: "vite build" }, dependencies: { react: "^19" } }),
  "apps/web/src/pages/OrdersPage.tsx": `export function OrdersPage() { return null; }\n`,
  "packages/contracts/package.json": json({ name: "@shop/contracts", exports: { ".": "./src/index.ts" } }),
  "packages/contracts/src/index.ts": `export const ENDPOINTS = {\n  createSellerPayout: { id: "createSellerPayout", method: "POST", path: "/v1/sellers/:sellerId/payouts" },\n  listOrders: { id: "listOrders", method: "GET", path: "/v1/orders" },\n};\n`,
  "packages/ledger/package.json": json({ name: "@shop/ledger", main: "src/index.ts" }),
  "packages/ledger/src/index.ts": `export function recordPayout(entry: unknown) { return entry; }\n`,
};

async function commitAll(root: string, message: string): Promise<void> {
  await runGit(root, ["add", "-A"]);
  await runGit(root, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", message]);
}

async function writeFiles(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

export async function marketplaceRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "weave-context-"));
  await runGit(root, ["init", "--quiet", "--initial-branch=main"]);
  await writeFiles(root, { ".gitignore": ".weave/\n", ...MARKETPLACE });
  await commitAll(root, "Initial marketplace");
  const service = MARKETPLACE["apps/api/src/payouts/payout.service.ts"] ?? "";
  await writeFiles(root, { "apps/api/src/payouts/payout.service.ts": `${service}export const PAYOUT_FEE_PERCENT = 2;\n` });
  await commitAll(root, "Add payout fees");
  return root;
}
