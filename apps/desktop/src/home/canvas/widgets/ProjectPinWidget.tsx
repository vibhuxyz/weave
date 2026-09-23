import { memo } from "react";
import { basename } from "@/features/projects/lib";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { useProjects } from "@/features/projects/hooks";
import { useWidgetActivationGuard } from "./useWidgetActivationGuard";
import type { WidgetRenderProps } from "./types";

function projectDirOf(state: Record<string, unknown> | undefined): string | null {
  return typeof state?.projectDir === "string" ? state.projectDir : null;
}

export const ProjectPinWidget = memo(function ProjectPinWidget({
  instance,
  shouldIgnoreActivation,
  onOpenProject,
}: WidgetRenderProps) {
  const { projects } = useProjects();
  const projectDir = projectDirOf(instance.state);
  const project = projectDir ? projects.find((entry) => entry.dir === projectDir) : undefined;
  const label = project?.name || (projectDir ? basename(projectDir) : "Project");

  const handleClick = useWidgetActivationGuard(shouldIgnoreActivation, () => {
    if (projectDir) onOpenProject?.(projectDir);
  });

  return (
    <div className="pointer-events-none flex h-full w-full items-center justify-center text-foreground">
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Open project ${label}`}
        className="pointer-events-auto flex h-full w-full flex-col items-center justify-center gap-3 rounded-3xl border border-border/60 bg-card/80 p-4 shadow-lg backdrop-blur-md transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <DefaultProjectGlyphIcon color={project?.tint} className="size-1/2 max-h-24 max-w-24" />
        <span className="max-w-full truncate text-sm font-medium">{label}</span>
      </button>
    </div>
  );
});
