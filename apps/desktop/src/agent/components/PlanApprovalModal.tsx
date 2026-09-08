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
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  Trash2,
  X,
  ListOrdered,
} from "lucide-react";
import type { PlanBlockEntry } from "../normalize/types";

interface PlanApprovalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: PlanBlockEntry[];
  engineLabel?: string;
  onApprove: (approvedEntries: PlanBlockEntry[], note?: string) => void;
  onReject: (feedback?: string) => void;
}

export function PlanApprovalModal({
  open,
  onOpenChange,
  entries: initialEntries,
  engineLabel,
  onApprove,
  onReject,
}: PlanApprovalModalProps) {
  const [items, setItems] = useState<PlanBlockEntry[]>(initialEntries);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      setItems(initialEntries.length > 0 ? initialEntries : [
        { id: "step-1", content: "", priority: "medium", status: "pending" },
      ]);
      setNote("");
    }
  }, [open, initialEntries]);

  const updateContent = (index: number, content: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, content } : item)),
    );
  };

  const updatePriority = (
    index: number,
    priority: "low" | "medium" | "high",
  ) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, priority } : item)),
    );
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `step-${Date.now()}`,
        content: "",
        priority: "medium",
        status: "pending",
      },
    ]);
  };

  const handleApprove = () => {
    const cleaned = items.filter((i) => i.content.trim().length > 0);
    onApprove(cleaned, note.trim() || undefined);
    onOpenChange(false);
  };

  const handleReject = () => {
    onReject(note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ListOrdered className="size-5 text-agent-accent" />
            <DialogTitle>Review Execution Plan</DialogTitle>
            {engineLabel && (
              <Badge variant="outline" className="text-xs font-mono">
                {engineLabel}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Review and fine-tune each step before the agent begins executing.
            You can edit descriptions, reorder tasks, or add new steps.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div
                key={item.id || idx}
                className="flex items-start gap-2.5 rounded-lg border border-border/70 bg-card p-2.5 transition-colors focus-within:border-agent-accent/50"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs text-muted-foreground mt-1">
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
                    <span className="text-[10px] text-muted-foreground uppercase font-mono tracking-wider">
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
                              ? "bg-destructive/20 text-destructive font-semibold"
                              : p === "medium"
                                ? "bg-amber-500/20 text-amber-500 font-semibold"
                                : "bg-muted text-foreground font-semibold"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1 pt-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-xxs"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, "up")}
                    title="Move up"
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xxs"
                    disabled={idx === items.length - 1}
                    onClick={() => moveItem(idx, "down")}
                    title="Move down"
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xxs"
                    onClick={() => removeItem(idx)}
                    title="Remove step"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addItem}
            className="w-full gap-1.5 border-dashed"
          >
            <Plus className="size-3.5" />
            Add Step
          </Button>

          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-muted-foreground">
              Additional Instructions / Feedback (optional):
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Remember to run typecheck after step 2, or explain rejection reason..."
              className="text-xs"
            />
          </div>
        </DialogBody>

        <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 border-t pt-3">
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

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleApprove}
              className="gap-1.5"
            >
              <Check className="size-3.5" />
              Approve & Execute
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
