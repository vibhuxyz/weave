import type { ComponentPropsWithoutRef, FormEvent, KeyboardEvent, ReactNode } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { ShortcutKey } from "./question/OptionRow";

interface BasePromptCardProps {
  className?: string;
  children?: ReactNode;
  role?: string;
  "aria-label"?: string;
  id?: string;
}

export type PromptCardProps =
  | ({ as: "form"; onSubmit?: (event: FormEvent<HTMLFormElement>) => void; onKeyDown?: (event: KeyboardEvent<HTMLFormElement>) => void } & BasePromptCardProps & Omit<ComponentPropsWithoutRef<"form">, "onSubmit" | "onKeyDown">)
  | ({ as?: "div"; onSubmit?: (event: FormEvent<HTMLDivElement>) => void; onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void } & BasePromptCardProps & Omit<ComponentPropsWithoutRef<"div">, "onSubmit" | "onKeyDown">)
  | ({ as: "section"; onSubmit?: (event: FormEvent<HTMLElement>) => void; onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void } & BasePromptCardProps & Omit<ComponentPropsWithoutRef<"section">, "onSubmit" | "onKeyDown">);

export function PromptCard({
  as = "div",
  className,
  children,
  ...props
}: PromptCardProps) {
  const cardClassName = cn(
    "dark flex w-full flex-col gap-3 rounded-2xl border border-agent-border bg-agent-surface-raised p-4 shadow-xl max-h-[min(540px,60vh)] overflow-y-auto",
    className,
  );

  if (as === "form") {
    return (
      <form className={cardClassName} {...(props as ComponentPropsWithoutRef<"form">)}>
        {children}
      </form>
    );
  }

  if (as === "section") {
    return (
      <section className={cardClassName} {...(props as ComponentPropsWithoutRef<"section">)}>
        {children}
      </section>
    );
  }

  return (
    <div className={cardClassName} {...(props as ComponentPropsWithoutRef<"div">)}>
      {children}
    </div>
  );
}

export interface PromptCardHeaderProps {
  readonly badge?: ReactNode;
  readonly badgeVariant?: "default" | "warn" | "accent" | "muted";
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly isCollapsed?: boolean;
  readonly onToggleCollapsed?: () => void;
  readonly onClose?: () => void;
  readonly closeDisabled?: boolean;
  readonly closeLabel?: string;
  readonly extra?: ReactNode;
  readonly className?: string;
}

export function PromptCardHeader({
  badge,
  badgeVariant = "default",
  icon,
  title,
  subtitle,
  isCollapsed,
  onToggleCollapsed,
  onClose,
  closeDisabled,
  closeLabel = "Dismiss",
  extra,
  className,
}: PromptCardHeaderProps) {
  const badgeClasses = {
    default: "bg-agent-surface-inset text-agent-text-muted border border-agent-border/60",
    warn: "bg-agent-warn-bg text-agent-warn",
    accent: "bg-primary/15 text-primary",
    muted: "bg-agent-surface-hover text-agent-text-faint",
  }[badgeVariant];

  const iconBtnClass =
    "rounded-md p-1 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text disabled:opacity-50";

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      {badge && (
        <span className={cn("mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums font-medium", badgeClasses)}>
          {badge}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h3 className="min-w-0 whitespace-pre-wrap font-semibold text-agent-text-strong text-sm leading-snug">
          {title}
        </h3>
        {subtitle && <div className="text-agent-text-muted text-xs">{subtitle}</div>}
      </div>
      {extra && <div className="flex shrink-0 items-center gap-1.5">{extra}</div>}
      {onToggleCollapsed && isCollapsed !== undefined && (
        <button
          type="button"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
          aria-expanded={!isCollapsed}
          onClick={onToggleCollapsed}
          className={iconBtnClass}
        >
          <ChevronDownIcon className={cn("size-4 transition-transform", isCollapsed && "-rotate-90")} />
        </button>
      )}
      {onClose && (
        <button
          type="button"
          aria-label={closeLabel}
          disabled={closeDisabled}
          onClick={onClose}
          className={iconBtnClass}
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

export function PromptCardBody({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("flex flex-col gap-3 min-h-0", className)}>{children}</div>;
}

export function PromptCardFooter({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <div className={cn("flex items-center justify-end gap-2 pt-1", className)}>{children}</div>;
}

export function PromptCardButton({
  variant = "secondary",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { readonly variant?: "primary" | "secondary" | "destructive" }) {
  const variantClass = {
    primary: "bg-agent-text-strong text-agent-surface-base hover:opacity-90 disabled:opacity-50",
    secondary: "bg-agent-surface-inset text-agent-text hover:bg-agent-surface-hover hover:text-agent-text-bright disabled:opacity-50",
    destructive: "bg-destructive/20 text-destructive border border-destructive/30 hover:bg-destructive/30 disabled:opacity-50",
  }[variant];

  return (
    <button
      type={props.type ?? "button"}
      className={cn(
        "rounded-lg px-3 py-1.5 font-medium text-sm transition-colors",
        variantClass,
        className,
      )}
      {...props}
    />
  );
}

export { ShortcutKey };
