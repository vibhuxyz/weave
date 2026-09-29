import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RepoFiles = Readonly<Record<string, string>>;

export async function writeFiles(root: string, files: RepoFiles): Promise<void> {
  const entries = Object.entries(files);
  for (const [path, content] of entries) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

function tsModule(name: string, imports: readonly string[]): string {
  return [
    ...imports.map((specifier) => `import { helper } from "${specifier}";`),
    `export function ${name}(): number {`,
    "  return helper();",
    "}",
    "",
  ].join("\n");
}

export function smallProject(): RepoFiles {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "shop", version: "1.0.0", scripts: { test: "vitest" } }),
    "src/auth/session.ts": [
      'import { issueToken } from "./tokens";',
      "export function login(user: string): string {",
      "  return issueToken(user);",
      "}",
      "export function logout(session: string): void {",
      "  void session;",
      "}",
      "",
    ].join("\n"),
    "src/auth/tokens.ts": [
      "export function issueToken(user: string): string {",
      "  return user;",
      "}",
      "export function verifyToken(token: string): boolean {",
      "  return token.length > 0;",
      "}",
      "",
    ].join("\n"),
    "src/auth/middleware.ts": [
      'import { verifyToken } from "./tokens";',
      "export function requireAuth(token: string): boolean {",
      "  return verifyToken(token);",
      "}",
      "",
    ].join("\n"),
    "src/auth/session.test.ts": [
      'import { login } from "./session";',
      "export function testsLogin(): string {",
      "  return login('a');",
      "}",
      "",
    ].join("\n"),
  };
  for (let index = 0; index < 95; index += 1) {
    files[`src/catalog/item-${index}.ts`] = tsModule(`item${index}`, index === 0 ? [] : ["./item-0"]);
  }
  return files;
}

export function largeProject(fileCount: number): RepoFiles {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "big", version: "1.0.0" }),
    "services/auth/authenticator.py": [
      "from services.auth.tokens import issue_token",
      "",
      "class Authenticator:",
      "    def authenticate(self, user):",
      "        return issue_token(user)",
      "",
    ].join("\n"),
    "services/auth/tokens.py": ["def issue_token(user):", "    return user", ""].join("\n"),
  };
  for (let index = 0; index < fileCount; index += 1) {
    const group = Math.floor(index / 100);
    files[`services/reporting/group-${group}/report-${index}.py`] = [
      "def build_report():",
      `    return ${index}`,
      "",
    ].join("\n");
  }
  return files;
}

export function monorepo(): RepoFiles {
  return {
    "package.json": JSON.stringify({ name: "root", private: true, workspaces: ["apps/*", "packages/*"] }),
    "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { "@shop/auth": "workspace:*" } }),
    "apps/web/src/login-page.tsx": [
      'import { login } from "@shop/auth";',
      "export function LoginPage(): string {",
      "  return login('user');",
      "}",
      "",
    ].join("\n"),
    "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { "@shop/auth": "workspace:*" } }),
    "apps/api/src/routes.go": [
      "package routes",
      "",
      'import "api/internal/handlers"',
      "",
      "func RegisterAuthRoutes() {",
      "\thandlers.Auth()",
      "}",
      "",
    ].join("\n"),
    "apps/api/internal/handlers/auth.go": [
      "package handlers",
      "",
      "func Auth() string {",
      '\treturn "ok"',
      "}",
      "",
    ].join("\n"),
    "packages/auth/package.json": JSON.stringify({ name: "@shop/auth", main: "src/index.ts" }),
    "packages/auth/src/index.ts": ['export { login } from "./login";', ""].join("\n"),
    "packages/auth/src/login.ts": [
      "export function login(user: string): string {",
      "  return user;",
      "}",
      "",
    ].join("\n"),
    "packages/ui/package.json": JSON.stringify({ name: "@shop/ui", main: "src/index.ts" }),
    "packages/ui/src/index.ts": ["export function Button(): string {", "  return 'button';", "}", ""].join("\n"),
  };
}
