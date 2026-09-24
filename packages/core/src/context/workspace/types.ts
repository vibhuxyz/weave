export interface PackageManifest {
  readonly dir: string;
  readonly name: string | null;
  readonly scripts: Readonly<Record<string, string>>;
  readonly dependencies: readonly string[];
  readonly entryFields: readonly string[];
  readonly exportsMap: Readonly<Record<string, string>>;
  readonly hasBin: boolean;
  readonly workspaceGlobs: readonly string[];
}

export interface TsPathAlias {
  readonly pattern: string;
  readonly targets: readonly string[];
}

export interface TsPathConfig {
  readonly dir: string;
  readonly baseDir: string;
  readonly aliases: readonly TsPathAlias[];
}
