import {
  createEngineSupervisor,
  getEngine,
  installedEngines,
  AuthRequiredError,
  type EngineSupervisor,
  type CreateSupervisorOptions,
} from "@weave/agent";
import {
  isAuthRequiredError,
  toEngineAuthMethod,
  type AuthMethod,
} from "@weave/protocol";
import { resolveEngineFallbackMethods } from "../auth/index.ts";
import { resumeTarget } from "../thread/index.ts";
import { createSupervisorOptions } from "./supervisor-options.ts";
import { handOffThread, openThreadSession, prepareThreadReplay, switchEngineSession } from "./thread-binding.ts";
import type { SessionContext } from "./types.ts";

export class DesktopSessionManager {
  currentEngineId: string;
  supervisor: EngineSupervisor | null = null;
  threadId: string | null = null;
  persisted = false;
  announced = false;
  pendingPreamble: string | null = null;
  taskCreated = false;
  taskGoal = "";
  cancelRequested = false;
  private readonly ctx: SessionContext;

  constructor(initialEngineId: string, ctx: SessionContext) {
    this.currentEngineId = initialEngineId;
    this.ctx = ctx;
  }

  get dataDir(): string {
    return this.ctx.dataDir;
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
          threadId: this.threadId,
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

  async openThread(threadId: string): Promise<boolean> {
    if (!this.supervisor) return false;
    this.threadId = threadId;
    const opened = await openThreadSession(this.supervisor, this.ctx, { threadId, engineId: this.currentEngineId });
    this.pendingPreamble = opened.preamble;
    return opened.isOpen;
  }

  private resumeIdFor(engineId: string): string | null {
    return this.threadId === null ? null : resumeTarget(this.ctx.chats, this.threadId, engineId);
  }

  async bindEngine(engineId: string): Promise<boolean> {
    const fromEngineId = this.currentEngineId;
    const resumeId = this.resumeIdFor(engineId);
    try {
      if (!this.supervisor) {
        this.supervisor = await createEngineSupervisor(this.buildSupervisorOptions(resumeId, engineId));
      } else {
        await switchEngineSession(this.supervisor, this.ctx, { engineId, resumeId });
      }
    } catch (error) {
      if (this.handleAuthError(error, engineId)) return false;
      throw error;
    }

    this.currentEngineId = engineId;
    this.persisted = this.threadId !== null;
    this.ctx.engineAuthStates.set(engineId, "authenticated");
    if (this.threadId !== null) {
      this.pendingPreamble = await handOffThread({
        ctx: this.ctx,
        threadId: this.threadId,
        fromEngineId,
        engineId,
        engineSessionId: this.supervisor.current.sessionId,
      });
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

    this.ctx.send({
      type: "ready",
      sessionId: this.supervisor.current.sessionId,
      threadId: this.threadId,
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

  private finishReplay(): void {
    this.ctx.replayGate.disarm();
    this.ctx.replayGate.unmute();
  }

  async openFirstUsableEngine(wanted: string, threadId: string | null): Promise<void> {
    this.threadId = threadId;
    try {
      await this.openEngineInOrder(wanted);
    } finally {
      this.finishReplay();
    }
    if (this.threadId === null || !this.supervisor) return;
    this.pendingPreamble = await handOffThread({
      ctx: this.ctx,
      threadId: this.threadId,
      fromEngineId: this.currentEngineId,
      engineId: this.currentEngineId,
      engineSessionId: this.supervisor.current.sessionId,
    });
  }

  private async openEngineInOrder(wanted: string): Promise<void> {
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
        const resumeId = this.resumeIdFor(engineId);
        if (resumeId !== null && this.threadId !== null) prepareThreadReplay(this.ctx, this.threadId, resumeId);
        this.supervisor = await createEngineSupervisor(this.buildSupervisorOptions(resumeId, engineId));
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
