import type {
  QuestionAnswerValue,
  QuestionField,
  QuestionNotice,
} from "../../../../../server/index.ts";

export type { QuestionAnswerValue, QuestionField, QuestionNotice };

export interface QuestionRequest {
  readonly requestId: string;
  readonly message: string;
  readonly fields: readonly QuestionField[];
  readonly notices: readonly QuestionNotice[];
}

export type QuestionState =
  | { readonly status: "open"; readonly request: QuestionRequest; readonly error: string | null }
  | { readonly status: "sending"; readonly request: QuestionRequest };

export type QuestionAnswers = Readonly<Record<string, QuestionAnswerValue>>;

export type QuestionFormValue = string | boolean | readonly string[];

export type QuestionFormValues = Readonly<Record<string, QuestionFormValue>>;
