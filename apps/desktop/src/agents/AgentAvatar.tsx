import { cn } from "@/shared/lib/cn";
import type { ProjectTone } from "../CreateProjectDialog";
import { resolveCharacter } from "./characters";

const SIZE = { sm: "size-10", md: "size-24", lg: "size-full", xl: "size-40" };

/**
 * An agent's visual identity — a bundled Berd character (poster frame from the
 * upstream avatar catalog), picked deterministically from `seed` (the agent
 * id, falling back to the name). An uploaded `icon` data-URI still overrides.
 *
 * `tint` is kept in the signature for call-site compatibility; the character
 * art carries its own colour so it is no longer used.
 */
export function AgentAvatar({
  name,
  seed,
  icon,
  size = "md",
  className,
}: {
  name: string;
  seed?: string;
  tint?: ProjectTone;
  icon?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className={cn(SIZE[size], "rounded-2xl object-cover", className)}
      />
    );
  }

  return (
    <img
      src={resolveCharacter(seed ?? name)}
      alt=""
      draggable={false}
      className={cn(SIZE[size], "object-contain", className)}
    />
  );
}
