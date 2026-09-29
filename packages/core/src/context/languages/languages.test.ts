import test from "node:test";
import assert from "node:assert/strict";
import { adapterFor } from "./registry.ts";

function factsOf(path: string, text: string) {
  const adapter = adapterFor(path);
  assert.ok(adapter, `no adapter for ${path}`);
  return adapter.parse(path, text);
}

test("python imports, classes, methods and calls are extracted with qualified names", () => {
  const facts = factsOf(
    "app/auth/service.py",
    [
      "import os",
      "from app.auth.tokens import issue_token, verify_token",
      "",
      "MAX_SESSIONS = 5",
      "",
      "class AuthService:",
      "    def login(self, user):",
      "        return issue_token(user)",
      "",
      "    def _secret(self):",
      "        return None",
      "",
      "def logout(session):",
      "    verify_token(session)",
    ].join("\n"),
  );

  assert.deepEqual(facts.imports.map((each) => each.specifier), ["os", "app.auth.tokens"]);
  assert.deepEqual(
    facts.imports[1]?.bindings.map((each) => each.local),
    ["issue_token", "verify_token"],
  );
  assert.deepEqual(
    facts.symbols.map((each) => `${each.name}:${each.kind}:${each.isExported}`),
    [
      "MAX_SESSIONS:variable:true",
      "AuthService:class:true",
      "AuthService.login:function:true",
      "AuthService._secret:function:false",
      "logout:function:true",
    ],
  );
  assert.deepEqual(
    facts.calls.map((each) => `${each.caller ?? "-"}>${each.callee}`),
    ["AuthService.login>issue_token", "logout>verify_token"],
  );
});

test("go receivers, exported names and imports are extracted", () => {
  const facts = factsOf(
    "internal/auth/session.go",
    [
      "package auth",
      "",
      "import (",
      '\t"context"',
      '\t"example.com/api/internal/tokens"',
      ")",
      "",
      "type Session struct {",
      "\tID string",
      "}",
      "",
      "func (s *Session) Renew() error {",
      "\treturn tokens.Issue(s.ID)",
      "}",
      "",
      "func newSession() *Session {",
      "\treturn &Session{}",
      "}",
    ].join("\n"),
  );

  assert.deepEqual(facts.imports.map((each) => each.specifier), ["context", "example.com/api/internal/tokens"]);
  assert.deepEqual(
    facts.symbols.map((each) => `${each.name}:${each.kind}:${each.isExported}`),
    ["Session:class:true", "Session.Renew:function:true", "newSession:function:false"],
  );
  assert.ok(facts.calls.some((each) => each.callee === "tokens.Issue" && each.caller === "Renew"));
});

test("rust, java, ruby and c adapters extract their own declarations", () => {
  const rust = factsOf(
    "src/auth/mod.rs",
    ["use crate::tokens::issue;", "", "pub struct Session {}", "", "pub fn login() -> bool {", "    issue()", "}"].join("\n"),
  );
  assert.deepEqual(rust.imports.map((each) => each.specifier), ["crate::tokens::issue"]);
  assert.deepEqual(rust.symbols.map((each) => `${each.name}:${each.isExported}`), ["Session:true", "login:true"]);

  const java = factsOf(
    "src/main/java/com/example/AuthService.java",
    [
      "package com.example;",
      "import com.example.tokens.TokenIssuer;",
      "",
      "public class AuthService {",
      "    public String login(String user) {",
      "        return TokenIssuer.issue(user);",
      "    }",
      "}",
    ].join("\n"),
  );
  assert.deepEqual(java.imports.map((each) => each.specifier), ["com.example.tokens.TokenIssuer"]);
  assert.deepEqual(java.symbols.map((each) => each.name), ["AuthService", "AuthService.login"]);

  const ruby = factsOf(
    "app/auth/session.rb",
    ['require_relative "tokens"', "", "class Session", "  def login", "    Tokens.issue", "  end", "end"].join("\n"),
  );
  assert.deepEqual(ruby.imports.map((each) => each.specifier), ["tokens"]);
  assert.deepEqual(ruby.symbols.map((each) => each.name), ["Session", "Session.login"]);

  const c = factsOf(
    "src/auth.c",
    ['#include "tokens.h"', "", "int login(const char *user) {", "    return issue(user);", "}"].join("\n"),
  );
  assert.deepEqual(c.imports.map((each) => each.specifier), ["tokens.h"]);
  assert.deepEqual(c.symbols.map((each) => each.name), ["login"]);
});

test("comments and string literals never produce imports, symbols or calls", () => {
  const facts = factsOf(
    "app/auth/notes.py",
    [
      "# from app.fake import nothing",
      '"""',
      "def ghost():",
      '"""',
      'MESSAGE = "def not_a_function(): import evil"',
      "def real():",
      "    pass",
    ].join("\n"),
  );
  assert.deepEqual(facts.imports, []);
  assert.deepEqual(facts.symbols.map((each) => each.name), ["MESSAGE", "real"]);
  assert.deepEqual(facts.calls, []);
});

test("parsing the same text twice gives the same facts", () => {
  const source = ["from app.auth import login", "", "def run():", "    login()"].join("\n");
  assert.deepEqual(factsOf("a.py", source), factsOf("a.py", source));
});
