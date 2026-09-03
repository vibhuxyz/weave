import * as React from "react";

import { cn } from "@/shared/lib/cn";
import { Button, type ButtonProps } from "@/shared/ui/button";

/**
 * Floating "return to newest content" pill shown over the chat transcript
 * when the user has scrolled up. Ported from berd's `jump-to-latest-button`.
 *
 * Composes Button `primary` for role/geometry/focus, then swaps the fill to
 * the responding-pill surface tokens and adds the chat shadow so it floats.
 */
const JUMP_TO_LATEST_RECIPE =
  "select-none bg-surface-chat-responding-pill-bg text-surface-chat-responding-pill-fg shadow-[var(--shadow-chat)] hover:bg-surface-chat-responding-pill-bg hover:opacity-90";

export type JumpToLatestButtonProps = Omit<ButtonProps, "variant">;

export const JumpToLatestButton = React.forwardRef<
  HTMLButtonElement,
  JumpToLatestButtonProps
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    variant="primary"
    className={cn(JUMP_TO_LATEST_RECIPE, "rounded-full", className)}
    {...props}
  />
));
JumpToLatestButton.displayName = "JumpToLatestButton";
