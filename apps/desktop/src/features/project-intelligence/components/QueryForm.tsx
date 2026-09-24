import { useId, useState, type FormEvent } from "react";
import { SearchIcon } from "lucide-react";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";

const MAX_QUERY_CHARS = 500;

interface QueryFormProps {
  readonly isDisabled: boolean;
  readonly isSearching: boolean;
  readonly onSearch: (text: string) => void;
}

export function QueryForm({ isDisabled, isSearching, onSearch }: QueryFormProps) {
  const [text, setText] = useState("");
  const inputId = useId();
  const trimmed = text.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (trimmed) onSearch(trimmed);
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor={inputId} className="sr-only">Describe a change or ask about the code</label>
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          value={text}
          maxLength={MAX_QUERY_CHARS}
          onChange={(event) => setText(event.target.value)}
          placeholder="e.g. Change the seller payout API"
          className={cn(FIELD, "h-11 pl-10")}
          disabled={isDisabled}
        />
      </div>
      <Button type="submit" size="sm" className="h-11 rounded-xl px-5" disabled={isDisabled || isSearching || !trimmed}>
        {isSearching ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}
