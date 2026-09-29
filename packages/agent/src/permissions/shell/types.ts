export type ShellToken =
  | { readonly kind: "word"; readonly text: string }
  | { readonly kind: "operator"; readonly text: string };

export type ShellJoin = "and" | "or" | "pipe" | "background" | "group";

export interface ShellItem {
  readonly commands: readonly (readonly string[])[];
  readonly joins: readonly ShellJoin[];
}

export interface DirectoryView {
  readonly isDirectory: (path: string) => boolean;
  readonly realPath: (path: string) => string;
}

export interface ParentPathUse {
  readonly text: string;
  readonly resolved: string | null;
}
