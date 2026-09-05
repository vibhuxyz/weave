import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  BoxIcon,
  CheckIcon,
  FolderPlusIcon,
  PlusIcon,
  UploadIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/shared/ui/sheet";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { basename, tildeHome } from "./paths";
import type { ProjectAgent, ProjectEntry, ProjectMeta } from "./useProjects";
import { useAgents } from "./useAgents";
import { ProjectAgentsPicker } from "./agents/ProjectAgentsPicker";

/** berd's pill-tone palette (names resolve to `bg-pill-*` / `--color-pill-*`). */
export const PROJECT_TONES = [
  "pink",
  "lavender",
  "blue",
  "sage",
  "olive",
  "mint",
  "peach",
] as const;
export type ProjectTone = (typeof PROJECT_TONES)[number];

/** Tone name → the live CSS variable, so the stylesheet stays the source of truth. */
export function toneColor(tone: string | undefined): string | undefined {
  return tone && (PROJECT_TONES as readonly string[]).includes(tone)
    ? `var(--color-pill-${tone})`
    : undefined;
}

// Static so Tailwind's JIT scanner sees each class.
const TONE_BG: Record<ProjectTone, string> = {
  pink: "bg-pill-pink",
  lavender: "bg-pill-lavender",
  blue: "bg-pill-blue",
  sage: "bg-pill-sage",
  olive: "bg-pill-olive",
  mint: "bg-pill-mint",
  peach: "bg-pill-peach",
};

export const FIELD =
  "w-full rounded-lg border border-white/5 bg-black/25 px-3.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-white/15";
export const LABEL = "text-muted-foreground text-xs";

export interface CreateProjectInput extends ProjectMeta {
  dir: string;
}

export function CreateProjectDialog({
  open: isOpen,
  onOpenChange,
  onCreate,
  onPreviewTint,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreateProjectInput) => void;
  /** Live-preview the picked colour on the workspace behind the sheet. */
  onPreviewTint?: (color: string | undefined) => void;
  /** An existing project to edit; null to create. */
  editing?: ProjectEntry | null;
}) {
  const { agents } = useAgents();
  const [dir, setDir] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [tone, setTone] = useState<ProjectTone>("blue");
  const [icon, setIcon] = useState<string | undefined>();
  const [notes, setNotes] = useState("");
  const [projectAgents, setProjectAgents] = useState<ProjectAgent[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const tint = toneColor(tone)!;

  useEffect(() => {
    if (!isOpen) return;
    setDir(editing?.dir ?? null);
    setName(editing?.name ?? (editing ? basename(editing.dir) : ""));
    setTone((editing?.tint as ProjectTone) ?? "blue");
    setIcon(editing?.icon);
    setNotes(editing?.notes ?? "");
    setProjectAgents(editing?.agents ?? []);
  }, [isOpen, editing]);

  // Preview the selection on the workspace while the sheet is open.
  useEffect(() => {
    onPreviewTint?.(isOpen ? toneColor(tone) : undefined);
  }, [isOpen, tone, onPreviewTint]);
  useEffect(() => () => onPreviewTint?.(undefined), [onPreviewTint]);

  const chooseFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === "string") {
      setDir(picked);
      if (!name.trim()) setName(basename(picked));
    }
  };

  const chooseIcon = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setIcon(String(reader.result));
    reader.readAsDataURL(file);
  };

  const canCreate = Boolean(dir && name.trim());

  const submit = () => {
    if (!dir || !canCreate) return;
    onCreate({
      dir,
      name: name.trim(),
      tint: tone,
      icon,
      notes: notes.trim() || undefined,
      agents: projectAgents.length ? projectAgents : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        style={
          {
            "--project-tint": tint,
            backgroundColor: `color-mix(in oklch, ${tint} 11%, var(--card))`,
          } as CSSProperties
        }
        className="inset-y-3 right-3 h-auto w-[calc(100vw-1.5rem)] gap-0 overflow-hidden rounded-3xl border border-white/10 p-0 shadow-[0_22px_72px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-colors duration-500 sm:w-[520px] sm:max-w-none"
        closeButtonClassName="top-5 right-5"
      >
        <div className="flex items-center px-7 pt-5 pb-2">
          <SheetTitle className="text-sm font-normal text-foreground">
            {editing ? "Edit project" : "Create a project"}
          </SheetTitle>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-7 pb-5">
          {/* Hero — tinted hexagon + swatch pill */}
          <div className="relative flex h-[280px] flex-col items-center justify-center gap-6">
            <HexArtifact tint={tint} />
            <SwatchPill tone={tone} onChange={setTone} />
          </div>

          {/* Icon */}
          <div className="space-y-2">
            <p className={LABEL}>Icon</p>
            <div className="flex items-center gap-2">
              <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/30">
                {icon ? (
                  <img src={icon} alt="" className="size-full object-cover" />
                ) : (
                  <BoxIcon className="size-4 text-muted-foreground" />
                )}
              </div>
              <Button
                type="button"
                variant="subtle"
                size="sm"
                leftIcon={<UploadIcon className="size-3.5" />}
                onClick={() => fileRef.current?.click()}
              >
                Upload
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) chooseIcon(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <p className={LABEL}>
              What are you working on? <span className="text-destructive">*</span>
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project Alpha"
              className={cn(FIELD, "h-11")}
            />
          </div>

          {/* Folder */}
          <div className="space-y-2">
            <p className={LABEL}>Where do you want to work from?</p>
            <button
              type="button"
              onClick={chooseFolder}
              disabled={!!editing}
              className={cn(
                FIELD,
                "flex h-11 items-center gap-2.5 text-left disabled:opacity-60",
              )}
            >
              <FolderPlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "truncate",
                  dir ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                {dir ? tildeHome(dir) : "Choose a folder"}
              </span>
            </button>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <p className={LABEL}>What should the agent know about this project?</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Goals, context, instructions, links to docs…"
              rows={5}
              className={cn(FIELD, "resize-none py-3 leading-relaxed")}
            />
          </div>

          {/* Standing agents */}
          <div className="space-y-2">
            <p className={LABEL}>Agents to follow on this project</p>
            <ProjectAgentsPicker
              agents={agents}
              value={projectAgents}
              onChange={setProjectAgents}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 px-7 pt-2 pb-6">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={!canCreate} onClick={submit}>
            {editing ? "Save changes" : "Create project"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A rounded hexagon filled with the project tint. berd renders a WebGL marble
 * artifact here; this is a lightweight SVG stand-in — radial gradient plus a
 * fractal-noise displacement for an organic, swirled surface.
 */
function HexArtifact({ tint }: { tint: string }) {
  const uid = useId().replace(/:/g, "");
  const points = "100,20 170,60 170,140 100,180 30,140 30,60";
  return (
    <div className="relative">
      <div
        className="absolute inset-0 -z-10 blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in oklch, ${tint} 45%, transparent), transparent 70%)`,
        }}
      />
      <svg viewBox="0 0 200 200" className="size-44">
        <defs>
          <radialGradient id={`g-${uid}`} cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor={tint} />
            <stop offset="45%" stopColor={tint} />
            <stop
              offset="100%"
              stopColor={`color-mix(in oklch, ${tint} 45%, #000)`}
            />
          </radialGradient>
          <filter id={`m-${uid}`}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.011 0.02"
              numOctaves="3"
              seed="11"
              result="n"
            />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="16" />
          </filter>
          <clipPath id={`c-${uid}`}>
            <polygon points={points} />
          </clipPath>
        </defs>
        <polygon
          points={points}
          fill={`url(#g-${uid})`}
          stroke={`url(#g-${uid})`}
          strokeWidth="18"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#c-${uid})`} opacity="0.5">
          <rect
            x="-20"
            y="-20"
            width="240"
            height="240"
            fill={`url(#g-${uid})`}
            filter={`url(#m-${uid})`}
          />
        </g>
      </svg>
    </div>
  );
}

/** Copied from berd's ColorPicker `variant="swatches"`. */
export function SwatchPill({
  tone,
  onChange,
}: {
  tone: ProjectTone;
  onChange: (t: ProjectTone) => void;
}) {
  return (
    <fieldset
      aria-label="Project colour"
      className="relative inline-flex border-0 p-0"
    >
      <div className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--surface-color-picker-swatches)] px-2.5 shadow-[var(--shadow-color-picker-swatches)] backdrop-blur-md">
        {PROJECT_TONES.map((t) => {
          const selected = tone === t;
          return (
            <button
              key={t}
              type="button"
              aria-label={t}
              aria-pressed={selected}
              onClick={() => onChange(t)}
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-foreground/15 transition-transform hover:scale-110",
                TONE_BG[t],
                selected &&
                  "scale-110 border-muted-foreground ring-2 ring-muted-foreground/55 ring-offset-2 ring-offset-[var(--surface-color-picker-swatches)]",
              )}
            >
              {selected && (
                <CheckIcon className="size-3 stroke-[3] text-black/70" />
              )}
            </button>
          );
        })}
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-background text-muted-foreground"
          title="Custom colour — coming soon"
        >
          <PlusIcon className="size-3 stroke-[2.8]" />
        </span>
      </div>
    </fieldset>
  );
}
