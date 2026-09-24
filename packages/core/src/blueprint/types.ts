export const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export interface BlueprintComponent {
  name: string;
  responsibility: string;
  paths: string[];
}

export interface BlueprintField {
  name: string;
  type: string;
  isOptional: boolean;
}

export interface BlueprintSchema {
  name: string;
  fields: BlueprintField[];
}

export interface BlueprintEndpoint {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  request: string | null;
  response: string | null;
}

export interface BlueprintEvent {
  name: string;
  summary: string;
  data: string | null;
}

export interface Blueprint {
  stack: string;
  components: BlueprintComponent[];
  schemas: BlueprintSchema[];
  endpoints: BlueprintEndpoint[];
  events: BlueprintEvent[];
  smokeFlow: string[];
}

export type ParseBlueprintResult =
  | { ok: true; blueprint: Blueprint }
  | { ok: false; issues: string[] };
