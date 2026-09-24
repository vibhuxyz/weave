export interface QuestionOption {
  readonly value: string;
  readonly label: string;
  readonly description: string | null;
}

interface QuestionFieldBase {
  readonly key: string;
  readonly title: string;
  readonly description: string | null;
  readonly isRequired: boolean;
}

export type QuestionField =
  | (QuestionFieldBase & {
      readonly kind: "choice";
      readonly options: readonly QuestionOption[];
      readonly allowsMultiple: boolean;
    })
  | (QuestionFieldBase & { readonly kind: "text"; readonly customAnswerFor: string | null })
  | (QuestionFieldBase & { readonly kind: "toggle" })
  | (QuestionFieldBase & { readonly kind: "number"; readonly isInteger: boolean });

export interface QuestionNotice {
  readonly key: string;
  readonly message: string;
}

export type QuestionAnswerValue = string | number | boolean | readonly string[];
