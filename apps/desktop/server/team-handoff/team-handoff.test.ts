import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeHandoff, Ledger, readLedger, type WorktreeResult } from "@weave/core";
import type { ServerMessage } from "../shared/index.ts";
import { askToCommit, promptMayHandOff, settleHandoff, watchTurn, type TeamRunStart } from "./index.ts";

const ESCALATION = "Fixed the webhook.\n```weave-handoff\n" + JSON.stringify({ reason: "The refund bug spans three services.", done: ["webhook check"], remaining: ["order totals", "seller-ui state"] }) + "\n```";

function ledgerIn(): { readonly ledger: Ledger; readonly dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "weave-handoff-"));
  return { ledger: new Ledger(dir, "run1"), dir };
}

test("the watcher reads only this chat's message text, until it is closed", () => {
  const { ledger } = ledgerIn();
  const watch = watchTurn(ledger, "desktop");
  ledger.append("agent.message", { taskId: "desktop", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Fixed the webhook.\n" } } });
  ledger.append("agent.message", { taskId: "T9", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "other task" } } });
  ledger.append("agent.message", { taskId: "desktop", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "Edit", kind: "edit" } });
  watch.close();
  ledger.append("agent.message", { taskId: "desktop", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "late" } } });
  assert.equal(watch.read(), "Fixed the webhook.\n");
});

interface Script {
  readonly uncommitted: readonly string[];
  readonly isConfirmed?: boolean;
  readonly commit?: WorktreeResult<string>;
  readonly text?: string;
  readonly estimateNotes?: string;
  readonly images?: TeamRunStart["images"];
}

async function settle(script: Script) {
  const { ledger, dir } = ledgerIn();
  const started: TeamRunStart[] = [];
  const sent: ServerMessage[] = [];
  const asked: string[] = [];
  const commits: string[] = [];
  await settleHandoff({
    verdict: judgeHandoff({ text: script.text ?? ESCALATION, uncommitted: script.uncommitted }),
    request: "fix the refund bug in the payment service",
    estimateNotes: script.estimateNotes ?? "",
    images: script.images,
    ledger,
    send: (message) => sent.push(message),
    startTeamRun: (start) => started.push(start),
    confirmCommit: async (message) => (asked.push(message), script.isConfirmed ?? false),
    commitWork: async () => (commits.push("commit"), script.commit ?? { ok: true, value: "abc" }),
  });
  const logged = (await readLedger(dir, "run1").catch(() => [])).flatMap((event) => (event.type === "handoff.decided" ? [event.outcome] : []));
  return { started, sent, asked, commits, logged };
}

const messageOf = (sent: readonly ServerMessage[]) => (sent[0]?.type === "error" ? sent[0].message : "");

test("an escalation with nothing uncommitted starts the team at once, with the agent's lists", async () => {
  const { started, asked, commits, logged } = await settle({ uncommitted: [] });
  assert.deepEqual([asked, commits, logged], [[], [], ["team"]]);
  assert.equal(started[0]?.routeReason, "The refund bug spans three services.");
  assert.match(started[0]?.plannerNotes ?? "", /Done so far:\n- webhook check\nStill to do:\n- order totals\n- seller-ui state/);
});

test("an image does not block a handoff, and the team run keeps it", async () => {
  const image = { data: "Y2FydA==", mimeType: "image/png", prompt: "cart page" };
  assert.equal(promptMayHandOff({ allowHandoff: true, images: [image] }), true);
  assert.equal(promptMayHandOff({ allowHandoff: true }), true);
  assert.equal(promptMayHandOff({ images: [image] }), false);
  const { started } = await settle({ uncommitted: [], images: [image] });
  assert.deepEqual(started[0]?.images, [image]);
});

test("Weave's own estimate reaches the coordinator after the agent's notes", async () => {
  const { started } = await settle({ uncommitted: [], estimateNotes: "<weave-estimate>\nRecommendation: ask a team\n</weave-estimate>" });
  assert.match(started[0]?.plannerNotes ?? "", /<\/chat-agent-notes>\n\n<weave-estimate>\nRecommendation: ask a team\n<\/weave-estimate>$/);
});

test("uncommitted work is committed only after the user says yes, then the team starts", async () => {
  const { started, asked, commits, logged } = await settle({ uncommitted: ["services/payment/webhook.ts"], isConfirmed: true });
  assert.match(asked[0] ?? "", /wants a team to finish it: The refund bug spans three services\. .*commits the 1 uncommitted file\(s\): services\/payment\/webhook\.ts\./);
  assert.deepEqual([commits, logged, started.length], [["commit"], ["team"], 1]);
});

test("saying no, or a failed commit, keeps the work in the chat and says why", async () => {
  const declined = await settle({ uncommitted: ["a.ts"], isConfirmed: false });
  assert.deepEqual([declined.started, declined.commits, declined.logged], [[], [], ["kept-in-chat"]]);
  assert.match(messageOf(declined.sent), /Kept in this chat/);
  const failed = await settle({ uncommitted: ["a.ts"], isConfirmed: true, commit: { ok: false, reason: "index.lock exists" } });
  assert.deepEqual([failed.started, failed.logged], [[], ["commit-failed"]]);
  assert.match(messageOf(failed.sent), /could not commit the work before the team run: index\.lock exists/);
});

test("a broken block is reported, and no block does nothing at all", async () => {
  const broken = await settle({ uncommitted: [], text: "```weave-handoff\n{ nope\n```" });
  assert.deepEqual([broken.started, broken.logged], [[], ["invalid"]]);
  assert.match(messageOf(broken.sent), /not valid JSON/);
  const none = await settle({ uncommitted: ["a.ts"], text: "Fixed it." });
  assert.deepEqual([none.started, none.sent, none.asked, none.logged], [[], [], [], []]);
});

test("the commit question offers commit or keep, and only an accepted commit counts", async () => {
  const answers = [
    { action: "accept", content: { decision: "commit" } },
    { action: "accept", content: { decision: "keep" } },
    { action: "cancel" },
  ] as const;
  const results = await Promise.all(answers.map((answer) => askToCommit(async (request) => {
    assert.deepEqual(Object.keys(request.requestedSchema.properties ?? {}), ["decision"]);
    return answer;
  }, "commit?")));
  assert.deepEqual(results, [true, false, false]);
});
