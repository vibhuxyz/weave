import assert from "node:assert/strict";
import type { summarizeProfile } from "./summary.ts";

export type Files = Readonly<Record<string, string>>;

export interface LanguageCase {
  readonly language: string;
  readonly files: Files;
  readonly sourcePath: string;
  readonly expectSymbols: readonly string[];
  readonly expectImports: readonly string[];
  readonly expectTestCommand: string | null;
}

export const CASES: readonly LanguageCase[] = [
  {
    language: "typescript",
    files: {
      "package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
      "src/auth.ts": 'import { issue } from "./tokens";\nexport function login(): string {\n  return issue();\n}\n',
      "src/tokens.ts": "export function issue(): string {\n  return \"t\";\n}\n",
    },
    sourcePath: "src/auth.ts",
    expectSymbols: ["login"],
    expectImports: ["./tokens"],
    expectTestCommand: "npm run --silent test",
  },
  {
    language: "javascript",
    files: {
      "package.json": JSON.stringify({ scripts: { test: "jest" } }),
      "src/auth.js": 'const { issue } = require("./tokens");\nfunction login() {\n  return issue();\n}\nmodule.exports = { login };\n',
    },
    sourcePath: "src/auth.js",
    expectSymbols: ["login"],
    expectImports: ["./tokens"],
    expectTestCommand: "npm run --silent test",
  },
  {
    language: "python",
    files: {
      "pyproject.toml": "[project]\nname='svc'\n",
      "src/auth.py": "from svc.tokens import issue\n\n\nclass Session:\n    def login(self):\n        return issue()\n",
    },
    sourcePath: "src/auth.py",
    expectSymbols: ["Session", "Session.login"],
    expectImports: ["svc.tokens"],
    expectTestCommand: "pytest -q",
  },
  {
    language: "go",
    files: {
      "go.mod": "module example.com/api\n\ngo 1.23\n",
      "internal/auth/session.go": 'package auth\n\nimport "example.com/api/internal/tokens"\n\nfunc Login() error {\n\treturn tokens.Issue()\n}\n',
    },
    sourcePath: "internal/auth/session.go",
    expectSymbols: ["Login"],
    expectImports: ["example.com/api/internal/tokens"],
    expectTestCommand: "go test ./...",
  },
  {
    language: "rust",
    files: {
      "Cargo.toml": "[package]\nname='api'\n",
      "src/auth.rs": "use crate::tokens::issue;\n\npub struct Session {}\n\npub fn login() -> bool {\n    issue()\n}\n",
    },
    sourcePath: "src/auth.rs",
    expectSymbols: ["Session", "login"],
    expectImports: ["crate::tokens::issue"],
    expectTestCommand: "cargo test",
  },
  {
    language: "java",
    files: {
      "pom.xml": "<project/>\n",
      "src/main/java/com/example/Auth.java":
        "package com.example;\nimport com.example.tokens.Issuer;\n\npublic class Auth {\n    public String login() {\n        return Issuer.issue();\n    }\n}\n",
    },
    sourcePath: "src/main/java/com/example/Auth.java",
    expectSymbols: ["Auth", "Auth.login"],
    expectImports: ["com.example.tokens.Issuer"],
    expectTestCommand: "mvn -q test",
  },
  {
    language: "cpp",
    files: {
      "CMakeLists.txt": "cmake_minimum_required(VERSION 3.20)\n",
      "src/auth.cpp": '#include "tokens.h"\n\nclass Session {\n};\n\nint login(const char *user) {\n    return issue(user);\n}\n',
    },
    sourcePath: "src/auth.cpp",
    expectSymbols: ["Session", "login"],
    expectImports: ["tokens.h"],
    expectTestCommand: "ctest --output-on-failure",
  },
  {
    language: "ruby",
    files: {
      Gemfile: "source 'https://rubygems.org'\n",
      "app/auth.rb": 'require_relative "tokens"\n\nclass Session\n  def login\n    Tokens.issue\n  end\nend\n',
    },
    sourcePath: "app/auth.rb",
    expectSymbols: ["Session", "Session.login"],
    expectImports: ["tokens"],
    expectTestCommand: "bundle exec rspec",
  },
  {
    language: "php",
    files: {
      "composer.json": JSON.stringify({ name: "acme/api" }),
      "src/Auth.php":
        "<?php\nnamespace App;\n\nuse App\\Tokens\\Issuer;\n\nclass Auth {\n    public function login() {\n        return Issuer::issue();\n    }\n}\n",
    },
    sourcePath: "src/Auth.php",
    expectSymbols: ["Auth", "Auth.login"],
    expectImports: ["App\\Tokens\\Issuer"],
    expectTestCommand: "vendor/bin/phpunit",
  },
  {
    language: "csharp",
    files: {
      "Api.csproj": "<Project Sdk=\"Microsoft.NET.Sdk\" />\n",
      "src/Auth.cs":
        "using System.Text;\n\nnamespace Api;\n\npublic class Auth\n{\n    public string Login()\n    {\n        return Issuer.Issue();\n    }\n}\n",
    },
    sourcePath: "src/Auth.cs",
    expectSymbols: ["Auth", "Auth.Login"],
    expectImports: ["System.Text"],
    expectTestCommand: "dotnet test",
  },
];

export interface ShapeCase {
  readonly shape: string;
  readonly files: Files;
  readonly expect: (summary: ReturnType<typeof summarizeProfile>) => void;
}

export const SHAPES: readonly ShapeCase[] = [
  {
    shape: "a new empty project",
    files: { "README.md": "# idea\n" },
    expect: (summary) => {
      assert.deepEqual(summary.languages, []);
      assert.equal(summary.packageManager, null);
      assert.equal(summary.monorepo, false);
    },
  },
  {
    shape: "a small single-language project",
    files: { "main.py": "print('hi')\n", "requirements.txt": "requests\n" },
    expect: (summary) => {
      assert.deepEqual(summary.languages, ["python"]);
      assert.equal(summary.packageManager, "pip");
    },
  },
  {
    shape: "a large monorepo",
    files: {
      "package.json": JSON.stringify({ workspaces: ["apps/*", "packages/*"] }),
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "pnpm-lock.yaml": "lockfileVersion: 9.0\n",
      "apps/web/src/page.tsx": "export const Page = () => null;\n",
      "apps/api/src/server.ts": "export const server = 1;\n",
      "packages/ui/src/index.ts": "export const ui = 1;\n",
    },
    expect: (summary) => {
      assert.equal(summary.monorepo, true);
      assert.equal(summary.packageManager, "pnpm");
    },
  },
  {
    shape: "polyglot microservices",
    files: {
      "docker-compose.yml": "services:\n  api:\n    build: ./api\n",
      "services/api/go.mod": "module example.com/api\n",
      "services/api/main.go": "package main\n",
      "services/worker/pyproject.toml": "[project]\n",
      "services/worker/main.py": "x = 1\n",
    },
    expect: (summary) => {
      assert.ok(summary.languages.includes("go"));
      assert.ok(summary.languages.includes("python"));
      assert.equal(summary.containerized, true);
    },
  },
  {
    shape: "a CLI tool",
    files: { "Cargo.toml": "[package]\nname='tool'\n", "src/main.rs": "fn main() {}\n" },
    expect: (summary) => {
      assert.deepEqual(summary.languages, ["rust"]);
      assert.equal(summary.packageManager, "cargo");
    },
  },
  {
    shape: "an unknown framework",
    files: { "build.zig": "const x = 1;\n", "src/main.zig": "pub fn main() void {}\n" },
    expect: (summary) => {
      assert.deepEqual(summary.languages, []);
      assert.equal(summary.packageManager, null);
    },
  },
];
