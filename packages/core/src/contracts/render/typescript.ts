import type { Blueprint, BlueprintEndpoint, BlueprintEvent, BlueprintSchema } from "../../blueprint/index.ts";

function renderSchema(schema: BlueprintSchema): string {
  const fields = schema.fields.map((field) => `  ${field.name}${field.isOptional ? "?" : ""}: ${field.type};`);
  return [`export interface ${schema.name} {`, ...fields, "}"].join("\n");
}

function renderEndpoints(endpoints: readonly BlueprintEndpoint[]): string {
  const entries = endpoints.map((endpoint) => `  ${endpoint.id}: { method: "${endpoint.method}", path: "${endpoint.path}" },`);
  return ["export const ENDPOINTS = {", ...entries, "} as const;"].join("\n");
}

function renderEvents(events: readonly BlueprintEvent[]): string {
  const entries = events.map((event) => `  "${event.name}": ${event.data ?? "undefined"};`);
  return ["export interface Events {", ...entries, "}"].join("\n");
}

export function renderTypeScriptEntry(blueprint: Blueprint, version: number): string {
  return [
    `export const CONTRACT_VERSION = ${version};`,
    ...blueprint.schemas.map(renderSchema),
    renderEndpoints(blueprint.endpoints),
    renderEvents(blueprint.events),
  ].join("\n\n").concat("\n");
}
