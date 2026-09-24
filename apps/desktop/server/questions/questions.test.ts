import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAskElicitationResponse,
  askUserQuestionsToCreateRequest,
  type AskUserQuestion,
} from "@agentclientprotocol/claude-agent-acp/dist/elicitation.js";
import type { CreateElicitationResponse } from "@weave/protocol";
import type { FormElicitationRequest } from "@weave/agent";
import type { ServerMessage } from "../shared/index.ts";
import { toElicitationContent } from "./answers.ts";
import { createUserAsker } from "./asker.ts";
import { MAX_FIELD_OPTIONS } from "./constants.ts";
import { toQuestionFields } from "./fields.ts";
import { PendingQuestions } from "./pending.ts";
import { answerQuestion, type AnsweredQuestion } from "./respond.ts";

const ZOD_QUESTION: AskUserQuestion = {
  question: "Add Zod to packages/core?",
  header: "Zod",
  multiSelect: false,
  options: [
    { label: "Yes", description: "Add the dependency" },
    { label: "No", description: "Keep the hand-written parser" },
  ],
};

function claudeRequest(questions: AskUserQuestion[]): FormElicitationRequest {
  const request = askUserQuestionsToCreateRequest(questions, "session-1", "tool-1");
  assert.equal(request.mode, "form");
  return request as FormElicitationRequest;
}

test("Claude's AskUserQuestion form becomes a choice plus an Other text field", () => {
  const { fields, notices } = toQuestionFields(claudeRequest([ZOD_QUESTION]).requestedSchema);
  assert.deepEqual(notices, []);
  assert.equal(fields.length, 2);
  const [choice, other] = fields;
  assert.equal(choice?.kind, "choice");
  assert.equal(choice?.title, "Zod");
  assert.deepEqual(
    choice?.kind === "choice" ? choice.options.map((option) => option.description) : [],
    ["Add the dependency", "Keep the hand-written parser"],
  );
  assert.equal(other?.kind, "text");
  assert.equal(other?.title, "Other");
  assert.equal(other?.kind === "text" ? other.customAnswerFor : null, "question_0");
});

test("a custom-answer marker pointing at no choice field is dropped", () => {
  const { fields } = toQuestionFields({
    type: "object",
    properties: {
      note: {
        type: "string",
        _meta: { _askUserQuestionCustomAnswer: { questionId: "missing", isCustomAnswer: true } },
      },
    },
  } as FormElicitationRequest["requestedSchema"]);
  const [note] = fields;
  assert.equal(note?.kind === "text" ? note.customAnswerFor : "wrong", null);
});

test("an accepted answer round-trips into Claude's own tool answers", () => {
  const request = claudeRequest([ZOD_QUESTION]);
  const { fields } = toQuestionFields(request.requestedSchema);
  const result = toElicitationContent(fields, { question_0: "Yes" });
  assert.ok(result.ok);
  const outcome = applyAskElicitationResponse(
    { action: "accept", content: result.content },
    { questions: [ZOD_QUESTION] },
    [ZOD_QUESTION],
  );
  assert.deepEqual(
    outcome.action === "answered" ? outcome.updatedInput.answers : null,
    { "Add Zod to packages/core?": "Yes" },
  );
});

test("a typed Other answer reaches Claude instead of the picked option", () => {
  const { fields } = toQuestionFields(claudeRequest([ZOD_QUESTION]).requestedSchema);
  const result = toElicitationContent(fields, { question_0: "Yes", question_0_custom: " Only in core " });
  assert.ok(result.ok);
  const outcome = applyAskElicitationResponse(
    { action: "accept", content: result.content },
    { questions: [ZOD_QUESTION] },
    [ZOD_QUESTION],
  );
  assert.deepEqual(
    outcome.action === "answered" ? outcome.updatedInput.answers : null,
    { "Add Zod to packages/core?": "Only in core" },
  );
});

test("answers outside the offered options are rejected", () => {
  const { fields } = toQuestionFields(claudeRequest([ZOD_QUESTION]).requestedSchema);
  assert.deepEqual(toElicitationContent(fields, { question_0: "Maybe" }), {
    ok: false,
    message: 'Invalid answer for "Zod"',
  });
});

test("multi-select answers are deduplicated and checked against the options", () => {
  const { fields } = toQuestionFields(
    claudeRequest([{ ...ZOD_QUESTION, multiSelect: true }]).requestedSchema,
  );
  const result = toElicitationContent(fields, { question_0: ["Yes", "No", "Yes"] });
  assert.deepEqual(result, { ok: true, content: { question_0: ["Yes", "No"] } });
});

test("required fields must be answered", () => {
  const { fields } = toQuestionFields({
    type: "object",
    required: ["reason"],
    properties: { reason: { type: "string", title: "Reason" } },
  });
  assert.deepEqual(toElicitationContent(fields, { reason: "  " }), {
    ok: false,
    message: '"Reason" needs an answer',
  });
});

test("integer fields reject fractions", () => {
  const { fields } = toQuestionFields({
    type: "object",
    properties: { workers: { type: "integer", title: "Workers" } },
  });
  assert.equal(toElicitationContent(fields, { workers: 2.5 }).ok, false);
  assert.deepEqual(toElicitationContent(fields, { workers: 3 }), { ok: true, content: { workers: 3 } });
});

test("oversized and malformed option lists are capped and reported", () => {
  const values = Array.from({ length: MAX_FIELD_OPTIONS + 5 }, (_, index) => `option-${index}`);
  const { fields, notices } = toQuestionFields({
    type: "object",
    properties: {
      pick: { type: "string", enum: [...values, "option-0"] },
      empty: { type: "string", oneOf: [] },
    },
  });
  const [pick] = fields;
  assert.equal(pick?.kind === "choice" ? pick.options.length : 0, MAX_FIELD_OPTIONS);
  assert.deepEqual(notices, [
    { key: "pick", message: "1 duplicate option(s) ignored" },
    { key: "pick", message: `showing ${MAX_FIELD_OPTIONS} of ${values.length} options` },
    { key: "empty", message: "field has no valid options" },
  ]);
});

function askAndCapture() {
  const pending = new PendingQuestions();
  const sent: ServerMessage[] = [];
  const answered: AnsweredQuestion[] = [];
  const send = (message: ServerMessage) => sent.push(message);
  const onAnswered = (entry: AnsweredQuestion) => answered.push(entry);
  const ask = createUserAsker({ pending, send });
  const response: Promise<CreateElicitationResponse> = ask(claudeRequest([ZOD_QUESTION]));
  const opened = sent[0];
  assert.equal(opened?.type, "question-request");
  const requestId = opened?.type === "question-request" ? opened.requestId : "";
  return { pending, sent, send, onAnswered, answered, response, requestId };
}

test("the engine waits until the user answers, then gets the answer", async () => {
  const { pending, sent, send, onAnswered, answered, response, requestId } = askAndCapture();
  answerQuestion({ pending, requestId, answers: { question_0: "No" }, send, onAnswered });
  assert.deepEqual(await response, { action: "accept", content: { question_0: "No" } });
  assert.deepEqual(sent.at(-1), { type: "question-closed", requestId });
  assert.deepEqual(answered, [{ question: "Add Zod to packages/core?", answer: "Zod: No" }]);
});

test("an invalid answer keeps the question open and says why", async () => {
  const { pending, sent, send, onAnswered, answered, response, requestId } = askAndCapture();
  answerQuestion({ pending, requestId, answers: { question_0: "Maybe" }, send, onAnswered });
  assert.deepEqual(sent.at(-1), { type: "question-invalid", requestId, message: 'Invalid answer for "Zod"' });
  answerQuestion({ pending, requestId, answers: null, send, onAnswered });
  assert.deepEqual(await response, { action: "decline" });
  assert.deepEqual(answered, []);
});

test("cancelling the turn releases the waiting engine", async () => {
  const { pending, response } = askAndCapture();
  pending.cancelAll();
  assert.deepEqual(await response, { action: "cancel" });
});
