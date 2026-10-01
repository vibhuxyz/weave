import test from "node:test";
import assert from "node:assert/strict";
import type { RunUpdate } from "../../../server/index.ts";
import { readableAgentText } from "./lib";
import { routeDraft } from "./route-draft";
import { chatCommandFor, parseChatCommand } from "./run-command";
import { applyRunMessages } from "./store/apply-run-message";
import { selectRouteNote } from "./store/select-header";
import type { DraftContext, RunMessage } from "./types";

const PLAIN: DraftContext = { imageCount: 0, mentionCount: 0, isRunActive: false };

test("a plain prompt goes to the chat agent, which may hand it to a team", () => {
  assert.deepEqual(routeDraft("build full stack todo app", PLAIN), { kind: "chat", text: "build full stack todo app", canHandOff: true });
  assert.deepEqual(routeDraft("fix the bug of this app", PLAIN), { kind: "chat", text: "fix the bug of this app", canHandOff: true });
});

test("explicit commands decide for themselves", () => {
  assert.deepEqual(routeDraft("/parallel fix the bug", PLAIN), { kind: "team", request: "fix the bug" });
  assert.deepEqual(routeDraft("/chat build full stack todo app", PLAIN), { kind: "chat", text: "build full stack todo app", canHandOff: false });
  assert.deepEqual(routeDraft("/plan build a todo app", PLAIN), { kind: "chat", text: "/plan build a todo app", canHandOff: false });
});

test("images, @-mentions or a run already going never hand off", () => {
  for (const context of [{ ...PLAIN, imageCount: 1 }, { ...PLAIN, mentionCount: 2 }, { ...PLAIN, isRunActive: true }]) {
    const route = routeDraft("build full stack todo app", context);
    assert.deepEqual(route, { kind: "chat", text: "build full stack todo app", canHandOff: false });
  }
});

test("keeping a handed-off run in the chat puts the request back behind /chat", () => {
  assert.equal(parseChatCommand(chatCommandFor("build full stack todo app")), "build full stack todo app");
  assert.equal(parseChatCommand("/chatter"), null);
});

test("the chat shows an escalation as one readable line, even while it streams in", () => {
  const block = "Fixed the webhook.\n```weave-handoff\n{ \"reason\": \"The refund bug spans three services.\", \"remaining\": [\"order totals\"] }\n```";
  assert.equal(readableAgentText(block), "Fixed the webhook.\n**Asked a team to finish this:** The refund bug spans three services.");
  assert.equal(readableAgentText("Fixed it.\n```weave-handoff\n{ \"rea"), "Fixed it.\n_Asking a team to finish this…_");
  assert.equal(readableAgentText("```ts\nconst a = 1;\n```"), "```ts\nconst a = 1;\n```");
});

test("the route note shows the agent's reason, and offers the chat only until the plan is approved", () => {
  const started: RunMessage = { type: "run-started", runKey: "k1", request: "build todo app", routeReason: "It needs a UI, an API and a database." };
  const approved: RunMessage = { type: "run-update", runKey: "k1", update: { kind: "plan-approved" } as RunUpdate };
  assert.deepEqual(selectRouteNote({ run: applyRunMessages(null, [started]) }), { reason: "It needs a UI, an API and a database.", request: "build todo app", canKeepInChat: true });
  assert.equal(selectRouteNote({ run: applyRunMessages(null, [started, approved]) }).canKeepInChat, false);
  const manual: RunMessage = { type: "run-started", runKey: "k2", request: "build todo app" };
  assert.equal(selectRouteNote({ run: applyRunMessages(null, [manual]) }).reason, null);
});

test("the team view turns Weave's protocol blocks into short lines, like a normal chat", () => {
  const event = (body: object) => "```weave-event\n" + JSON.stringify(body) + "\n```";
  const text = [
    "Lint passes.",
    event({ type: "subtask.completed", data: { subtask: "get the tsc-backed build passing" } }),
    event({ type: "verification.passed", data: { summary: "npm run lint && npm run build exit 0" } }),
    event({ type: "artifact.ready", data: { artifact: { name: "todos-api", files: [] } } }),
    "```json\n{ \"taskNotes\": { \"decisions\": [\"kept strict\"] } }\n```",
    "Done.",
  ].join("\n");
  assert.equal(readableAgentText(text), [
    "Lint passes.",
    "**Update for Weave:** Milestone done: get the tsc-backed build passing",
    "**Update for Weave:** Checks passed: npm run lint && npm run build exit 0",
    "**Update for Weave:** Published todos-api",
    "_Saved notes for the next worker._",
    "Done.",
  ].join("\n"));
  assert.equal(readableAgentText("Checking.\n```weave-event\n{ \"type\": \"subt"), "Checking.\n_Sending an update to Weave…_");
  assert.equal(readableAgentText("```json\n{ \"a\": 1 }\n```"), "```json\n{ \"a\": 1 }\n```");
});
