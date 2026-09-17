import type { ToolCallStatus } from "@agentclientprotocol/sdk";
import type { ChatImageAttachment, ToolDiff } from "./types";

export const TERMINAL_STATUS = new Set<ToolCallStatus>(["completed", "failed"]);

/** Pull plain-text output out of an ACP tool call's `content` array. */
export function toolText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (item?.type === "content" && item.content?.type === "text") {
      parts.push(item.content.text);
    }
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

/** Pull the `{ type: "diff" }` entries out of an ACP tool call's `content`. */
export function toolDiffs(content: unknown): ToolDiff[] | undefined {
  if (!Array.isArray(content)) return undefined;
  const diffs: ToolDiff[] = [];
  for (const item of content) {
    if (item?.type !== "diff") continue;
    const path = typeof item.path === "string" ? item.path : undefined;
    if (!path || typeof item.newText !== "string") continue;
    diffs.push({
      path,
      oldText: typeof item.oldText === "string" ? item.oldText : null,
      newText: item.newText,
    });
  }
  return diffs.length > 0 ? diffs : undefined;
}

/**
 * Reconstruct a diff from an edit tool's arguments.
 *
 * Antigravity never sends `{ type: "diff" }` content — its edit calls put the
 * whole change in `rawInput` instead (`TargetFile` plus either
 * `TargetContent`/`ReplacementContent` for a region or `CodeContent` for a
 * whole-file write). Without this the diff panel had nothing to fold and every
 * agy refactor showed up as "no file changes".
 */
export function rawInputDiffs(rawInput: unknown): ToolDiff[] | undefined {
  if (typeof rawInput !== "object" || rawInput === null) return undefined;
  const raw = rawInput as Record<string, unknown>;
  const str = (key: string): string | undefined =>
    typeof raw[key] === "string" ? (raw[key] as string) : undefined;

  const path = str("TargetFile") ?? str("target_file") ?? str("file_path") ?? str("path");
  if (!path) return undefined;

  const replacement = str("ReplacementContent");
  if (replacement !== undefined) {
    const startLine = typeof raw.StartLine === "number" ? raw.StartLine : undefined;
    return [
      {
        path,
        oldText: str("TargetContent") ?? "",
        newText: replacement,
        // `StartLine` is what keeps the gutter honest: without it a region
        // edit at line 1147 would be numbered from 1.
        startLine: startLine && startLine > 0 ? startLine : undefined,
      },
    ];
  }

  const written = str("CodeContent");
  // A whole-file write reports no previous text, so it reads as a creation —
  // which is what it is for a new file, and the best available account of an
  // overwrite, since the engine never tells us what it replaced.
  if (written !== undefined) return [{ path, oldText: null, newText: written }];

  return undefined;
}

/** A path an engine wrote into the prompt for an attachment it saved. */
const ATTACHMENT_REF = /^@(\/\S+\.(?:png|jpe?g|gif|webp|bmp|svg))$/i;
/** The label `submit()` puts before each image, with that image's note. */
const ATTACHMENT_LABEL = /^Image\s+\d+:\s*(.*)$/;

/**
 * Pull a replayed prompt's attachments back out of its text.
 *
 * Engines echo a resumed prompt as plain text, so the composer's "Image 1:"
 * label and the engine's own `@/…/attachments/<uuid>.png` path arrive as part
 * of what the user "said" — which is how a screenshot ended up rendered as a
 * line of file path. The note stays with its image; a label with no path
 * following it was never an attachment and is left in the text.
 */
export function splitAttachments(text: string): {
  text: string;
  images: ChatImageAttachment[];
} {
  const kept: string[] = [];
  const images: ChatImageAttachment[] = [];
  let label: { line: string; note: string } | null = null;

  const flushLabel = () => {
    if (label) kept.push(label.line);
    label = null;
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const ref = trimmed.match(ATTACHMENT_REF);
    if (ref) {
      images.push({
        previewUrl: "",
        mimeType: "",
        prompt: label?.note ?? "",
        path: ref[1],
      });
      label = null;
      continue;
    }
    const labelled = trimmed.match(ATTACHMENT_LABEL);
    if (labelled) {
      flushLabel();
      label = { line, note: (labelled[1] ?? "").trim() };
      continue;
    }
    flushLabel();
    kept.push(line);
  }
  flushLabel();

  return { text: kept.join("\n").trim(), images };
}

/**
 * Reduce a sent prompt back to what the person typed: drop the
 * `<system>…</system>` persona preamble the composer prepends, the
 * `[Planning Mode]` wrapper `submit()` adds for `/plan`, and a leading
 * `/plan`. Used on replay and for the optimistic turn.
 */
export function stripSystemPreamble(text: string): string {
  let out = text.replace(/^\/plan\s+/, "");

  const sysEnd = out.indexOf("\n</system>\n\n");
  if (out.startsWith("<system>\n") && sysEnd !== -1) {
    out = out.slice(sysEnd + "\n</system>\n\n".length);
  }

  if (out.startsWith("[Planning Mode]\n")) {
    const taskStart = out.indexOf("\n\n");
    out = taskStart !== -1 ? out.slice(taskStart + 2) : "Plan this.";
  }

  return out.trim();
}
