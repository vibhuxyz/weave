import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RepoFiles = Readonly<Record<string, string>>;

export async function writeRepo(root: string, files: RepoFiles): Promise<string> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
  return root;
}

export const NEXTJS_REPO: RepoFiles = {
  "package.json": JSON.stringify({
    name: "shop",
    dependencies: { next: "15.0.0", react: "19.0.0", pg: "8.11.0", "@prisma/client": "5.0.0" },
    devDependencies: { vitest: "2.0.0", "@playwright/test": "1.47.0", typescript: "5.6.0" },
  }),
  "pnpm-lock.yaml": "lockfileVersion: 9.0\n",
  "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
  "Dockerfile": "FROM node:22\n",
  "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n",
  ".github/workflows/ci.yml": "name: ci\n",
  "README.md": "# shop\n",
  "apps/web/src/app/page.tsx": "export default function Page() { return null; }\n",
  "apps/web/src/lib/db.ts": "export const db = 1;\n",
  "packages/ui/src/Button.tsx": "export const Button = () => null;\n",
};

export const PYTHON_REPO: RepoFiles = {
  "pyproject.toml": [
    "[project]",
    'name = "svc"',
    "dependencies = [",
    '  "fastapi>=0.115",',
    '  "sqlalchemy>=2.0",',
    '  "psycopg2-binary>=2.9",',
    "]",
    "",
    "[tool.poetry.group.dev.dependencies]",
    'pytest = "^8.0"',
  ].join("\n"),
  "poetry.lock": "# generated\n",
  "src/svc/main.py": "app = None\n",
  "src/svc/models.py": "MODELS = []\n",
  "tests/test_main.py": "def test_ok():\n    assert True\n",
  "README.md": "# svc\n",
};

export const GO_REPO: RepoFiles = {
  "go.mod": [
    "module example.com/api",
    "",
    "go 1.23",
    "",
    "require (",
    "\tgithub.com/gin-gonic/gin v1.10.0",
    "\tgorm.io/gorm v1.25.0",
    "\tgithub.com/lib/pq v1.10.9",
    "\tgithub.com/stretchr/testify v1.9.0",
    ")",
  ].join("\n"),
  "cmd/api/main.go": "package main\n\nfunc main() {}\n",
  "internal/store/store.go": "package store\n",
  "Makefile": "build:\n\tgo build ./...\n",
};

export const RUST_REPO: RepoFiles = {
  "Cargo.toml": [
    "[workspace]",
    'members = ["crates/api"]',
    "",
    "[dependencies]",
    'axum = "0.7"',
    'sqlx = "0.8"',
    'rusqlite = "0.32"',
  ].join("\n"),
  "Cargo.lock": "# generated\n",
  "crates/api/src/main.rs": "fn main() {}\n",
  "crates/api/src/lib.rs": "pub fn ok() -> bool { true }\n",
};

export const JAVA_REPO: RepoFiles = {
  "pom.xml": [
    "<project>",
    "  <dependencies>",
    "    <dependency>",
    "      <groupId>org.springframework.boot</groupId>",
    "      <artifactId>spring-boot-starter-web</artifactId>",
    "    </dependency>",
    "    <dependency>",
    "      <groupId>org.hibernate</groupId>",
    "      <artifactId>hibernate-core</artifactId>",
    "    </dependency>",
    "  </dependencies>",
    "</project>",
  ].join("\n"),
  "src/main/java/com/example/App.java": "package com.example;\npublic class App {}\n",
  "src/test/java/com/example/AppTest.java": "package com.example;\npublic class AppTest {}\n",
  "Jenkinsfile": "pipeline {}\n",
};

export const PLAIN_REPO: RepoFiles = {
  "notes.txt": "just some notes\n",
  "data/rows.csv": "a,b\n1,2\n",
};
