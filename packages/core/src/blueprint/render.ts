import { capLines } from "../shared/index.ts";
import { MAX_RENDERED_BYTES } from "./constants.ts";
import type { Blueprint } from "./types.ts";

export function renderBlueprint(blueprint: Blueprint): string {
  const lines = [
    `stack: ${blueprint.stack}`,
    "components:",
    ...blueprint.components.map(
      (component) => `  ${component.name} — ${component.responsibility} [${component.paths.join(", ")}]`,
    ),
    "endpoints:",
    ...blueprint.endpoints.map((endpoint) => `  ${endpoint.method} ${endpoint.path} — ${endpoint.summary}`),
    "events:",
    ...blueprint.events.map((event) => `  ${event.name} — ${event.summary}`),
    "smoke flow:",
    ...blueprint.smokeFlow.map((step, index) => `  ${index + 1}. ${step}`),
  ];
  return capLines(lines, MAX_RENDERED_BYTES);
}
