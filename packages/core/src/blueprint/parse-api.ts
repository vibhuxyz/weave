import {
  isRecord,
  readList,
  readOptionalString,
  readPattern,
  readString,
  type FieldContext,
} from "../shared/index.ts";
import {
  ENDPOINT_ID_PATTERN,
  ENDPOINT_PATH_PATTERN,
  EVENT_NAME_PATTERN,
  MAX_ENDPOINTS,
  MAX_EVENTS,
  MAX_TEXT_CHARS,
} from "./constants.ts";
import { HTTP_METHODS, type BlueprintEndpoint, type BlueprintEvent, type BlueprintSchema } from "./types.ts";

function readMethod(ctx: FieldContext): BlueprintEndpoint["method"] | null {
  const value = readString(ctx, "method", MAX_TEXT_CHARS);
  const method = HTTP_METHODS.find((candidate) => candidate === value);
  if (value !== null && !method) ctx.issues.push(`${ctx.where}: "method" ${JSON.stringify(value)} is not an HTTP method`);
  return method ?? null;
}

function parseEndpoint(raw: unknown, where: string, issues: string[]): BlueprintEndpoint | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const id = readPattern(ctx, "id", ENDPOINT_ID_PATTERN);
  const method = readMethod(ctx);
  const path = readPattern(ctx, "path", ENDPOINT_PATH_PATTERN);
  const summary = readString(ctx, "summary", MAX_TEXT_CHARS);
  const request = readOptionalString(ctx, "request", MAX_TEXT_CHARS);
  const response = readOptionalString(ctx, "response", MAX_TEXT_CHARS);
  if (id === null || method === null || path === null || summary === null) return null;
  return { id, method, path, summary, request, response };
}

function parseEvent(raw: unknown, where: string, issues: string[]): BlueprintEvent | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const name = readPattern(ctx, "name", EVENT_NAME_PATTERN);
  const summary = readString(ctx, "summary", MAX_TEXT_CHARS);
  const data = readOptionalString(ctx, "data", MAX_TEXT_CHARS);
  return name === null || summary === null ? null : { name, summary, data };
}

export function parseEndpoints(ctx: FieldContext): BlueprintEndpoint[] {
  const endpoints = readList(ctx, "endpoints", MAX_ENDPOINTS, parseEndpoint);
  const ids = new Set<string>();
  for (const endpoint of endpoints) {
    if (ids.has(endpoint.id)) ctx.issues.push(`Duplicate endpoint id ${endpoint.id}`);
    ids.add(endpoint.id);
  }
  return endpoints;
}

export function parseEvents(ctx: FieldContext): BlueprintEvent[] {
  return readList(ctx, "events", MAX_EVENTS, parseEvent);
}

export function checkReferences(
  schemas: readonly BlueprintSchema[],
  endpoints: readonly BlueprintEndpoint[],
  events: readonly BlueprintEvent[],
): string[] {
  const known = new Set(schemas.map((schema) => schema.name));
  const references = [
    ...endpoints.flatMap((endpoint) => [
      { owner: `Endpoint ${endpoint.id}`, name: endpoint.request },
      { owner: `Endpoint ${endpoint.id}`, name: endpoint.response },
    ]),
    ...events.map((event) => ({ owner: `Event ${event.name}`, name: event.data })),
  ];
  return references
    .filter((reference) => reference.name !== null && !known.has(reference.name))
    .map((reference) => `${reference.owner} refers to unknown schema ${reference.name}`);
}
