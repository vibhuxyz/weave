import { useEffect, useRef } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { EngineAuthMethod, EngineAuthOperation } from "@weave/protocol";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

/**
 * "This engine needs you to sign in" — with something to click.
 *
 * The engine refuses `session/new` and reports a sentence. On its own that is
 * a dead end, which is exactly what shipped before: a red toast reading
 * "Authentication required: By continuing, you agree to …". The engine also
 * told us how to fix it, in `authMethods`; this renders that.
 *
 * The output pane is the point, not decoration. A terminal sign-in prints a
 * verification URL and a device code, and the user has to be able to read and
 * copy them — so both are lifted out of the stream and shown on their own.
 */

const DEVICE_CODE = /\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}\b/;
const URL_IN_LINE = /https?:\/\/[^\s"'<>)]+/;
/** Only treat a code as a code when the surrounding text says it is one. */
const CODE_CONTEXT =
  /\b(auth|authoriz|code|copy|device|enter|login|sign|verif|paste)\b/i;

function findDeviceCode(lines: string[]): string | null {
  if (!lines.some((line) => CODE_CONTEXT.test(line))) return null;
  for (const line of lines) {
    const match = line.toUpperCase().match(DEVICE_CODE);
    if (match?.[0]) return match[0];
  }
  return null;
}

function findUrl(lines: string[]): string | null {
  for (const line of lines) {
    const match = line.match(URL_IN_LINE);
    // Trailing punctuation is part of the sentence, not of the link.
    if (match?.[0]) return match[0].replace(/[.,;:]+$/, "");
  }
  return null;
}

interface EngineAuthPanelProps {
  engineLabel: string;
  message: string;
  methods: EngineAuthMethod[];
  operation: EngineAuthOperation | null;
  onStart: (methodId: string) => void;
  onCancel: () => void;
  onDismiss: () => void;
}

export function EngineAuthPanel({
  engineLabel,
  message,
  methods,
  operation,
  onStart,
  onCancel,
  onDismiss,
}: EngineAuthPanelProps) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const scrollRef = useRef<HTMLDivElement>(null);
  const output = operation?.output ?? [];
  const running = operation?.status === "running";
  const deviceCode = findDeviceCode(output);
  const url = findUrl(output);

  // Follow the tail: the newest line is the one being waited on.
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [output.length]);

  // An engine with no advertised method cannot be signed into from here.
  // Say so plainly rather than rendering a button that does nothing.
  const actionable = methods.filter((method) => method.kind !== "env_var");
  const envVarOnly = methods.length > 0 && actionable.length === 0;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-3 py-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {engineLabel} needs you to sign in
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
            {message}
          </p>
        </div>
        {!running && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={onDismiss}
          >
            Dismiss
          </Button>
        )}
      </div>

      {envVarOnly && (
        <p className="text-xs text-muted-foreground">
          {engineLabel} reads its credentials from the environment. Set them,
          then reopen Weave.
        </p>
      )}

      {deviceCode && (
        <div className="rounded-sm border border-border bg-background px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">
                Enter this code
              </p>
              <p className="mt-1 break-all font-mono text-base leading-6 text-foreground">
                {deviceCode}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => copyToClipboard(deviceCode)}
            >
              {isCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {isCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              {url}
            </a>
          )}
        </div>
      )}

      {output.length > 0 && (
        <div
          ref={scrollRef}
          className="max-h-32 overflow-y-auto rounded-sm bg-background px-2.5 py-2 font-mono text-xs leading-relaxed text-muted-foreground"
        >
          {output.map((line, index) => (
            // Output lines have no id and repeat freely, so the index is the
            // only stable key — and the list is append-only, so it is a safe one.
            <div key={index}>{line || " "}</div>
          ))}
        </div>
      )}

      {operation?.error && (
        <p className="text-xs text-destructive">{operation.error}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <>
            <Spinner className="size-4" />
            <span className="text-xs text-muted-foreground">
              {operation?.phase === "verifying"
                ? "Checking the sign-in…"
                : "Waiting for you to finish signing in…"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </>
        ) : (
          actionable.map((method) => (
            <Button
              key={method.id}
              type="button"
              size="sm"
              onClick={() => onStart(method.id)}
              title={method.description ?? undefined}
            >
              {method.name}
            </Button>
          ))
        )}
      </div>
    </div>
  );
}
