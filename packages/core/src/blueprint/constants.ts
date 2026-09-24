export const MAX_STACK_CHARS = 300;
export const MAX_TEXT_CHARS = 200;
export const MAX_COMPONENTS = 8;
export const MAX_COMPONENT_PATHS = 10;
export const MAX_PATH_CHARS = 200;
export const MAX_SCHEMAS = 40;
export const MAX_FIELDS_PER_SCHEMA = 30;
export const MAX_ENDPOINTS = 40;
export const MAX_EVENTS = 20;
export const MAX_SMOKE_STEPS = 20;
export const MAX_RENDERED_BYTES = 4096;

export const COMPONENT_NAME_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;
export const SCHEMA_NAME_PATTERN = /^[A-Z][A-Za-z0-9]{0,63}$/;
export const FIELD_NAME_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;
export const FIELD_TYPE_PATTERN = /^(string|number|boolean|[A-Z][A-Za-z0-9]{0,63})(\[\])?$/;
export const ENDPOINT_ID_PATTERN = /^[a-z][A-Za-z0-9]{0,63}$/;
export const ENDPOINT_PATH_PATTERN = /^\/[A-Za-z0-9/_:-]{0,200}$/;
export const EVENT_NAME_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;

export const PRIMITIVE_TYPES: ReadonlySet<string> = new Set(["string", "number", "boolean"]);
