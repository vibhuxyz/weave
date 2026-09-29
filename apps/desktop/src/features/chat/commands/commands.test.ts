import test from "node:test";
import assert from "node:assert/strict";
import { commandQueryOf, matchCommands, SLASH_COMMANDS } from "./catalog";

test("a lone slash at the start of the box opens the menu, and typing narrows it", () => {
  assert.deepEqual(matchCommands(commandQueryOf("/")).map((command) => command.id), SLASH_COMMANDS.map((command) => command.id));
  assert.deepEqual(matchCommands(commandQueryOf("/pa")).map((command) => command.id), ["parallel"]);
  assert.deepEqual(matchCommands(commandQueryOf("/PARA")).map((command) => command.id), []);
  assert.deepEqual(matchCommands(commandQueryOf("/zzz")), []);
});

test("the menu stays out of the way of ordinary typing", () => {
  assert.equal(commandQueryOf("fix the /parallel docs"), null);
  assert.equal(commandQueryOf("/parallel build a todo app"), null);
  assert.equal(commandQueryOf("/parallel "), null);
  assert.equal(commandQueryOf(""), null);
});

test("the run command is offered first, and its trigger is what the composer inserts", () => {
  const first = SLASH_COMMANDS[0];
  assert.equal(first?.id, "parallel");
  assert.equal(first?.trigger, "/parallel");
  assert.equal(first?.takesPrompt, true);
});
