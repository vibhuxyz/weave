import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { SearchIcon } from "lucide-react";
import { FIELD } from "@/features/projects/components";
import { cn } from "@/shared/lib";
import { useSkillListing } from "../hooks";
import { filterSkills } from "../lib";
import type { SkillListing, SkillView } from "../types";
import { MAX_SKILLS_SHOWN } from "./constants";
import { SkillCard } from "./SkillCard";
import { UnknownSkills } from "./UnknownSkills";

interface SkillLibraryProps {
  readonly hasProject: boolean;
  readonly onOpenEmployee: (employeeId: string) => void;
  readonly onRefresh: () => void;
}

const NOTICE = "rounded-xl border border-border/50 border-dashed p-6 text-center text-muted-foreground text-sm";

function StatusNotice({ listing, hasProject }: { readonly listing: Exclude<SkillListing, { status: "ready" }>; readonly hasProject: boolean }) {
  switch (listing.status) {
    case "idle":
      return <p className={NOTICE}>{hasProject ? "Connecting to the project…" : "Open a project to see its skills."}</p>;
    case "loading":
      return <p role="status" className={NOTICE}>Loading skills…</p>;
    case "error":
      return <p role="alert" className={cn(NOTICE, "text-destructive")}>{listing.message}</p>;
    default: {
      const exhaustive: never = listing;
      return exhaustive;
    }
  }
}

function SkillList({ skills, onOpenEmployee }: { readonly skills: readonly SkillView[]; readonly onOpenEmployee: (employeeId: string) => void }) {
  const shown = skills.slice(0, MAX_SKILLS_SHOWN);
  const hidden = skills.length - shown.length;
  if (skills.length === 0) return <p className={NOTICE}>No skill matches that search.</p>;
  return (
    <div className="space-y-2">
      {shown.map((skill) => <SkillCard key={skill.id} skill={skill} onOpenEmployee={onOpenEmployee} />)}
      {hidden > 0 && <p className="text-center text-muted-foreground text-xs">(+{hidden} more, narrow the search)</p>}
    </div>
  );
}

export function SkillLibrary({ hasProject, onOpenEmployee, onRefresh }: SkillLibraryProps) {
  const listing = useSkillListing();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const searchId = useId();
  const skills = listing.status === "ready" ? listing.skills : null;
  const filtered = useMemo(() => (skills ? filterSkills(skills, deferredQuery) : []), [skills, deferredQuery]);

  useEffect(() => {
    onRefresh();
  }, [onRefresh]);

  if (listing.status !== "ready") return <StatusNotice listing={listing} hasProject={hasProject} />;
  return (
    <div className="space-y-4">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">Search skills</label>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, trigger or employee"
          className={cn(FIELD, "h-11 pl-10")}
        />
      </div>
      <UnknownSkills skills={listing.unknownSkills} />
      <SkillList skills={filtered} onOpenEmployee={onOpenEmployee} />
    </div>
  );
}
