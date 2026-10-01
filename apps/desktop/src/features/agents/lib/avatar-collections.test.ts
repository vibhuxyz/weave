import test from "node:test";
import assert from "node:assert/strict";
import { BUILTIN_PERSONAS } from "../personas";
import { avatarKeyForEdit, displayedAvatarKey, takenAvatarKeys } from "./avatar-collections";
import { characterByKey, characterKeyForSeed, resolveCharacter } from "./characters";

const BUILTIN_EMPLOYEE_IDS = [
  "backend-engineer",
  "frontend-engineer",
  "devops-engineer",
  "qa-engineer",
  "security-engineer",
  "database-engineer",
] as const;

test("built-in employees keep their assigned characters", () => {
  assert.equal(characterKeyForSeed("backend-engineer"), "gloopies-1");
  assert.equal(characterKeyForSeed("frontend-engineer"), "gloopies-10");
  assert.equal(characterKeyForSeed("database-engineer"), "gloopies-16");
  assert.equal(resolveCharacter("backend-engineer"), characterByKey("gloopies-1"));
  assert.equal(resolveCharacter("builder"), characterByKey(characterKeyForSeed("builder")));
});

test("an avatar used by an employee or an older persona is not free", () => {
  const agents = [
    { id: "backend-engineer", createdAt: 0 },
    { id: "reviewer", createdAt: 10, character: "gloopies-1" },
    { id: "teacher", createdAt: 0 },
  ];
  const takenForNew = takenAvatarKeys(agents, null);
  assert.equal(takenForNew.has("gloopies-1"), true);
  assert.equal(takenForNew.has(characterKeyForSeed("teacher")), true);

  const takenForReviewer = takenAvatarKeys(agents, "reviewer");
  assert.equal(takenForReviewer.has("gloopies-1"), true);
  assert.notEqual(avatarKeyForEdit("gloopies-1", takenForReviewer), "gloopies-1");
});

test("customizing a persona keeps the avatar it already shows", () => {
  const shown = characterKeyForSeed("teacher");
  assert.equal(avatarKeyForEdit(undefined, new Set(), "teacher"), shown);
  assert.notEqual(avatarKeyForEdit(undefined, new Set([shown]), "teacher"), shown);
});

test("the persona who owns an avatar keeps it while editing", () => {
  const agents = [
    { id: "backend-engineer", createdAt: 0 },
    { id: "reviewer", createdAt: 10, character: "fuzzies-1" },
  ];
  const taken = takenAvatarKeys(agents, "reviewer");
  assert.equal(taken.has("fuzzies-1"), false);
  assert.equal(taken.has("gloopies-1"), true);
  assert.equal(avatarKeyForEdit("fuzzies-1", taken), "fuzzies-1");
});

test("built-in personas and employees each show a different avatar", () => {
  const employees = BUILTIN_EMPLOYEE_IDS.map((id) => ({ id, createdAt: 0 }));
  const personas = BUILTIN_PERSONAS.map((persona) => ({
    id: persona.id,
    createdAt: persona.createdAt,
    character: persona.character,
  }));
  const keys = [...employees, ...personas].map((agent) => displayedAvatarKey(agent));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(displayedAvatarKey({ id: "builder", createdAt: 0, character: "fuzzies-1" }), "fuzzies-1");
});

test("an uploaded icon does not reserve a collection avatar", () => {
  const agents = [{ id: "backend-engineer", createdAt: 0, icon: "data:image/png;base64,abc" }];
  assert.equal(takenAvatarKeys(agents, null).has("gloopies-1"), false);
});

test("the older persona keeps a shared explicit avatar", () => {
  const agents = [
    { id: "older", createdAt: 1, character: "pollies-1" },
    { id: "newer", createdAt: 2, character: "pollies-1" },
  ];
  assert.equal(takenAvatarKeys(agents, "older").has("pollies-1"), false);
  assert.equal(takenAvatarKeys(agents, "newer").has("pollies-1"), true);
  assert.notEqual(avatarKeyForEdit("pollies-1", takenAvatarKeys(agents, "newer")), "pollies-1");
});
