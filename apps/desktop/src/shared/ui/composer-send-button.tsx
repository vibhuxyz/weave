import * as React from "react";
import { SendIcon, SquareIcon } from "lucide-react";

import { cn } from "@/shared/lib/cn";
import { Button, type ButtonProps } from "@/shared/ui/button";

/**
 * The primary send / stop control on the chat composer surface.
 *
 * Composes Button. Two states, driven by `state`:
 * - `"send"` — a quiet glass pill (`subtle`) with a paper-plane icon. The
 *   label is hidden while the composer is empty so the control reads as a
 *   single affordance; it slides in once there is something to send.
 * - `"stop"` — a filled destructive pill with a stop glyph, wrapped in a
 *   stack of staggered rings that expand outward and fade, plus two dots
 *   that orbit the button. The rings signal the agent is still working.
 *   All of the motion is disabled under `prefers-reduced-motion`.
 *
 * Use only as the composer's send/stop button. The recipe owns every
 * interactive and animated state so the composer chrome can't drift.
 */

const SEND_RECIPE =
  "bg-surface-composer-action text-foreground shadow-none hover:bg-surface-composer-action-hover hover:text-foreground active:bg-surface-composer-action-active active:text-foreground";

const STOP_RECIPE =
  "relative z-10 bg-destructive text-destructive-foreground shadow-[0_0_20px_-2px_var(--color-destructive)] hover:bg-destructive/90 hover:text-destructive-foreground active:bg-destructive/90";

export type ComposerSendButtonProps = Omit<
  ButtonProps,
  "variant" | "flush" | "destructive" | "size" | "children" | "leftIcon" | "rightIcon"
> & {
  state: "send" | "stop";
  /** Show the "Send" label. False keeps the button a single icon affordance. */
  showLabel?: boolean;
};

export const ComposerSendButton = React.forwardRef<
  HTMLButtonElement,
  ComposerSendButtonProps
>(({ className, state, showLabel = true, ...props }, ref) => {
  if (state === "stop") {
    return (
      <span className="relative inline-flex shrink-0 items-center justify-center">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="stop-ring absolute inset-0 rounded-full border border-destructive/50 animate-stop-ring motion-reduce:animate-none"
              style={{ animationDelay: `${i * 0.85}s` }}
            />
          ))}
          <span className="stop-orbit absolute -inset-2 animate-stop-orbit motion-reduce:animate-none">
            <span className="absolute left-1/2 top-0 size-1 -translate-x-1/2 rounded-full bg-destructive" />
            <span className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-destructive/60" />
          </span>
        </span>
        <Button
          ref={ref}
          type="button"
          variant="primary"
          size="sm"
          className={cn("rounded-full", STOP_RECIPE, className)}
          leftIcon={<SquareIcon className="size-3 fill-current" />}
          {...props}
        >
          Stop
        </Button>
      </span>
    );
  }

  return (
    <Button
      ref={ref}
      type="button"
      variant="subtle"
      size="sm"
      className={cn("rounded-full", SEND_RECIPE, className)}
      leftIcon={<SendIcon className="size-3.5" />}
      {...props}
    >
      <span
        className={cn(
          "overflow-hidden transition-[max-width,opacity,margin] duration-200 ease-out motion-reduce:transition-none",
          showLabel ? "ml-0.5 max-w-16 opacity-100" : "ml-0 max-w-0 opacity-0",
        )}
      >
        Send
      </span>
    </Button>
  );
});
ComposerSendButton.displayName = "ComposerSendButton";
