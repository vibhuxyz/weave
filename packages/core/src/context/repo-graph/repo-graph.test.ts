import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildProjectModel } from "../build-model.ts";
import { queryProject } from "../query/index.ts";
import type { ProjectModel } from "../types.ts";
import { buildRepositoryGraph } from "./build.ts";
import { largeProject, monorepo, smallProject, writeFiles, type RepoFiles } from "./fixtures.ts";
import { neighbourhoodOf } from "./neighbourhood.ts";
import { fileId } from "./nodes.ts";
import type { RepositoryGraph } from "./types.ts";

const AUTH_REQUEST = "Find everything related to authentication";

async function modelOf(files: RepoFiles): Promise<{ model: ProjectModel; graph: RepositoryGraph; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "weave-graph-"));
  await writeFiles(dir, files);
  const { model } = await buildProjectModel({ root: dir });
  return { model, graph: buildRepositoryGraph(model), dir };
}

async function withProject(
  files: RepoFiles,
  check: (context: { model: ProjectModel; graph: RepositoryGraph }) => void,
): Promise<void> {
  const { model, graph, dir } = await modelOf(files);
  try {
    check({ model, graph });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("the graph carries the node and edge kinds the architecture defines", async () => {
  await withProject(smallProject(), ({ graph }) => {
    const nodeKinds = new Set(graph.nodes.map((node) => node.kind));
    for (const kind of ["repository", "directory", "file", "function", "test", "configuration"]) {
      assert.ok(nodeKinds.has(kind as never), `missing node kind ${kind}`);
    }
    const edgeKinds = new Set(graph.edges.map((edge) => edge.kind));
    for (const kind of ["contains", "imports", "calls", "tests", "configures"]) {
      assert.ok(edgeKinds.has(kind as never), `missing edge kind ${kind}`);
    }
    assert.equal(graph.truncated, false);

    const known = new Set(graph.nodes.map((node) => node.id));
    assert.ok(graph.edges.every((edge) => known.has(edge.from) && known.has(edge.to)));

    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.kind === "imports" &&
          edge.from === fileId("src/auth/session.ts") &&
          edge.to === fileId("src/auth/tokens.ts"),
      ),
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.kind === "tests" &&
          edge.from === fileId("src/auth/session.test.ts") &&
          edge.to === fileId("src/auth/session.ts"),
      ),
    );
  });
});

test("a 100-file project answers the authentication request with auth files only", async () => {
  await withProject(smallProject(), ({ model }) => {
    assert.ok(model.files.length >= 100, `expected a 100-file project, got ${model.files.length}`);
    const answer = queryProject(model, AUTH_REQUEST);
    assert.ok(answer.files.length > 0);
    assert.ok(answer.files.length <= 12, `returned ${answer.files.length} files`);
    assert.ok(
      answer.files.every((file) => file.path.startsWith("src/auth/")),
      `leaked non-auth files: ${answer.files.map((file) => file.path).join(", ")}`,
    );
    assert.ok(answer.files.some((file) => file.path === "src/auth/session.ts"));
  });
});

test("a 10,000-file project still returns a bounded, relevant slice", async () => {
  await withProject(largeProject(10_000), ({ model, graph }) => {
    assert.ok(model.files.length >= 10_000, `expected 10,000 files, got ${model.files.length}`);
    const answer = queryProject(model, AUTH_REQUEST);
    assert.ok(answer.files.length <= 12, `returned ${answer.files.length} files`);
    assert.ok(
      answer.files.every((file) => file.path.startsWith("services/auth/")),
      `leaked non-auth files: ${answer.files.map((file) => file.path).join(", ")}`,
    );

    const slice = neighbourhoodOf(graph, [fileId("services/auth/authenticator.py")], { depth: 2 });
    assert.ok(slice.nodes.length <= 200);
    assert.ok(slice.nodes.length < graph.nodes.length / 10);
    assert.ok(slice.nodes.some((node) => node.file === "services/auth/tokens.py"));

    const importsOnly = neighbourhoodOf(graph, [fileId("services/auth/authenticator.py")], {
      depth: 2,
      follow: ["imports"],
    });
    assert.ok(importsOnly.edges.every((edge) => edge.kind === "imports"));
    assert.ok(importsOnly.nodes.length < slice.nodes.length);
  });
});

test("a monorepo keeps the answer inside the packages that own authentication", async () => {
  await withProject(monorepo(), ({ model, graph }) => {
    const answer = queryProject(model, AUTH_REQUEST);
    const workspaces = new Set(answer.files.map((file) => file.workspace));
    assert.ok(!workspaces.has("@shop/ui"), "the unrelated ui package leaked into the answer");
    assert.ok(answer.files.some((file) => file.path.startsWith("packages/auth/")));

    assert.ok(
      graph.edges.some(
        (edge) => edge.kind === "depends_on" && edge.from === "package:web" && edge.to === "package:@shop/auth",
      ),
      "the workspace dependency edge is missing",
    );
    assert.ok(
      graph.edges.some(
        (edge) =>
          edge.kind === "imports" &&
          edge.from === fileId("apps/api/src/routes.go") &&
          edge.to === fileId("apps/api/internal/handlers/auth.go"),
      ),
      "the go import edge is missing",
    );
  });
});

test("the same project builds the same graph twice", async () => {
  const dir = await mkdtemp(join(tmpdir(), "weave-graph-"));
  try {
    await writeFiles(dir, smallProject());
    const first = buildRepositoryGraph((await buildProjectModel({ root: dir })).model);
    const second = buildRepositoryGraph((await buildProjectModel({ root: dir })).model);
    assert.deepEqual(first, second);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
