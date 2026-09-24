import type { EmployeeListing } from "@/features/employees";
import { MAX_SKIPPED_SHOWN } from "./constants";

const NOTICE = "mb-6 rounded-xl border border-border/60 bg-card/60 px-4 py-3 text-sm";

function SkippedFiles({ skipped }: { readonly skipped: Extract<EmployeeListing, { status: "ready" }>["skipped"] }) {
  const shown = skipped.slice(0, MAX_SKIPPED_SHOWN);
  const hidden = skipped.length - shown.length;
  return (
    <div className={NOTICE} role="status">
      <p className="text-foreground">
        {skipped.length === 1 ? "1 employee file was skipped" : `${skipped.length} employee files were skipped`}
      </p>
      <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
        {shown.map((item) => (
          <li key={`${item.sourcePath}:${item.reason}`} className="break-words">
            <span className="font-mono">{item.sourcePath}</span>: {item.reason}
          </li>
        ))}
        {hidden > 0 && <li>(+{hidden} more)</li>}
      </ul>
    </div>
  );
}

export function ListingNotice({ listing, hasProject }: { readonly listing: EmployeeListing; readonly hasProject: boolean }) {
  switch (listing.status) {
    case "idle":
      return (
        <p className={NOTICE}>
          {hasProject
            ? "Connecting to the project. Showing the built-in employees until it answers."
            : "Open a project to see its employees and customize them. These are the built-in employees."}
        </p>
      );
    case "loading":
      return <p className={NOTICE} role="status">Loading this project's employees…</p>;
    case "error":
      return <p className={NOTICE} role="alert">{listing.message}</p>;
    case "ready":
      return listing.skipped.length > 0 ? <SkippedFiles skipped={listing.skipped} /> : null;
    default: {
      const exhaustive: never = listing;
      return exhaustive;
    }
  }
}
