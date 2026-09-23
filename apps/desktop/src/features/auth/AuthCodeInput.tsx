import { useId, useState } from "react";
import { ClipboardPaste, SendHorizontal } from "lucide-react";
import { Button, Input } from "@/shared/ui";

export interface AuthCodeInputProps {
  onSubmit: (code: string) => void;
}

export function AuthCodeInput({ onSubmit }: AuthCodeInputProps) {
  const inputId = useId();
  const [code, setCode] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const trimmedCode = code.trim();

  const submit = () => {
    if (!trimmedCode) return;
    onSubmit(trimmedCode);
    setCode("");
    setHasSubmitted(true);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
      <label
        htmlFor={inputId}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        <ClipboardPaste className="size-3.5" />
        <span>Authorization code</span>
      </label>
      <p className="text-xs text-muted-foreground">
        {hasSubmitted
          ? "Code sent. If sign-in does not finish, paste a fresh code."
          : "If the browser shows a code instead of returning here, paste it below."}
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Input
          id={inputId}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="4/0A…"
          autoComplete="off"
          spellCheck={false}
          className="h-9 flex-1 font-mono text-xs"
        />
        <Button type="submit" size="sm" disabled={!trimmedCode} className="gap-1.5">
          <SendHorizontal className="size-3.5" />
          <span>Submit</span>
        </Button>
      </form>
    </div>
  );
}
