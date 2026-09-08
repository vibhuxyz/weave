import { useEffect, useState } from "react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/ui/dialog";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Badge } from "@/shared/ui/badge";
import { Prose } from "./Prose";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  X,
  ListOrdered,
} from "lucide-react";
import type { PlanBlockEntry } from "../normalize/types";

interface PlanApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full plan markdown (ExitPlanMode-style). Rendered and edited verbatim. */
  markdown?: string;
  /** Fallback step list (ACP todo-list plans, which carry no markdown). */
  entries: PlanBlockEntry[];
  engineLabel?: string;
  onApprove: (approved: { markdown?: string; entries: PlanBlockEntry[] }, note?: string) => void;
  onReject: (feedback?: string) => void;
}

export function PlanApprovalModal({
  open,
  onOpenChange,
  markdown,
  entries: initialEntries,
  engineLabel,
  onApprove,
  onReject,
}: PlanApprovalModalProps) {
  const isMarkdown = typeof markdown === "string";
  const [items, setItems] = useState<PlanBlockEntry[]>(initialEntries);
  const [draft, setDraft] = useState(markdown ?? "");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setItems(
        initialEntries.length > 0
          ? initialEntries
          : [{ id: "step-1", content: "", priority: "medium", status: "pending" }],
      );
      setDraft(markdown ?? "");
      setEditing(false);
      setNote("");
    }
  }, [open, initialEntries, markdown]);

  const updateContent = (index: number, content: string) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, content } : item)));
  const updatePriority = (index: number, priority: "low" | "medium" | "high") =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, priority } : item)));
  const moveItem = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));
  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: `step-${Date.now()}`, content: "", priority: "medium", status: "pending" },
    ]);

  const handleApprove = () => {
    if (isMarkdown) {
      onApprove({ markdown: draft.trim(), entries: [] }, note.trim() || undefined);
    } else {
      onApprove(
        { entries: items.filter((i) => i.content.trim().length > 0) },
        note.trim() || undefined,
      );
    }
    onOpenChange(false);
  };

  const handleReject = () => {
    onReject(note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="xl"
        positionerClassName="items-start p-0"
        className="mx-auto h-[100dvh] max-h-[100dvh] w-full max-w-none rounded-none border-x-0 border-t-0 sm:h-[92dvh] sm:max-h-[92dvh] sm:max-w-3xl sm:rounded-b-xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ListOrdered className="size-5 text-agent-accent" />
            <DialogTitle>Review Execution Plan</DialogTitle>
            {engineLabel && (
              <Badge variant="outline" className="font-mono text-xs">
                {engineLabel}
              </Badge>
            )}
            <div className="ml-auto">
              {isMarkdown && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing((v) => !v)}
                  className="gap-1.5"
                >
                  <Pencil className="size-3.5" />
                  {editing ? "Preview" : "Edit"}
                </Button>
              )}
            </div>
          </div>
          <DialogDescription>
            Review the plan before the agent starts.{" "}
            {isMarkdown
              ? "Hit Edit to change anything, then approve or reject."
              : "Edit descriptions, reorder, or add steps."}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex-1 space-y-4 overflow-y-auto pr-1">
          {isMarkdown ? (
            editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                className="min-h-[50vh] w-full resize-y rounded-lg border border-border/70 bg-card p-3 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-agent-accent/50"
              />
            ) : (
              <div className="rounded-lg border border-border/70 bg-card/60 px-4 py-3">
                <Prose size="xs">{draft || "_No plan details._"}</Prose>
              </div>
            )
          ) : (
            <>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-card p-2.5 transition-colors focus-within:border-agent-accent/50"
                  >
                    <span className="mt-1 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Input
                        value={item.content}
                        onChange={(e) => updateContent(idx, e.target.value)}
                        placeholder={`Step ${idx + 1} description...`}
                        className="h-8 text-sm"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          Priority:
                        </span>
                        {(["low", "medium", "high"] as const).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updatePriority(idx, p)}
                            className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                              item.priority === p
                                ? p === "high"
                                  ? "bg-destructive/20 font-semibold text-destructive"
                                  : p === "medium"
                                    ? "bg-amber-500/20 font-semibold text-amber-500"
                                    : "bg-muted font-semibold text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 pt-1">
                      <Button variant="ghost" size="icon-xxs" disabled={idx === 0} onClick={() => moveItem(idx, "up")} title="Move up">
                        <ArrowUp className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xxs" disabled={idx === items.length - 1} onClick={() => moveItem(idx, "down")} title="Move down">
                        <ArrowDown className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon-xxs" onClick={() => removeItem(idx)} title="Remove step" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full gap-1.5 border-dashed">
                <Plus className="size-3.5" />
                Add Step
              </Button>
            </>
          )}

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-muted-foreground">
              Additional instructions / rejection reason (optional):
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. run typecheck after step 2 — or why you’re rejecting…"
              className="text-xs"
            />
          </div>
        </DialogBody>

        <DialogFooter className="flex items-center justify-between gap-2 border-t pt-3 sm:justify-between">
          <Button
            type="button"
            variant="alert"
            size="sm"
            onClick={handleReject}
            className="gap-1.5 text-destructive hover:bg-destructive/10"
          >
            <X className="size-3.5" />
            Reject Plan
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={handleApprove} className="gap-1.5">
            <Check className="size-3.5" />
            Approve &amp; Execute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
