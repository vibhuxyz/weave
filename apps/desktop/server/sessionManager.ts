import {
  createEngineSupervisor,
  getEngine,
  installedEngines,
  AuthRequiredError,
  type EngineSupervisor,
} from "@weave/agent";
import {
  readLatest,
  buildBrief,
  weaveDirFor,
} from "@weave/core";
import {
  toEngineAuthMethod,
  isAuthRequiredError,
  type AuthMethod,
} from "@weave/protocol";
import { resolveEngineFallbackMethods } from "./authFallbackMethods.ts";
import { createSupervisorOptions } from "./createSupervisorOptions.ts";
import type { SessionContext } from "./sessionManager.types.ts";

export class DesktopSessionManager {
  currentEngineId: string;
  supervisor: EngineSupervisor | null = null;
  persisted = false;
  announced = false;
  pendingPreamble: string | null = null;
  taskCreated = false;
  taskGoal = "";

  constructor(
    initialEngineId: string,
    private readonly ctx: SessionContext,
  ) {
    this.currentEngineId = initialEngineId;
  }

  sendAuthRequired(error: AuthRequiredError): void {
    const rawMethods = resolveEngineFallbackMethods(
      error.engineId,
      error.authMethods,
    );
    this.ctx.authMethodsByEngine.set(error.engineId, rawMethods);
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
      const errObj = error as { data?: { authMethods?: AuthMethod[] } };
      const methods: AuthMethod[] =
        errObj?.data?.authMethods ?? this.ctx.authMethodsByEngine.get(engineId) ?? [];
      this.sendAuthRequired(new AuthRequiredError(engineId, methods, error));
      return true;
    }
    return false;
  }

  private buildSupervisorOptions(resumeId: string | null) {
    return createSupervisorOptions(
      this.ctx,
      () => this.currentEngineId,
      (sessionId, resumed, configOptions) => {
        this.persisted = resumed;
        if (this.announced) return;
        this.announced = true;
        this.ctx.send({
          type: "ready",
          sessionId,
          cwd: this.ctx.projectDir,
          engineId: this.currentEngineId,
          engineLabel: getEngine(this.currentEngineId).label,
          configOptions,
          resumed,
        });
      },
      resumeId,
    );
  }

  async bindEngine(engineId: string): Promise<boolean> {
    const resumeId = await this.ctx.store.get(this.ctx.projectDir);
    const options = this.buildSupervisorOptions(resumeId);
    try {
      if (!this.supervisor) {
        this.supervisor = await createEngineSupervisor({ ...options, engineId });
      } else {
        await this.supervisor.switchTo(engineId);
      }
    } catch (error) {
      if (this.handleAuthError(error, engineId)) return false;
      throw error;
    }

    this.currentEngineId = engineId;
    this.persisted = false;

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
      resumed: false,
    });
    await this.ctx.sendChats();
    return true;
  }

  async openFirstUsableEngine(wanted: string, resumeId: string | null): Promise<void> {
    const options = this.buildSupervisorOptions(resumeId);
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
        this.supervisor = await createEngineSupervisor({ ...options, engineId });
        return;
      } catch (error) {
        if (error instanceof AuthRequiredError) {
          if (engineId === wanted) throw error;
          refusal ??= error;
          continue;
        }
        if (isAuthRequiredError(error)) {
          const errObj = error as { data?: { authMethods?: AuthMethod[] } };
          const methods: AuthMethod[] =
            errObj?.data?.authMethods ?? this.ctx.authMethodsByEngine.get(engineId) ?? [];
          const authErr = new AuthRequiredError(engineId, methods, error);
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
