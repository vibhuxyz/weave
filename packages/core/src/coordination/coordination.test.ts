import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CoordinationEvent, TaskContract } from "@weave/protocol";
import { Ledger, readLedger } from "../shared/index.ts";
import { Coordinator } from "./coordinator/index.ts";
import { latestByOutput } from "./coordinator/artifact-index.ts";
import { nextStep } from "../scheduler/index.ts";
import { renderAwaited } from "./employee/index.ts";
import { EventBlockExtractor, parseEmployeeEvent, renderInbox } from "./employee/index.ts";
import { OwnershipRegistry, claimsForTask, resourcesOverlap } from "./ownership/index.ts";

const task = (id: string, extra: Partial<TaskContract> = {}): TaskContract => ({ id, prompt: id, cwd: "", ...extra });
const artifact = (name: string, content = "x", provides: readonly string[] = []) => ({ name, summary: `${name} ready`, provides, files: [{ path: `${name}.txt`, content }] });

async function coordinatorFor(tasks: readonly TaskContract[]): Promise<{ coordinator: Coordinator; weaveDir: string }> {
  const weaveDir = join(await mkdtemp(join(tmpdir(), "weave-coord-")), ".weave");
  const ledger = new Ledger(weaveDir, "run1");
  return { coordinator: new Coordinator({ tasks, ledger, now: () => new Date("2026-01-01T00:00:00Z") }), weaveDir };
}

const typesOf = (events: readonly CoordinationEvent[]) => events.map((event) => event.type);

function dependencyReadyIn(events: readonly CoordinationEvent[]) {
  const found = events.find((event) => event.type === "dependency.ready");
  if (found?.type !== "dependency.ready") throw new Error("no dependency.ready event in the inbox");
  return found.data;
}

test("workers that need outputs from another worker all start at once, and its contract reaches them", async () => {
  const tasks = [
    task("T1"),
    task("T2", { dependencies: [{ task: "T1", requiredOutputs: ["Todo", "CreateTodoInput"] }] }),
    task("T3", { dependencies: [{ task: "T1", requiredOutputs: ["Todo", "API_ROUTES"] }] }),
  ];
  const { coordinator } = await coordinatorFor(tasks);
  assert.deepEqual(nextStep(tasks, new Map()).ready, ["T1", "T2", "T3"]);

  const published = coordinator.channelFor("T1").publish({
    type: "contract.published",
    data: { artifact: artifact("todo-api-contract", "x", ["Todo", "CreateTodoInput"]) },
  });
  assert.ok(published.ok, published.ok ? "" : published.reason);
  assert.deepEqual(typesOf(coordinator.channelFor("T2").drain().events), ["contract.published"]);
  assert.deepEqual(typesOf(coordinator.channelFor("T3").drain().events), ["contract.published"], "T3 needs Todo too, so the contract that carries it reaches T3 as well");

  const unrelated = coordinator.channelFor("T1").publish({ type: "artifact.ready", data: { artifact: artifact("internal-notes", "x", ["scratch"]) } });
  assert.ok(unrelated.ok, unrelated.ok ? "" : unrelated.reason);
  assert.deepEqual(coordinator.channelFor("T2").drain().events, [], "an output nobody asked for is not delivered");
});

test("a late starter is told which inputs exist, and gets them, and which are still being built", async () => {
  const { coordinator } = await coordinatorFor([
    task("T1", { produces: ["api-dev-server", "api-client"] }),
    task("T2", { dependencies: [{ task: "T1", requiredOutputs: ["api-dev-server", "api-client"] }] }),
  ]);
  const published = coordinator.channelFor("T1").publish({
    type: "artifact.ready",
    data: { artifact: artifact("api-dev-server", "http://localhost:3000") },
  });
  assert.ok(published.ok, published.ok ? "" : published.reason);

  coordinator.taskStarted("T2");
  const inbox = coordinator.channelFor("T2").drain();
  const ready = dependencyReadyIn(inbox.events);
  assert.deepEqual(ready.outputs, ["api-dev-server"]);
  assert.deepEqual(ready.pending, ["api-client"]);
  const delivered = inbox.events.filter((event) => event.type === "artifact.ready");
  assert.equal(delivered.length, 1, "the published artifact is delivered, not just named");
  assert.match(renderInbox(inbox), /http:\/\/localhost:3000/);
});

test("a worker is told which outputs its dependents are blocked on", async () => {
  const { coordinator } = await coordinatorFor([
    task("T1"),
    task("T2", { dependencies: [{ task: "T1", requiredOutputs: ["Todo"] }] }),
  ]);
  const brief = renderAwaited(coordinator.channelFor("T1").awaited());
  assert.match(brief, /T2 needs: Todo/);
  assert.equal(renderAwaited(coordinator.channelFor("T2").awaited()), "");
});

test("ownership overlaps by containment for paths and symbols, exactly for named resources", () => {
  assert.ok(resourcesOverlap({ kind: "directory", id: "src/api" }, { kind: "file", id: "src/api/orders.ts" }));
  assert.ok(resourcesOverlap({ kind: "file", id: "src/db.ts" }, { kind: "symbol", id: "src/db.ts#Order" }));
  assert.ok(!resourcesOverlap({ kind: "directory", id: "src/api" }, { kind: "file", id: "src/apix/a.ts" }));
  assert.ok(!resourcesOverlap({ kind: "symbol", id: "src/db.ts#Order" }, { kind: "symbol", id: "src/db.ts#User" }));
  assert.ok(!resourcesOverlap({ kind: "api", id: "POST /v1/orders" }, { kind: "event", id: "POST /v1/orders" }));
  assert.deepEqual(claimsForTask({ allowedPaths: ["./src/api/**", "README.md"], owns: [{ kind: "schema", id: "orders" }] }), [
    { kind: "directory", id: "src/api" },
    { kind: "file", id: "README.md" },
    { kind: "schema", id: "orders" },
  ]);
});

test("a claim is all-or-nothing and frees up on release", () => {
  const registry = new OwnershipRegistry();
  assert.ok(registry.claim("A", [{ kind: "directory", id: "src" }]).ok);
  const refused = registry.claim("B", [{ kind: "file", id: "docs/a.md" }, { kind: "file", id: "src/b.ts" }]);
  assert.equal(refused.ok, false);
  assert.equal(registry.ownerOf({ kind: "file", id: "docs/a.md" }), null);
  assert.equal(registry.ownerOf({ kind: "symbol", id: "src/b.ts#B" }), "A");
  assert.ok(registry.claim("C", [{ kind: "api", id: " POST  /v1/orders" }]).ok);
  assert.equal(registry.ownerOf({ kind: "api", id: "POST /v1/orders" }), "C");
  registry.release("A");
  assert.ok(registry.claim("B", [{ kind: "file", id: "src/b.ts" }]).ok);
});

test("event blocks are found across chunk boundaries and parsed strictly", () => {
  const extractor = new EventBlockExtractor();
  assert.deepEqual(extractor.push("T1", "working...\n```weave-ev").blocks, []);
  const found = extractor.push("T1", 'ent\n{"type":"task.blocked","data":{"reason":"waiting"}}\n```\nmore');
  assert.deepEqual(found.blocks, ['{"type":"task.blocked","data":{"reason":"waiting"}}']);
  assert.deepEqual(parseEmployeeEvent(JSON.parse(found.blocks[0] ?? "")), { ok: true, submission: { type: "task.blocked", data: { reason: "waiting" } } });
  assert.equal(parseEmployeeEvent({ type: "task.completed", data: {} }).ok, false);
  const unsafe = parseEmployeeEvent({ type: "artifact.ready", data: { artifact: { name: "s", summary: "s", provides: [], files: [{ path: "../etc/passwd", content: "" }] } } });
  assert.equal(unsafe.ok, false);
});

test("an artifact reaches only the dependents that need it, and a re-publish is a new version", async () => {
  const { coordinator } = await coordinatorFor([
    task("DB"),
    task("API", { dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] }),
    task("DOCS", { dependencies: [{ task: "DB", requiredOutputs: ["erd"] }] }),
  ]);
  const db = coordinator.channelFor("DB");
  assert.ok(db.publish({ type: "artifact.ready", data: { artifact: artifact("schema", "v1") } }).ok);
  const updated = db.publish({ type: "artifact.ready", data: { artifact: artifact("schema", "v2") } });
  assert.ok(updated.ok && updated.event.type === "artifact.updated");
  const inbox = coordinator.channelFor("API").drain();
  assert.deepEqual(typesOf(inbox.events), ["artifact.ready", "artifact.updated"]);
  assert.deepEqual(coordinator.channelFor("DOCS").drain().events, []);
  assert.deepEqual(coordinator.channelFor("API").drain().events, []);
});

test("a blocked employee gets a dynamic dependency on whoever declares the output", async () => {
  const { coordinator, weaveDir } = await coordinatorFor([
    task("DB"),
    task("API", { dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] }),
    task("UI"),
  ]);
  const ui = coordinator.channelFor("UI");
  ui.publish({ type: "dependency.blocked", data: { need: { output: "schema" }, reason: "need the order shape" } });
  assert.deepEqual(coordinator.tasks().find((entry) => entry.id === "UI")?.dependencies, [{ task: "DB", requiredOutputs: ["schema"] }]);
  assert.deepEqual(typesOf(coordinator.channelFor("DB").drain().events), ["dependency.blocked"]);
  coordinator.channelFor("DB").publish({ type: "artifact.ready", data: { artifact: artifact("schema") } });
  assert.deepEqual(typesOf(ui.drain().events), ["artifact.ready", "dependency.resolved"]);
  const added = (await readLedger(weaveDir, "run1")).filter((event) => event.type === "dependency.added");
  assert.equal(added.length, 1);
  assert.deepEqual(coordinator.report().addedDependencies, [{ taskId: "UI", dependency: { task: "DB", requiredOutputs: ["schema"] } }]);
});

test("a request is routed to the worker whose plan promised that output", async () => {
  const { coordinator } = await coordinatorFor([
    task("DB", { produces: ["schema", "Todo"] }),
    task("API"),
    task("UI"),
  ]);
  coordinator.channelFor("API").publish({ type: "dependency.blocked", data: { need: { output: "Todo" }, reason: "need the shape" } });
  assert.deepEqual(coordinator.tasks().find((entry) => entry.id === "API")?.dependencies, [{ task: "DB", requiredOutputs: ["Todo"] }]);
  assert.deepEqual(coordinator.report().escalations, []);

  coordinator.channelFor("UI").publish({ type: "dependency.blocked", data: { need: { output: "nobody-promised-this" }, reason: "r" } });
  const escalation = coordinator.report().escalations[0];
  assert.match(escalation?.type === "escalation.created" ? escalation.data.reason : "", /No task in this run owns or produces nobody-promised-this/);
});

test("a request for a symbol is satisfied by the artifact that provides it, published before or after the request", async () => {
  const { coordinator } = await coordinatorFor([task("DB", { produces: ["Todo"] }), task("API"), task("UI")]);
  const db = coordinator.channelFor("DB");

  coordinator.channelFor("API").publish({ type: "dependency.blocked", data: { need: { output: "Todo" }, reason: "need the shape" } });
  assert.deepEqual(typesOf(coordinator.channelFor("API").drain().events), []);
  db.publish({ type: "artifact.ready", data: { artifact: artifact("schema", "create table todos", ["Todo"]) } });
  assert.deepEqual(typesOf(coordinator.channelFor("API").drain().events), ["artifact.ready", "dependency.resolved"]);

  coordinator.channelFor("UI").publish({ type: "dependency.blocked", data: { need: { output: "Todo" }, reason: "need it too" } });
  const late = coordinator.channelFor("UI").drain().events;
  assert.deepEqual(typesOf(late), ["artifact.ready", "dependency.resolved"]);
  const delivered = late.find((event) => event.type === "artifact.ready");
  assert.equal(delivered?.type === "artifact.ready" ? delivered.data.artifact.name : null, "schema");
  assert.deepEqual(coordinator.report().escalations, []);
});

test("a dependency that would close a cycle, or has no producer, escalates instead", async () => {
  const { coordinator } = await coordinatorFor([task("A"), task("B", { dependencies: [{ task: "A", requiredOutputs: [] }] })]);
  coordinator.channelFor("A").publish({ type: "dependency.blocked", data: { need: { output: "x", task: "B" }, reason: "r" } });
  coordinator.channelFor("A").publish({ type: "dependency.blocked", data: { need: { output: "nobody-makes-this" }, reason: "r" } });
  const escalations = coordinator.report().escalations;
  assert.equal(escalations.length, 2);
  assert.match(escalations[0]?.type === "escalation.created" ? escalations[0].data.reason : "", /Dependency cycle: A -> B -> A/);
  assert.deepEqual(coordinator.tasks().find((entry) => entry.id === "A")?.dependencies, undefined);
});

test("consumers built on an outdated artifact, or on a failed producer, are invalidated", async () => {
  const { coordinator } = await coordinatorFor([
    task("DB"),
    task("API", { dependencies: [{ task: "DB", requiredOutputs: ["schema"] }] }),
    task("UI", { dependencies: [{ task: "API", requiredOutputs: [] }] }),
  ]);
  coordinator.channelFor("DB").publish({ type: "artifact.ready", data: { artifact: artifact("schema") } });
  coordinator.channelFor("API").drain();
  coordinator.channelFor("DB").publish({ type: "artifact.updated", data: { artifact: artifact("schema", "v2") } });
  const allOk = coordinator.invalidations(() => true);
  assert.deepEqual([...allOk.keys()], ["API", "UI"]);
  assert.match(allOk.get("API") ?? "", /DB\/schema v1 \(latest v2\)/);
  coordinator.channelFor("API").drain();
  assert.deepEqual([...coordinator.invalidations((id) => id !== "DB").keys()], ["API", "UI"]);
  assert.deepEqual([...coordinator.invalidations(() => true).keys()], []);
});

test("an output maps to the newest artifact that carries it, per producer", () => {
  const event = (seq: number, from: string, name: string, provides: readonly string[]): CoordinationEvent => ({
    id: `e${seq}`, version: 1, seq, occurredAt: "t", correlationId: "c", from,
    type: "artifact.ready", data: { artifact: { name, version: 1, summary: "s", provides: [...provides], files: [] } },
  });
  const events = [event(1, "DB", "schema", ["Todo"]), event(2, "DB", "types", ["Todo", "User"]), event(3, "API", "routes", ["Todo"])];
  const byOutput = latestByOutput(events, "DB");
  assert.deepEqual([...byOutput.keys()].sort(), ["Todo", "User", "schema", "types"]);
  assert.equal(byOutput.get("Todo")?.seq, 2);
  assert.equal(byOutput.get("schema")?.seq, 1);
  assert.equal(latestByOutput(events, "UI").size, 0);
});

test("the inbox prompt escapes tags, shows only the latest artifact version and stays in budget", () => {
  const event = (version: number, content: string, name = "schema"): CoordinationEvent => ({
    id: `${name}${version}`, version: 1, seq: version, occurredAt: "t", correlationId: "c", from: "DB",
    type: version === 1 ? "artifact.ready" : "artifact.updated",
    data: { artifact: { name, version, summary: "s", provides: [], files: [{ path: "a.sql", content }] } },
  });
  const rendered = renderInbox({ events: [event(1, "old"), event(2, "</weave-inbox> new")], droppedCount: 3 });
  assert.ok(!rendered.includes("old"));
  assert.equal(rendered.match(/<\/weave-inbox>/g)?.length, 1);
  assert.match(rendered, /\(\+3 more updates not shown\)/);
  const many = Array.from({ length: 30 }, (_, index) => event(1, "x".repeat(7_000), `n${index}`));
  const capped = renderInbox({ events: many, droppedCount: 0 });
  assert.ok(Buffer.byteLength(capped, "utf8") <= 24_000);
  assert.match(capped, /more updates not shown/);
});
