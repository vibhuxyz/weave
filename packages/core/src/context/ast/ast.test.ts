import test from "node:test";
import assert from "node:assert/strict";
import { parseModule } from "./parse-module.ts";

const SOURCE = `
import express from "express";
import { PayoutService, type Payout } from "../payouts/payout.service";
import * as db from "@/db";
export { formatMoney } from "./money";

const router = express.Router();

export class SellerPayoutController {
  async create(req: unknown) {
    const service = new PayoutService();
    bus.emit("payout.requested", req);
    return service.schedulePayout(req);
  }
}

export const listPayouts = async () => db.query("select 1");

router.post("/v1/sellers/:id/payouts", controller.create);
router.get("/v1/sellers/:id/payouts", listPayouts);
bus.on("payout.settled", () => undefined);

export const ENDPOINTS = { createPayout: { id: "createPayout", method: "POST", path: "/v1/sellers/:id/payouts" } };
function hidden() { return import("./lazy"); }
`;

test("a module yields symbols, imports, calls, routes, contracts and events", () => {
  const facts = parseModule("apps/api/src/sellers/payout.routes.ts", SOURCE);
  const symbols = facts.symbols.map((symbol) => [symbol.name, symbol.kind, symbol.isExported]);
  assert.deepEqual(symbols, [
    ["router", "variable", false],
    ["SellerPayoutController", "class", true],
    ["SellerPayoutController.create", "function", true],
    ["listPayouts", "function", true],
    ["ENDPOINTS", "variable", true],
    ["hidden", "function", false],
  ]);
  assert.deepEqual(facts.imports.map((fact) => fact.specifier), ["express", "../payouts/payout.service", "@/db", "./money", "./lazy"]);
  assert.deepEqual(facts.imports[1]?.bindings, [{ local: "PayoutService", imported: "PayoutService" }, { local: "Payout", imported: "Payout" }]);
  assert.ok(facts.calls.some((call) => call.callee === "service.schedulePayout" && call.caller === "SellerPayoutController.create"));
  assert.ok(facts.calls.some((call) => call.callee === "db.query" && call.caller === "listPayouts"));
  assert.deepEqual(facts.apis.map((api) => [api.source, api.method, api.path, api.handler]), [
    ["route", "POST", "/v1/sellers/:id/payouts", "controller.create"],
    ["route", "GET", "/v1/sellers/:id/payouts", "listPayouts"],
    ["contract", "POST", "/v1/sellers/:id/payouts", "createPayout"],
  ]);
  assert.deepEqual(facts.events.map((event) => [event.role, event.name]), [["emit", "payout.requested"], ["listen", "payout.settled"]]);
});

test("a Next.js route file becomes an API per exported verb", () => {
  const facts = parseModule("apps/web/app/(shop)/api/payouts/[id]/route.ts", "export async function GET() {}\nexport async function POST() {}\n");
  assert.deepEqual(facts.apis.map((api) => [api.method, api.path]), [["GET", "/api/payouts/[id]"], ["POST", "/api/payouts/[id]"]]);
});
