import { useState } from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Checkbox, Label, Spinner } from "@/shared/ui";
import type { ConsentLink } from "@/features/chat/hooks";

function ConsentLinks({ links }: { links: readonly ConsentLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          onClick={(event) => {
            event.preventDefault();
            void openUrl(link.url).catch(console.error);
          }}
          className="inline-flex cursor-pointer items-center gap-1 text-xs underline hover:opacity-80"
        >
          {link.label}
          <ExternalLink className="size-3" />
        </a>
      ))}
    </div>
  );
}

/**
 * The wizard's consent page, as a real form.
 *
 * The checkbox is seeded from the wizard's own default rather than a value
 * Weave prefers, and the full agreement is shown untruncated — this records a
 * data-sharing decision, so it should be read before it is clicked.
 */
export function SetupConsentCard({
  title,
  notice,
  agreement,
  checked,
  links,
  applying,
  onFinish,
  onUseTerminal,
}: {
  title: string | null;
  notice: string | null;
  agreement: string;
  checked: boolean;
  links: readonly ConsentLink[];
  applying: boolean;
  onFinish: (agreed: boolean) => void;
  onUseTerminal: () => void;
}) {
  const [agreed, setAgreed] = useState(checked);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-agent-border bg-agent-surface-base p-4">
      <span className="font-medium text-agent-text-bright text-sm">
        {title ?? "Terms & data use"}
      </span>

      {notice && (
        <div className="flex items-start gap-2 rounded-md border border-agent-border bg-agent-surface-raised p-2.5">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-agent-warn" />
          <span className="text-agent-text-muted text-xs leading-relaxed">{notice}</span>
        </div>
      )}

      <div className="flex items-start gap-2.5">
        <Checkbox
          id="setup-consent"
          checked={agreed}
          onCheckedChange={(next) => setAgreed(next === true)}
          disabled={applying}
          className="mt-0.5"
        />
        <Label
          htmlFor="setup-consent"
          className="text-agent-text text-xs leading-relaxed font-normal"
        >
          {agreement}
        </Label>
      </div>

      <ConsentLinks links={links} />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => onFinish(agreed)} disabled={applying}>
          {applying ? <Spinner className="size-3.5" /> : null}
          {applying ? "Finishing setup…" : "Finish setup"}
        </Button>
        <Button size="sm" variant="outline" onClick={onUseTerminal} disabled={applying}>
          Use the terminal instead
        </Button>
      </div>
    </div>
  );
}
