import {
  createEngineSupervisor,
  getEngine,
  installedEngines,
  AuthRequiredError,
  type EngineSupervisor,
  type CreateSupervisorOptions,
} from "@weave/agent";
import {
  readLatest,
  buildBrief,
  weaveDirFor,
} from "@weave/core";
import {
  isAuthRequiredError,
  toEngineAuthMethod,
  type AuthMethod,
} from "@weave/protocol";
import { resolveEngineFallbackMethods } from "../auth/index.ts";
import { createSupervisorOptions } from "./supervisor-options.ts";
import type { SessionContext } from "./types.ts";

export class DesktopSessionManager {
  currentEngineId: string;
  supervisor: EngineSupervisor | null = null;
  persisted = false;
  announced = false;
  pendingPreamble: string | null = null;
  taskCreated = false;
  taskGoal = "";
  private readonly ctx: SessionContext;

  constructor(initialEngineId: string, ctx: SessionContext) {
    this.currentEngineId = initialEngineId;
    this.ctx = ctx;
  }

  sendAuthRequired(error: AuthRequiredError): void {
    const rawMethods = resolveEngineFallbackMethods(
      error.engineId,
      error.authMethods,
    );
    this.ctx.authMethodsByEngine.set(error.engineId, rawMethods);
    this.ctx.engineAuthStates.set(error.engineId, "auth_required");
    this.ctx.send({
      type: "auth-required",
      engineId: error.engineId,
      engineLabel: getEngine(error.engineId).label,
      message: error.message,
      methods: rawMethods.map(toEngineAuthMethod),
    });
  }

  handleAuthError(error: unknown, engineId: string): boolean {
    if (error instanceof AuthRequiredError) {
      this.sendAuthRequired(error);
      return true;
    }
    if (isAuthRequiredError(error)) {
      const errData = (error as { readonly data?: unknown }).data;
      const authMethods = (errData as { readonly authMethods?: readonly AuthMethod[] } | undefined)?.authMethods;
      const methods: AuthMethod[] = authMethods ? [...authMethods] : [...(this.ctx.authMethodsByEngine.get(engineId) ?? [])];
      this.sendAuthRequired(new AuthRequiredError(engineId, methods, error));
      return true;
    }
    return false;
  }

  private buildSupervisorOptions(resumeId: string | null, engineId: string): CreateSupervisorOptions {
    const opts = createSupervisorOptions({
      ctx: this.ctx,
      getCurrentEngineId: () => this.currentEngineId,
      getCurrentModeId: () => this.supervisor?.current?.modes?.currentModeId ?? null,
      onSessionReady: (sessionId, resumed, configOptions, modes) => {
        this.persisted = resumed;
        this.ctx.engineAuthStates.set(this.currentEngineId, "authenticated");
        if (this.announced) return;
        this.announced = true;
        this.ctx.send({
          type: "ready",
          sessionId,
          cwd: this.ctx.projectDir,
          engineId: this.currentEngineId,
          engineLabel: getEngine(this.currentEngineId).label,
          configOptions,
          modes,
          resumed,
        });
      },
      resumeId,
    });

    return { ...opts, engineId };
  }

  async bindEngine(engineId: string): Promise<boolean> {
    const resumeId = await this.ctx.store.get(this.ctx.projectDir);
    const options = this.buildSupervisorOptions(resumeId, engineId);
    try {
      if (!this.supervisor) {
        this.supervisor = await createEngineSupervisor(options);
      } else {
        await this.supervisor.switchTo(engineId);
      }
    } catch (error) {
      if (this.handleAuthError(error, engineId)) return false;
      throw error;
    }

    this.currentEngineId = engineId;
    this.persisted = false;
    this.ctx.engineAuthStates.set(engineId, "authenticated");

    if (this.taskCreated) {
      const checkpoint = await readLatest(
        weaveDirFor(this.ctx.projectDir),
        this.ctx.continuationTaskId,
      );
      this.pendingPreamble = checkpoint
        ? buildBrief(checkpoint, getEngine(engineId))
        : null;
    }

    this.ctx.ledger.append("agent.session", {
      taskId: this.ctx.task.id,
      sessionId: this.supervisor.current.sessionId,
      resumed: false,
      configOptions: this.supervisor.current.configOptions,
    });

    if (this.taskCreated) {
      const updated = await this.ctx.tasksStore.startAttempt(
        this.ctx.continuationTaskId,
        engineId,
        this.supervisor.current.sessionId,
        this.ctx.ledger.runId,
        this.ctx.ledger.seq,
      );
      this.ctx.ledger.append("attempt.started", {
        taskId: this.ctx.continuationTaskId,
        attemptIndex: updated.attempts.length - 1,
        engineId,
        sessionId: this.supervisor.current.sessionId,
      });
    }

    this.ctx.send({ type: "reset" });
    this.ctx.send({
      type: "ready",
      sessionId: this.supervisor.current.sessionId,
      cwd: this.ctx.projectDir,
      engineId: this.currentEngineId,
      engineLabel: getEngine(this.currentEngineId).label,
      configOptions: this.supervisor.current.configOptions,
      modes: this.supervisor.current.modes,
      resumed: false,
    });
    await this.ctx.sendChats();
    return true;
  }

  async prepareReplay(sessionId: string): Promise<void> {
    const loaded = await this.ctx.history.load(sessionId);
    if (!loaded.ok) this.ctx.send({ type: "error", message: loaded.reason });
    this.ctx.replayGate.arm(sessionId, loaded.ok ? loaded.value : null);
  }

  finishReplay(): void {
    this.ctx.replayGate.disarm();
  }

  async openFirstUsableEngine(wanted: string, resumeId: string | null): Promise<void> {
    if (resumeId) await this.prepareReplay(resumeId);
    try {
      await this.openEngineInOrder(wanted, resumeId);
    } finally {
      this.finishReplay();
    }
  }

  private async openEngineInOrder(wanted: string, resumeId: string | null): Promise<void> {
    const order = [
      wanted,
      ...installedEngines()
        .map((entry) => entry.id)
        .filter((id) => id !== wanted),
    ];
    let refusal: AuthRequiredError | null = null;
    let failure: unknown = null;

    for (const engineId of order) {
      try {
        this.currentEngineId = engineId;
        const options = this.buildSupervisorOptions(resumeId, engineId);
        this.supervisor = await createEngineSupervisor(options);
        return;
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          this.ctx.engineAuthStates.set(engineId, "auth_required");
          if (engineId === wanted) throw error;
          refusal ??= error;
          continue;
        }
        if (isAuthRequiredError(error)) {
          const errData = (error as { readonly data?: unknown }).data;
          const authMethods = (errData as { readonly authMethods?: readonly AuthMethod[] } | undefined)?.authMethods;
          const methods: AuthMethod[] = authMethods ? [...authMethods] : [...(this.ctx.authMethodsByEngine.get(engineId) ?? [])];
          const authErr = new AuthRequiredError(engineId, methods, error);
          this.ctx.engineAuthStates.set(engineId, "auth_required");
          if (engineId === wanted) throw authErr;
          refusal ??= authErr;
          continue;
        }
        failure ??= error;
      }
    }
    throw refusal ?? failure ?? new Error("No engine could open a session.");
  }
}
