export type PlanIssue =
  | { readonly kind: "cycle"; readonly path: readonly string[] }
  | { readonly kind: "path-overlap"; readonly paths: readonly string[]; readonly tasks: readonly string[] }
  | { readonly kind: "unknown-dependency"; readonly task: string; readonly waitsOn: string }
  | { readonly kind: "self-dependency"; readonly task: string }
  | { readonly kind: "duplicate-id"; readonly task: string };
