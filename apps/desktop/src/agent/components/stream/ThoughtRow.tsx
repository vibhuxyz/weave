import { useState } from "react";
import { Prose } from "../Prose";
import { DisclosureHeader } from "./DisclosureHeader";

export function ThoughtRow({ text }: { readonly text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <DisclosureHeader open={open} onToggle={() => setOpen((value) => !value)}>
        Thought
      </DisclosureHeader>
      {open && (
        <div className="border-agent-border border-l pl-3 text-agent-text-muted text-sm">
          <Prose>{text}</Prose>
        </div>
      )}
    </div>
  );
}
