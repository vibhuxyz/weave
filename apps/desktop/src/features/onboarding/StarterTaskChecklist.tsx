import { useTranslation } from "react-i18next";
import { useProjects } from "@/useProjects";
import { usePersistedState } from "@/shared/hooks/usePersistedState";
import { STARTER_TASKS, useStarterTaskProgress } from "./starterTasks";

/**
 * Ported from upstream's starter-tasks sticky note / docked panel. Upstream
 * renders this as a canvas widget; here it's a fixed panel for the same
 * Phase-1-canvas reason as `GreeterWidget`. See `starterTasks.ts` for what's
 * auto-detected vs. manual.
 */
export function StarterTaskChecklist({
  onOpenEngineSettings,
  onStartChat,
  onCreateProject,
}: {
  onOpenEngineSettings?: () => void;
  onStartChat?: () => void;
  onCreateProject?: () => void;
}) {
  const { t } = useTranslation("onboarding");
  const { projects } = useProjects();
  const [progress, setProgress] = useStarterTaskProgress();
  const [hidden, setHidden] = usePersistedState<boolean>(
    "weave:starterTasksHidden",
    false,
    (value, defaults) => (typeof value === "boolean" ? value : defaults),
  );

  if (hidden) return null;

  const isDone = (id: string) =>
    id === "create-project" ? projects.length > 0 : !!progress[id];

  const toggle = (id: string) => {
    if (id === "create-project") {
      onCreateProject?.();
      return;
    }
    setProgress((prev) => ({ ...prev, [id]: !prev[id] }));
    if (id === "connect-engine") onOpenEngineSettings?.();
    if (id === "start-chat") onStartChat?.();
  };

  const doneCount = STARTER_TASKS.filter((task) => isDone(task.id)).length;

  return (
    <div className="pointer-events-auto absolute left-6 top-6 z-20 w-72 rounded-2xl border border-border bg-card p-4 shadow-lg">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {t("starterTasks.title")} ({doneCount}/{STARTER_TASKS.length})
        </span>
        <button
          type="button"
          aria-label={t("greeter.dismiss")}
          onClick={() => setHidden(true)}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <ul className="flex flex-col gap-1.5">
        {STARTER_TASKS.map((task) => {
          const done = isDone(task.id);
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => toggle(task.id)}
                className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
                title={t(task.detailKey)}
              >
                <span
                  className={
                    done
                      ? "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                      : "mt-0.5 size-4 shrink-0 rounded-full border border-border"
                  }
                >
                  {done ? "✓" : ""}
                </span>
                <span className={done ? "text-muted-foreground line-through" : ""}>
                  {t(task.titleKey)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
