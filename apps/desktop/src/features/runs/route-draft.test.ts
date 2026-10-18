import { describe, expect, it } from "bun:test";
import { routeDraft } from "./route-draft";
import type { DraftContext } from "./types";

const idle: DraftContext = {
  imageCount: 0,
  mentionCount: 0,
  isRunActive: false,
  multitask: false,
  stayInChat: false,
};

describe("routeDraft multitask", () => {
  it("sends the draft to the team when multitask is on", () => {
    expect(routeDraft("add a settings page", { ...idle, multitask: true })).toEqual({
      kind: "team",
      request: "add a settings page",
    });
  });

  it("keeps a message in this chat when stay-in-chat is set", () => {
    const route = routeDraft("add a settings page", { ...idle, multitask: true, stayInChat: true });
    expect(route).toEqual({ kind: "chat", text: "add a settings page", canHandOff: false });
  });

  it("keeps an @-mention in this chat", () => {
    expect(routeDraft("add a settings page", { ...idle, multitask: true, mentionCount: 1 }).kind).toBe("chat");
  });

  it("keeps the message in chat while a run is active", () => {
    expect(routeDraft("add a settings page", { ...idle, multitask: true, isRunActive: true }).kind).toBe("chat");
  });

  it("does not treat /parallel as a team command", () => {
    expect(routeDraft("/parallel add a settings page", { ...idle, multitask: true }).kind).toBe("chat");
  });
});
