import type { GitStatus } from "../../../server/index.ts";
import type { ActivityItem, AgentBlock } from "../normalize/types";
import { FileChangeBlock } from "./FileChangeBlock";

export type AgentTab = "overview" | "activity" | "files" | "git";

export function tabBlocks(options: {
  tab: AgentTab;
  overview: AgentBlock[];
  activity: ActivityItem[];
  git: GitStatus;
}): AgentBlock[] {
  if (options.tab === "overview") return options.overview;
  if (options.tab === "activity") {
    return options.activity.map((item) => ({
      id: `activity-block-${item.id}`,
      schemaVersion: 1,
      sourceEventIds: item.sourceEventIds,
      sourceSeq: item.sourceSeq,
      type: "tool",
      tool: {
        id: item.id,
        title: item.label,
        status: item.status,
        kind: item.kind,
        sourceEventIds: item.sourceEventIds,
        sourceSeq: item.sourceSeq,
      },
    }));
  }
  if (options.tab === "files") {
    return [
      {
        id: "files-tab",
        schemaVersion: 1,
        type: "file-change",
        files: options.git.changes.map((change) => ({
          path: change.path,
          status: change.code.trim() || "modified",
        })),
      },
    ];
  }
  return [
    {
      id: "git-tab",
      schemaVersion: 1,
      type: "file-change",
      files: [
        {
          path: `Branch: ${options.git.branch ?? "not a git repo"}`,
          status: "git",
        },
        ...options.git.changes.map((change) => ({
          path: change.path,
          status: change.code.trim() || "modified",
        })),
      ],
    },
  ];
}

export { FileChangeBlock };

