import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import * as acp from "@agentclientprotocol/sdk";
import type { SessionUpdate, TaskContract } from "@weave/protocol";
import {
  firstMatch,
  isInside,
  isPlanModeExit,
  relativeInside,
  toAcpResponse,
  type PermissionPolicy,
} from "../permissions/index.ts";
import type { SessionSink } from "./types.ts";

function sliceFileLines(
  text: string,
  line: number | null | undefined,
  limit: number | null | undefined,
): string {
  if (line == null && limit == null) return text;
  const lines = text.split("\n");
  const start = Math.max(0, (line ?? 1) - 1);
  const end = limit == null ? undefined : start + limit;
  return lines.slice(start, end).join("\n");
}

function notifyPlanModeExit(
  sink: SessionSink,
  params: acp.RequestPermissionRequest,
  replaying: boolean,
): void {
  const raw = params.toolCall.rawInput as Record<string, unknown> | undefined;
  const planText =
    typeof raw?.plan === "string"
      ? raw.plan
      : typeof raw?.content === "string"
        ? raw.content
        : null;

  if (planText) {
    sink.onUpdate(
      {
        sessionUpdate: "tool_call",
        toolCallId: params.toolCall.toolCallId ?? "exit-plan-mode",
        title: "Approve Plan",
        kind: "other",
        status: "failed",
        rawInput: { plan: planText },
        content: [
          { type: "content", content: { type: "text", text: planText } },
        ],
      } as SessionUpdate,
      replaying,
    );
  }
}

export class SessionClient implements acp.Client {
  readonly task: TaskContract;
  readonly sink: SessionSink;
  readonly policy: PermissionPolicy;
  readonly written = new Set<string>();
  replaying = false;

  constructor(task: TaskContract, sink: SessionSink, policy: PermissionPolicy) {
    this.task = task;
    this.sink = sink;
    this.policy = policy;
  }

  private safeResolve(requestedPath: string, mode: "read" | "write"): string {
    const absolute = isAbsolute(requestedPath)
      ? requestedPath
      : resolve(this.task.cwd, requestedPath);
    if (!isInside(this.task.cwd, absolute)) {
      throw new Error(`Refused path outside the task dir: ${requestedPath}`);
    }

    if (mode === "write" && this.task.readOnlyPaths?.length) {
      const rel = relativeInside(this.task.cwd, absolute);
      const pattern = rel === null ? null : firstMatch(this.task.readOnlyPaths, rel);
      if (pattern) {
        throw new Error(
          `Refused write to read-only path: ${rel} (matches "${pattern}")`,
        );
      }
    }
    return absolute;
  }

  async requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse> {
    const decision = await Promise.resolve(this.policy(this.task, params));

    if (isPlanModeExit(params)) {
      notifyPlanModeExit(this.sink, params, this.replaying);
    }

    this.sink.onPermission(
      params.toolCall.title ?? params.toolCall.toolCallId ?? "tool call",
      params.options.map((option) => ({
        optionId: option.optionId,
        name: option.name,
        kind: option.kind,
      })),
      decision.decision === "allow"
        ? { decision: "allow", optionId: decision.optionId, reason: decision.reason }
        : { decision: "reject", reason: decision.reason },
    );
    return toAcpResponse(decision);
  }

  async sessionUpdate(params: acp.SessionNotification): Promise<void> {
    this.sink.onUpdate(params.update, this.replaying);
  }

  async readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse> {
    const path = this.safeResolve(params.path, "read");
    const text = await readFile(path, "utf8");
    this.sink.onFileRead(path);
    return { content: sliceFileLines(text, params.line, params.limit) };
  }

  async writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse> {
    const path = this.safeResolve(params.path, "write");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, params.content, "utf8");
    this.written.add(path);
    this.sink.onFileWritten(path, Buffer.byteLength(params.content, "utf8"));
    return {};
  }
}
