import type { DecisionsRepo, StorageResult } from "../storage/index.ts";
import {
  MAX_DECISIONS_LOADED,
  MAX_STORED_ANSWER_CHARS,
  MAX_STORED_QUESTION_CHARS,
} from "./constants.ts";
import { formatDecisionsBlock } from "./format-block.ts";

export interface DecisionLogOptions {
  readonly repo: DecisionsRepo;
  readonly projectId: string;
  readonly now: () => number;
}

export interface NewDecision {
  readonly question: string;
  readonly answer: string;
  readonly engineId: string;
}

export class DecisionLog {
  private readonly options: DecisionLogOptions;

  constructor(options: DecisionLogOptions) {
    this.options = options;
  }

  record({ question, answer, engineId }: NewDecision): StorageResult<null> {
    const { repo, projectId, now } = this.options;
    return repo.record(
      {
        projectId,
        question: question.slice(0, MAX_STORED_QUESTION_CHARS),
        answer: answer.slice(0, MAX_STORED_ANSWER_CHARS),
        engineId,
      },
      now(),
    );
  }

  formatBlock(): string | null {
    const { repo, projectId } = this.options;
    return formatDecisionsBlock(repo.listRecent(projectId, MAX_DECISIONS_LOADED), repo.count(projectId));
  }
}
