import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProjectModel } from "../context/index.ts";
import { buildEvidenceGraph, parseFinding, proposeRootCause } from "./evidence/index.ts";
import {
  brokenSessionProject,
  CATALOG_FINDING,
  MIDDLEWARE_FINDING,
  QUESTIONS_ANSWER,
  REFRESH_FINDING,
  writeFiles,
} from "./fixtures.ts";
import { askInvestigationQuestions, parseQuestions } from "./questions/index.ts";
import { scopeQuestions } from "./scope.ts";
import type { Finding } from "./types.ts";

const REQUEST = "Users are randomly logged out";

function turnReturning(...answers: readonly string[]) {
  let call = 0;
  return async (): Promise<string> => {
    const answer = answers[Math.min(call, answers.length - 1)] ?? "";
    call += 1;
    return answer;
  };
}

test("a request becomes numbered investigation questions", async () => {
  const outcome = await askInvestigationQuestions({
    request: REQUEST,
    projectContext: null,
    runTurn: turnReturning(QUESTIONS_ANSWER),
  });
  assert.ok(outcome.ok);
  assert.equal(outcome.attempts, 1);
  assert.deepEqual(
    outcome.questions.questions.map((question) => question.id),
    ["D1", "D2", "D3", "D4", "D5", "D6"],
  );
  assert.deepEqual(
    outcome.questions.questions.map((question) => question.kind),
    ["creation", "persistence", "validation", "expiry", "consistency", "tests"],
  );
});

test("a malformed answer is repaired once, then reported", async () => {
  const repaired = await askInvestigationQuestions({
    request: REQUEST,
    projectContext: null,
    runTurn: turnReturning("not json at all", QUESTIONS_ANSWER),
  });
  assert.ok(repaired.ok);
  assert.equal(repaired.attempts, 2);

  const failed = await askInvestigationQuestions({
    request: REQUEST,
    projectContext: null,
    runTurn: turnReturning("still not json"),
  });
  assert.ok(!failed.ok);
  assert.equal(failed.attempts, 2);
  assert.ok(failed.issues.length > 0);
});

test("duplicate and malformed question ids are rejected", () => {
  const duplicate = parseQuestions(
    JSON.stringify({
      questions: [
        { id: "D1", question: "a?", kind: "creation" },
        { id: "D1", question: "b?", kind: "expiry" },
      ],
    }),
    REQUEST,
  );
  assert.ok(!duplicate.ok);
  assert.ok(duplicate.issues.some((issue) => issue.includes("more than once")));

  const badId = parseQuestions(JSON.stringify({ questions: [{ id: "first", question: "a?", kind: "creation" }] }), REQUEST);
  assert.ok(!badId.ok);
});

test("each question is scoped to the session code, not the whole repository", async () => {
  const dir = await mkdtemp(join(tmpdir(), "weave-investigate-"));
  try {
    await writeFiles(dir, brokenSessionProject());
    const { model } = await buildProjectModel({ root: dir });
    assert.ok(model.files.length > 45);

    const parsed = parseQuestions(QUESTIONS_ANSWER, REQUEST);
    assert.ok(parsed.ok);
    const tasks = scopeQuestions(REQUEST, parsed.questions.questions, model);

    assert.equal(tasks.length, 6);
    for (const task of tasks) {
      assert.ok(task.scope.files.length > 0, `${task.questionId} has an empty scope`);
      assert.ok(task.scope.files.length <= 8, `${task.questionId} scoped ${task.scope.files.length} files`);
      assert.ok(
        task.scope.files.every((path) => !path.startsWith("src/catalog/")),
        `${task.questionId} leaked catalog files: ${task.scope.files.join(", ")}`,
      );
      assert.ok(task.constraints.some((line) => line.startsWith("Read only")));
      assert.ok(task.expectedOutputs.length > 0);
      assert.ok(task.context.includes("<project-context>") || task.context.length > 0);
    }

    const consistency = tasks.find((task) => task.questionId === "D5");
    assert.ok(consistency);
    assert.ok(
      consistency.scope.reasons.every((reason) => reason.includes("inherited from the investigation region")),
      "D5 matched no file by name, so its scope must be inherited",
    );
    assert.ok(consistency.scope.files.every((path) => path.startsWith("src/session/") || path.startsWith("src/auth/")));

    const expiry = tasks.find((task) => task.questionId === "D4");
    assert.ok(expiry);
    assert.ok(expiry.scope.files.includes("src/session/store.ts"));
    assert.ok(expiry.scope.symbols.some((id) => id.endsWith("#refreshSession")));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("worker output becomes findings, and a finding without evidence is rejected", () => {
  const good = parseFinding(REFRESH_FINDING, { worker: "w1", questionId: "D4" });
  assert.ok(good.ok);
  assert.equal(good.finding.id, "D4:w1");
  assert.equal(good.finding.confidence, "high");
  assert.deepEqual(
    good.finding.evidence.map((item) => `${item.file}#${item.symbol ?? ""}`),
    ["src/session/store.ts#refreshSession", "src/session/store.ts#SESSION_TTL_SECONDS"],
  );

  const noEvidence = parseFinding(
    JSON.stringify({ finding: "something is wrong", confidence: "high", evidence: [] }),
    { worker: "w2", questionId: "D5" },
  );
  assert.ok(!noEvidence.ok);
  assert.ok(noEvidence.issues.some((issue) => issue.includes("evidence")));

  const badConfidence = parseFinding(
    JSON.stringify({ finding: "x", confidence: "certain", evidence: [{ file: "a.ts" }] }),
    { worker: "w3", questionId: "D1" },
  );
  assert.ok(!badConfidence.ok);
});

test("two workers' findings corroborate into one ranked root cause", () => {
  const sources = [
    { text: REFRESH_FINDING, worker: "w1", questionId: "D4" },
    { text: MIDDLEWARE_FINDING, worker: "w2", questionId: "D3" },
    { text: CATALOG_FINDING, worker: "w3", questionId: "D6" },
  ];
  const findings: Finding[] = sources.flatMap((source) => {
    const parsed = parseFinding(source.text, { worker: source.worker, questionId: source.questionId });
    return parsed.ok ? [parsed.finding] : [];
  });
  assert.equal(findings.length, 3);

  const graph = buildEvidenceGraph(findings);
  assert.ok(
    graph.links.some(
      (link) => link.kind === "corroborates" && link.from === "finding:D3:w2" && link.to === "finding:D4:w1",
    ),
    "the two session findings do not corroborate",
  );
  assert.ok(graph.nodes.some((node) => node.id === "symbol:src/session/store.ts#refreshSession"));

  const report = proposeRootCause(graph, REQUEST, ["D1", "D2", "D3", "D4", "D5", "D6"]);
  const top = report.causes[0];
  assert.ok(top);
  assert.match(top.hypothesis, /TTL to 1 second/);
  assert.deepEqual(top.supportedBy, ["D3:w2", "D4:w1"]);
  assert.deepEqual(top.questionIds, ["D3", "D4"]);
  assert.deepEqual(top.sharedEvidence, ["src/session/store.ts#refreshSession"]);

  const unrelated = report.causes.find((cause) => cause.supportedBy.includes("D6:w3"));
  assert.ok(unrelated);
  assert.ok(unrelated.score < top.score, "the unrelated catalog finding outranked the session cause");
  assert.deepEqual(report.unanswered, ["D1", "D2", "D5"]);
});

test("the evidence graph and root cause are the same on every run", () => {
  const build = () => {
    const findings = [
      parseFinding(MIDDLEWARE_FINDING, { worker: "w2", questionId: "D3" }),
      parseFinding(REFRESH_FINDING, { worker: "w1", questionId: "D4" }),
    ].flatMap((parsed) => (parsed.ok ? [parsed.finding] : []));
    const graph = buildEvidenceGraph(findings);
    return { graph, report: proposeRootCause(graph, REQUEST, ["D3", "D4"]) };
  };
  assert.deepEqual(build(), build());
});
