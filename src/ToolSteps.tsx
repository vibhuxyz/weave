import type { ToolKind } from "@agentclientprotocol/sdk";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  GlobeIcon,
  LightbulbIcon,
  PencilIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@/shared/ui/ai-elements/task";
import { cn } from "@/shared/lib/cn";
import type { ToolEntry } from "./useAcpChat";

/** ACP reports what a tool *does*, so the icon comes from `kind`, not a name map. */
const KIND_ICONS: Record<ToolKind, typeof WrenchIcon> = {
  read: FileTextIcon,
  edit: PencilIcon,
  delete: Trash2Icon,
  move: PencilIcon,
  search: SearchIcon,
  execute: TerminalIcon,
  think: LightbulbIcon,
  fetch: GlobeIcon,
  switch_mode: SettingsIcon,
  other: WrenchIcon,
};

/**
 * Refined titles carry absolute paths (`ls /Users/…/my-berd-app/src`).
 * Inside a project view the prefix is noise, so strip it for display only.
 */
function shorten(title: string, projectDir: string | null): string {
  if (!projectDir) return title;
  return title
    .replaceAll(projectDir + "/", "")
    .replaceAll(projectDir, ".")
    .trim();
}

function ToolRow({
  tool,
  projectDir,
}: {
  tool: ToolEntry;
  projectDir: string | null;
}) {
  const Icon = KIND_ICONS[tool.kind] ?? WrenchIcon;
  const running = tool.status === "in_progress" || tool.status === "pending";

  return (
    <TaskItem className="flex items-center gap-2">
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          tool.status === "failed" && "text-destructive",
          running && "animate-pulse",
        )}
      />
      <span
        className={cn(
          "truncate",
          tool.status === "failed" && "text-destructive",
          running && "text-foreground",
        )}
        title={tool.title}
      >
        {shorten(tool.title, projectDir)}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0 opacity-40" />
    </TaskItem>
  );
}

/**
 * Renders what the agent is doing, the way Berd does it: finished work folds
 * into one "N previous steps" line, and whatever is running stays visible.
 *
 * A flat list is unreadable once a turn touches a dozen files — which is the
 * whole reason the terminal output was hard to follow.
 */
export function ToolSteps({
  tools,
  projectDir,
}: {
  tools: ToolEntry[];
  projectDir: string | null;
}) {
  if (tools.length === 0) return null;

  const done = tools.filter(
    (tool) => tool.status === "completed" || tool.status === "failed",
  );
  const active = tools.filter(
    (tool) => tool.status === "in_progress" || tool.status === "pending",
  );

  return (
    <div className="flex flex-col gap-2">
      {done.length > 0 && (
        <Task defaultOpen={false}>
          <TaskTrigger title="">
            <div className="flex cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
              <span>
                {done.length} previous step{done.length === 1 ? "" : "s"}
              </span>
              <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
            </div>
          </TaskTrigger>
          <TaskContent>
            {done.map((tool) => (
              <ToolRow key={tool.id} tool={tool} projectDir={projectDir} />
            ))}
          </TaskContent>
        </Task>
      )}

      {/* Running work is never hidden behind a collapse. */}
      {active.map((tool) => (
        <ToolRow key={tool.id} tool={tool} projectDir={projectDir} />
      ))}
    </div>
  );
}
