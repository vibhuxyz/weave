import { isRecord, readList, readPattern, type FieldContext } from "../shared/index.ts";
import {
  FIELD_NAME_PATTERN,
  FIELD_TYPE_PATTERN,
  MAX_FIELDS_PER_SCHEMA,
  MAX_SCHEMAS,
  PRIMITIVE_TYPES,
  SCHEMA_NAME_PATTERN,
} from "./constants.ts";
import type { BlueprintField, BlueprintSchema } from "./types.ts";

function parseField(raw: unknown, where: string, issues: string[]): BlueprintField | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const name = readPattern(ctx, "name", FIELD_NAME_PATTERN);
  const type = readPattern(ctx, "type", FIELD_TYPE_PATTERN);
  if (raw.isOptional !== undefined && typeof raw.isOptional !== "boolean") {
    issues.push(`${where}: "isOptional" must be a boolean`);
  }
  return name === null || type === null ? null : { name, type, isOptional: raw.isOptional === true };
}

function parseSchema(raw: unknown, where: string, issues: string[]): BlueprintSchema | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const name = readPattern(ctx, "name", SCHEMA_NAME_PATTERN);
  const fields = readList(ctx, "fields", MAX_FIELDS_PER_SCHEMA, parseField);
  return name === null ? null : { name, fields };
}

function referencedTypeName(fieldType: string): string | null {
  const base = fieldType.replace(/\[\]$/, "");
  return PRIMITIVE_TYPES.has(base) ? null : base;
}

export function parseSchemas(ctx: FieldContext): BlueprintSchema[] {
  const schemas = readList(ctx, "schemas", MAX_SCHEMAS, parseSchema);
  const names = new Set<string>();
  for (const schema of schemas) {
    if (names.has(schema.name)) ctx.issues.push(`Duplicate schema name ${schema.name}`);
    names.add(schema.name);
  }
  for (const schema of schemas) {
    for (const field of schema.fields) {
      const reference = referencedTypeName(field.type);
      if (reference !== null && !names.has(reference)) {
        ctx.issues.push(`Schema ${schema.name} field ${field.name} refers to unknown schema ${reference}`);
      }
    }
  }
  return schemas;
}
