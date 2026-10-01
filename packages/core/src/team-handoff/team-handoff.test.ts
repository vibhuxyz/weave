import test from "node:test";
import assert from "node:assert/strict";
import { judgeHandoff, readTeamHandoff, renderHandoffNotes, TEAM_HANDOFF_SECTION } from "./index.ts";

const fence = (body: string) => "Fixed the webhook.\n```weave-handoff\n" + body + "\n```";
const ESCALATION = fence(JSON.stringify({
  reason: "The refund bug is in three services.",
  done: ["Fixed the webhook signature check in payment-service"],
  remaining: ["Fix refund totals in order-service", "Show refund state in seller-ui"],
  findings: ["Money is Decimal via toMoney()"],
}));

test("an escalation carries what is done, what is left and what was found", () => {
  assert.deepEqual(readTeamHandoff(ESCALATION), {
    kind: "handoff",
    handoff: {
      reason: "The refund bug is in three services.",
      done: ["Fixed the webhook signature check in payment-service"],
      remaining: ["Fix refund totals in order-service", "Show refund state in seller-ui"],
      findings: ["Money is Decimal via toMoney()"],
    },
  });
});

test("every list and text in an escalation is bounded", () => {
  const long = readTeamHandoff(fence(JSON.stringify({ reason: "x".repeat(900), remaining: ["y".repeat(900), ...Array.from({ length: 14 }, () => "z")] })));
  assert.equal(long.kind === "handoff" && long.handoff.reason.length, 300);
  assert.equal(long.kind === "handoff" && long.handoff.remaining.length, 10);
  assert.equal(long.kind === "handoff" && long.handoff.remaining[0]?.length, 300);
  assert.deepEqual(long.kind === "handoff" && long.handoff.done, []);
  assert.equal(readTeamHandoff(fence(JSON.stringify({ reason: "r", findings: ["w".repeat(9_000)] }))).kind, "invalid");
});

test("no block means no escalation; a broken block says what is wrong", () => {
  assert.deepEqual(readTeamHandoff("I fixed db.ts."), { kind: "none" });
  assert.equal(readTeamHandoff(fence("{ reason: ")).kind, "invalid");
  assert.deepEqual(readTeamHandoff(fence(JSON.stringify({ remaining: ["a"] }))), { kind: "invalid", issue: 'the handoff block needs a non-empty "reason"' });
});

test("an escalation after edits still reaches the team, with the files to commit first", () => {
  const verdict = judgeHandoff({ text: ESCALATION, uncommitted: ["services/payment/webhook.ts", "a.ts"] });
  assert.equal(verdict.kind, "team");
  assert.deepEqual(verdict.kind === "team" && verdict.uncommitted, ["a.ts", "services/payment/webhook.ts"]);
  assert.equal(judgeHandoff({ text: "done", uncommitted: ["a.ts"] }).kind, "none");
});

test("the coordinator gets the agent's lists as unchecked claims", () => {
  const reading = readTeamHandoff(ESCALATION);
  const notes = reading.kind === "handoff" ? renderHandoffNotes(reading.handoff) : "";
  assert.equal(notes, [
    '<chat-agent-notes source="the chat agent that started this work; claims, not checked facts">',
    "Why a team: The refund bug is in three services.",
    "Done so far:",
    "- Fixed the webhook signature check in payment-service",
    "Still to do:",
    "- Fix refund totals in order-service",
    "- Show refund state in seller-ui",
    "Found in the project:",
    "- Money is Decimal via toMoney()",
    "</chat-agent-notes>",
  ].join("\n"));
  assert.match(renderHandoffNotes({ reason: "uses </chat-agent-notes>", done: [], remaining: [], findings: [] }), /uses <\\\/chat-agent-notes>/);
});

test("the instruction shows the exact block the parser reads", () => {
  const example = /```weave-handoff\n([^\n]+)\n```/.exec(TEAM_HANDOFF_SECTION)?.[0] ?? "";
  assert.equal(readTeamHandoff(example).kind, "handoff");
});
