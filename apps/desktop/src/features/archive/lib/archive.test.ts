import test from "node:test";
import assert from "node:assert/strict";
import { archivedProjects, formatArchivedDate, groupArchivedChats } from "./index";

const APP = { dir: "/work/app", name: "App" };
const ARCHIVED_OLD = { dir: "/work/old", name: "Old", archivedAt: "2026-09-20T10:00:00.000Z" };
const ARCHIVED_NEW = { dir: "/work/new", name: "New", archivedAt: "2026-09-21T10:00:00.000Z" };

test("only archived projects are listed, most recently archived first", () => {
  assert.deepEqual(
    archivedProjects([APP, ARCHIVED_OLD, ARCHIVED_NEW]).map((project) => project.dir),
    ["/work/new", "/work/old"],
  );
});

test("archived chats are grouped under their project, newest first, skipping empty projects", () => {
  const groups = groupArchivedChats([ARCHIVED_OLD, APP, ARCHIVED_NEW], {
    "/work/app": [
      { id: "a", title: "first", archivedAt: 1 },
      { id: "b", title: "second", archivedAt: 5 },
    ],
    "/work/old": [{ id: "c", title: "third", archivedAt: 2 }],
    "/work/unknown": [{ id: "d", title: "orphan", archivedAt: 3 }],
  });
  assert.deepEqual(
    groups.map((group) => [group.project.name, group.chats.map((chat) => chat.id)]),
    [
      ["App", ["b", "a"]],
      ["Old", ["c"]],
    ],
  );
});

test("archive dates read as a short label and bad values show nothing", () => {
  assert.match(formatArchivedDate(Date.UTC(2026, 8, 21, 12)) ?? "", /^Archived /);
  assert.equal(formatArchivedDate(null), null);
  assert.equal(formatArchivedDate("not a date"), null);
});
