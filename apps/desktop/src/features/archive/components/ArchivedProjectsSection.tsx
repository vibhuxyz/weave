import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { SettingsRow, SettingsSection } from "@/shared/ui";
import { ROUNDED_LIST_CLASS } from "../constants";
import { formatArchivedDate } from "../lib";
import type { ArchiveProject } from "../types";
import { ArchiveRowActions } from "./ArchiveRowActions";

interface ArchivedProjectsSectionProps {
  readonly projects: readonly ArchiveProject[];
  readonly activeDir: string | undefined;
  readonly onRestore: (dir: string) => void;
  readonly onDelete: (project: ArchiveProject) => void;
}

export function ArchivedProjectsSection({ projects, activeDir, onRestore, onDelete }: ArchivedProjectsSectionProps) {
  if (projects.length === 0) {
    return (
      <SettingsSection title="Archived projects">
        <p className="py-4 text-xs text-muted-foreground">Archived projects will show here.</p>
      </SettingsSection>
    );
  }
  return (
    <SettingsSection title="Archived projects" contentClassName={`divide-y divide-border ${ROUNDED_LIST_CLASS}`}>
      {projects.map((project) => (
        <SettingsRow
          key={project.dir}
          className="pr-0"
          leading={<DefaultProjectGlyphIcon color={project.tint} className="size-4" />}
          label={project.name}
          description={[project.dir, formatArchivedDate(project.archivedAt)].filter(Boolean).join(" · ")}
          action={
            <ArchiveRowActions
              label={project.name}
              onRestore={() => onRestore(project.dir)}
              onDelete={() => onDelete(project)}
              deleteBlockedReason={project.dir === activeDir ? "Switch to another project before deleting this one" : undefined}
            />
          }
        />
      ))}
    </SettingsSection>
  );
}
