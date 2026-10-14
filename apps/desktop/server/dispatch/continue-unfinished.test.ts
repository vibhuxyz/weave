import { describe, expect, test } from "bun:test";
import {
  continuationPrompt,
  MAX_CONTINUATIONS,
  MAX_STALLED_CONTINUATIONS,
  promptUntilAnswer,
  shouldContinueUnfinished,
  type TurnProgress,
} from "./continue-unfinished.ts";

describe("shouldContinueUnfinished", () => {
  test("continues when turn used tools, has no answer, and stopped with end_turn", () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    expect(shouldContinueUnfinished("end_turn", progress)).toBe(true);
  });

  test("continues for max_tokens and max_turn_requests", () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    expect(shouldContinueUnfinished("max_tokens", progress)).toBe(true);
    expect(shouldContinueUnfinished("max_turn_requests", progress)).toBe(true);
  });

  test("does not continue when cancelled", () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    expect(shouldContinueUnfinished("end_turn", progress, true)).toBe(false);
  });

  test("does not continue when an answer exists", () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: true };
    expect(shouldContinueUnfinished("end_turn", progress)).toBe(false);
  });

  test("does not continue when no tools were used", () => {
    const progress: TurnProgress = { usedTools: false, hasAnswer: false };
    expect(shouldContinueUnfinished("end_turn", progress)).toBe(false);
  });

  test("does not continue for other stop reasons", () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    expect(shouldContinueUnfinished("stalled", progress)).toBe(false);
    expect(shouldContinueUnfinished("error", progress)).toBe(false);
  });
});

describe("continuationPrompt", () => {
  test("tells the model to continue the request with tools on early attempts", () => {
    const prompt = continuationPrompt(1);
    expect(prompt).toContain("Continue the user's original request");
    expect(prompt).not.toContain("Do not call additional tools");
  });

  test("asks for a wrap-up summary on the last allowed attempt", () => {
    const prompt = continuationPrompt(MAX_CONTINUATIONS);
    expect(prompt).toContain("last automatic continuation");
    expect(prompt).not.toContain("Do not call additional tools");
  });
});

describe("promptUntilAnswer", () => {
  test("stops immediately when first run provides answer without tool stalling", async () => {
    const progress: TurnProgress = { usedTools: false, hasAnswer: true };
    const activity = { snapshot: () => progress, reset: () => {} };
    let calls = 0;

    const res = await promptUntilAnswer({
      run: async () => {
        calls += 1;
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "hello" }],
      followUp: () => [{ type: "text", text: "continue" }],
      activity,
    });

    expect(calls).toBe(1);
    expect(res.continuations).toBe(0);
    expect(res.stillUnfinished).toBe(false);
  });

  test("runs follow-ups until answer is provided", async () => {
    let currentProgress: TurnProgress = { usedTools: true, hasAnswer: false };
    const activity = {
      snapshot: () => currentProgress,
      reset: () => {
        currentProgress = { usedTools: true, hasAnswer: false };
      },
    };
    let calls = 0;

    const res = await promptUntilAnswer({
      run: async () => {
        calls += 1;
        if (calls === 2) {
          currentProgress = { usedTools: true, hasAnswer: true };
        }
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "hello" }],
      followUp: (attempt) => [{ type: "text", text: continuationPrompt(attempt) }],
      activity,
    });

    expect(calls).toBe(2);
    expect(res.continuations).toBe(1);
    expect(res.stillUnfinished).toBe(false);
  });

  test("stops after MAX_STALLED_CONTINUATIONS turns without progress and marks stillUnfinished", async () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    const activity = { snapshot: () => progress, reset: () => {} };
    let calls = 0;

    const res = await promptUntilAnswer({
      run: async () => {
        calls += 1;
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "hello" }],
      followUp: (attempt) => [{ type: "text", text: continuationPrompt(attempt) }],
      activity,
    });

    expect(calls).toBe(1 + MAX_STALLED_CONTINUATIONS);
    expect(res.continuations).toBe(MAX_STALLED_CONTINUATIONS);
    expect(res.stillUnfinished).toBe(true);
  });

  test("cancels immediately when isCancelled returns true", async () => {
    const progress: TurnProgress = { usedTools: true, hasAnswer: false };
    const activity = { snapshot: () => progress, reset: () => {} };
    let calls = 0;

    const res = await promptUntilAnswer({
      run: async () => {
        calls += 1;
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "hello" }],
      followUp: (attempt) => [{ type: "text", text: continuationPrompt(attempt) }],
      activity,
      isCancelled: () => true,
    });

    expect(calls).toBe(1);
    expect(res.continuations).toBe(0);
    expect(res.stillUnfinished).toBe(false);
  });

  test("does not continue when hasFinalAnswer is true despite tool usage", () => {
    const progress: TurnProgress = {
      usedTools: true,
      hasUserFacingText: true,
      hasFinalAnswer: true,
      hasAnswer: true,
      toolCalls: 5,
      answerStatus: "final",
      turnStatus: "completed",
      taskStatus: "completed",
    };
    expect(shouldContinueUnfinished("end_turn", progress)).toBe(false);
  });

  test("continues when user-facing text was only commentary and no final answer exists", () => {
    const progress: TurnProgress = {
      usedTools: true,
      hasUserFacingText: true,
      hasFinalAnswer: false,
      hasAnswer: false,
      toolCalls: 5,
      answerStatus: "partial",
      turnStatus: "completed",
      taskStatus: "in_progress",
    };
    expect(shouldContinueUnfinished("end_turn", progress)).toBe(true);
  });

  test("triggers beforeContinuation on recovery", async () => {
    const continuationAttempts: number[] = [];
    let callCount = 0;

    const activity = {
      snapshot: () => ({
        usedTools: true,
        hasUserFacingText: callCount > 1,
        hasFinalAnswer: callCount > 1,
        hasAnswer: callCount > 1,
        toolCalls: 1,
        answerStatus: (callCount > 1 ? "final" : "pending") as "final" | "pending",
        turnStatus: "completed" as const,
        taskStatus: (callCount > 1 ? "completed" : "in_progress") as "completed" | "in_progress",
      }),
      reset: () => {},
    };

    const res = await promptUntilAnswer({
      run: async () => {
        callCount += 1;
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "initial" }],
      followUp: (attempt) => [{ type: "text", text: continuationPrompt(attempt) }],
      activity,
      beforeContinuation: async (att) => {
        continuationAttempts.push(att);
      },
    });

    expect(continuationAttempts).toEqual([1]);
    expect(res.continuations).toBe(1);
    expect(res.stillUnfinished).toBe(false);
  });

  test("stops and marks timedOut when deadline is exceeded", async () => {
    const progress: TurnProgress = {
      usedTools: true,
      hasUserFacingText: false,
      hasFinalAnswer: false,
      hasAnswer: false,
      toolCalls: 1,
      answerStatus: "pending",
      turnStatus: "completed",
      taskStatus: "in_progress",
    };
    const activity = { snapshot: () => progress, reset: () => {} };

    const res = await promptUntilAnswer({
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { stopReason: "end_turn" };
      },
      first: [{ type: "text", text: "initial" }],
      followUp: (attempt) => [{ type: "text", text: continuationPrompt(attempt) }],
      activity,
      timeoutMs: 5,
    });

    expect(res.timedOut).toBe(true);
    expect(res.stillUnfinished).toBe(true);
  });
});

