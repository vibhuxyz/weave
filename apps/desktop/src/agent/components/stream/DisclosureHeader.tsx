import type { ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/shared/lib";

export function DisclosureHeader({
  open,
  onToggle,
  isDisabled = false,
  className,
  children,
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly isDisabled?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const Chevron = open ? ChevronDownIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-expanded={open}
      disabled={isDisabled}
      onClick={onToggle}
      className={cn("flex max-w-full items-center gap-1.5 text-left text-agent-text-faint text-sm transition-colors hover:text-agent-text-muted disabled:hover:text-agent-text-faint", className)}
    >
      <span className="min-w-0 truncate">{children}</span>
      {!isDisabled && <Chevron className="size-3.5 shrink-0" />}
    </button>
  );
}
