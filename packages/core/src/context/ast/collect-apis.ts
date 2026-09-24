import ts from "typescript";
import type { ApiFact, EventFact, SymbolFact } from "../types.ts";
import { MAX_FACTS_PER_MODULE } from "../constants.ts";
import { calleeName, lineOf, stringLiteralOf } from "./syntax.ts";
import type { WalkResult } from "./walk.ts";

const ROUTE_METHODS: ReadonlySet<string> = new Set(["get", "post", "put", "patch", "delete", "all", "options", "head"]);
const HTTP_VERBS: ReadonlySet<string> = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
const EMITTERS: ReadonlySet<string> = new Set(["emit", "publish", "trigger"]);
const LISTENERS: ReadonlySet<string> = new Set(["on", "once", "subscribe", "addListener"]);
const APP_ROUTE_FILE = /(?:^|\/)app\/((?:[^/]+\/)*?)route\.[cm]?[jt]sx?$/;
const PAGES_API_FILE = /(?:^|\/)pages\/(api\/.+?)(?:\/index)?\.[cm]?[jt]sx?$/;

function routeFromCall(source: ts.SourceFile, path: string, call: ts.CallExpression): ApiFact | null {
  if (!ts.isPropertyAccessExpression(call.expression) || !ROUTE_METHODS.has(call.expression.name.text)) return null;
  const route = stringLiteralOf(call.arguments[0]);
  if (!route?.startsWith("/")) return null;
  const last = call.arguments.at(-1);
  const handler = last && call.arguments.length > 1 ? calleeName(last) : null;
  return { method: call.expression.name.text.toUpperCase(), path: route, file: path, line: lineOf(source, call), source: "route", handler };
}

function propertyText(node: ts.ObjectLiteralExpression, key: string): string | null {
  const property = node.properties.find((entry) => ts.isPropertyAssignment(entry) && ts.isIdentifier(entry.name) && entry.name.text === key);
  return property && ts.isPropertyAssignment(property) ? stringLiteralOf(property.initializer) : null;
}

function contractFromObject(source: ts.SourceFile, path: string, node: ts.ObjectLiteralExpression, owner: string | null): ApiFact | null {
  const method = propertyText(node, "method");
  const route = propertyText(node, "path");
  if (!method || !HTTP_VERBS.has(method.toUpperCase()) || !route?.startsWith("/")) return null;
  const handler = propertyText(node, "id") ?? propertyText(node, "name") ?? owner;
  return { method: method.toUpperCase(), path: route, file: path, line: lineOf(source, node), source: "contract", handler };
}

function routesFromFileName(path: string, symbols: readonly SymbolFact[]): readonly ApiFact[] {
  const appRoute = APP_ROUTE_FILE.exec(path);
  const segments = appRoute ? (appRoute[1] ?? "").split("/").filter((segment) => segment && !/^\(.*\)$/.test(segment)) : null;
  const pagesApi = PAGES_API_FILE.exec(path)?.[1];
  const routePath = segments ? `/${segments.join("/")}` : pagesApi ? `/${pagesApi}` : null;
  if (!routePath) return [];
  const verbs = symbols.filter((symbol) => symbol.isExported && HTTP_VERBS.has(symbol.name));
  const methods = verbs.length > 0 ? verbs : [{ name: "ANY", line: 1 }];
  return methods.map((verb) => ({ method: verb.name, path: routePath, file: path, line: verb.line, source: "route" as const, handler: verb.name === "ANY" ? null : verb.name }));
}

function eventFromCall(source: ts.SourceFile, path: string, call: ts.CallExpression): EventFact | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const method = call.expression.name.text;
  const role = EMITTERS.has(method) ? "emit" : LISTENERS.has(method) ? "listen" : null;
  const name = stringLiteralOf(call.arguments[0]);
  return role && name ? { name, role, file: path, line: lineOf(source, call) } : null;
}

export function collectApis(source: ts.SourceFile, path: string, walked: WalkResult, symbols: readonly SymbolFact[]): readonly ApiFact[] {
  const routes = walked.calls.flatMap((call) => routeFromCall(source, path, call.node) ?? []);
  const contracts = walked.objects.flatMap((object) => contractFromObject(source, path, object.node, object.owner) ?? []);
  return [...routesFromFileName(path, symbols), ...routes, ...contracts].slice(0, MAX_FACTS_PER_MODULE);
}

export function collectEvents(source: ts.SourceFile, path: string, walked: WalkResult): readonly EventFact[] {
  return walked.calls.flatMap((call) => eventFromCall(source, path, call.node) ?? []).slice(0, MAX_FACTS_PER_MODULE);
}
