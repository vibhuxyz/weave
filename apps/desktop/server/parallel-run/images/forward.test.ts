import test from "node:test";
import assert from "node:assert/strict";
import type { planAndRun } from "@weave/core";
import type { ServerMessage } from "../../shared/index.ts";
import { createRunController } from "../run-controller.ts";
import type { RunDependencies } from "../run-preflight.ts";

const READY: RunDependencies = {
  prepareRepo: async () => ({ ok: true, setupSummary: null }),
  readBudgets: async () => ({ ok: true, budgets: {} }),
};

test("a parallel run gives the planner its images and never starts on a file that is not an image", async () => {
  const seen: Parameters<typeof planAndRun>[0][] = [];
  const sent: ServerMessage[] = [];
  const capture: typeof planAndRun = async (options) => {
    seen.push(options);
    return { status: "no-change-needed", reason: "done" };
  };
  const runs = createRunController(capture, READY);
  const send = (message: ServerMessage) => sent.push(message);
  const image = { data: Buffer.from("cart").toString("base64"), mimeType: "image/png", prompt: "cart page" };
  await runs.start({ request: "fix the coupons", projectDir: "/repo", engineId: "claude", runKey: "k1", images: [image], send });
  assert.equal(seen[0]?.request, "fix the coupons");
  assert.equal(seen[0]?.request.includes(image.data), false);
  assert.deepEqual(seen[0]?.images, [image]);

  const secret = "TOPSECRETDATA";
  await runs.start({
    request: "fix the coupons",
    projectDir: "/repo",
    engineId: "claude",
    runKey: "k2",
    images: [{ data: Buffer.from(secret).toString("base64"), mimeType: "text/html" }],
    send,
  });
  assert.equal(seen.length, 1);
  const error = sent.at(-1);
  assert.equal(error?.type, "error");
  if (error?.type === "error") assert.equal(error.message.includes(secret), false);
  assert.equal(sent.some((message) => message.type === "run-started" && message.runKey === "k2"), false);
});

test("images alone are enough to start, with a request that points at them", async () => {
  const seen: string[] = [];
  const capture: typeof planAndRun = async (options) => {
    seen.push(options.request);
    return { status: "no-change-needed", reason: "done" };
  };
  const runs = createRunController(capture, READY);
  const image = { data: Buffer.from("cart").toString("base64"), mimeType: "image/png" };
  await runs.start({ request: "   ", projectDir: "/repo", engineId: "claude", runKey: "k1", images: [image], send: () => undefined });
  assert.deepEqual(seen, ["Use the attached images."]);
});
