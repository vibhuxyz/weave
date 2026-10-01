import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, MAX_IMAGE_NOTE_CHARS, MAX_PROMPT_IMAGES } from "@weave/agent";
import type { PromptImage } from "@weave/agent";
import { RUN_IMAGE_ERROR } from "./constants.ts";

const IMAGE_MIMES = new Set<string>(IMAGE_MIME_TYPES);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
const MAX_IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024);

export type ParsedRunImages =
  | { readonly ok: true; readonly images: readonly PromptImage[] }
  | { readonly ok: false; readonly message: string };

type ParsedField<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

function fail(detail: string): ParsedRunImages {
  return { ok: false, message: `${RUN_IMAGE_ERROR}: ${detail}` };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mimeOf(value: unknown, label: string): ParsedField<string> {
  if (typeof value !== "string" || !IMAGE_MIMES.has(value)) {
    const shown = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 80) : "missing";
    return { ok: false, message: `${label} is ${shown === "" ? "missing" : shown}, which a parallel run cannot send.` };
  }
  return { ok: true, value };
}

function dataOf(value: unknown, label: string): ParsedField<string> {
  if (typeof value !== "string") return { ok: false, message: `${label} has no data.` };
  const data = value.replace(/\s+/g, "");
  if (data === "") return { ok: false, message: `${label} has no data.` };
  if (data.startsWith("data:") || !BASE64.test(data)) return { ok: false, message: `${label} is not valid base64.` };
  if (data.length > MAX_IMAGE_CHARS || Buffer.byteLength(data, "base64") > MAX_IMAGE_BYTES) {
    return { ok: false, message: `${label} is over ${MAX_IMAGE_MB} MB.` };
  }
  return { ok: true, value: data };
}

function noteOf(value: unknown, label: string): ParsedField<string> {
  if (value === undefined) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, message: `${label} has a note that is not text.` };
  const note = value.replace(/\s+/g, " ").trim();
  if (note.length > MAX_IMAGE_NOTE_CHARS) return { ok: false, message: `${label} note is over ${MAX_IMAGE_NOTE_CHARS} characters.` };
  return { ok: true, value: note };
}

function parseOne(value: unknown, index: number): ParsedField<PromptImage> {
  const label = `Image ${index + 1}`;
  if (!isRecord(value)) return { ok: false, message: `${label} is not an image.` };
  const mimeType = mimeOf(value.mimeType, label);
  if (!mimeType.ok) return mimeType;
  const data = dataOf(value.data, label);
  if (!data.ok) return data;
  const note = noteOf(value.prompt, label);
  if (!note.ok) return note;
  return { ok: true, value: { data: data.value, mimeType: mimeType.value, ...(note.value === "" ? {} : { prompt: note.value }) } };
}

export function parseRunImages(value: unknown): ParsedRunImages {
  if (value === undefined) return { ok: true, images: [] };
  if (!Array.isArray(value)) return fail("images must be a list.");
  if (value.length > MAX_PROMPT_IMAGES) return fail(`attach at most ${MAX_PROMPT_IMAGES} images.`);
  const images: PromptImage[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const parsed = parseOne(value[index], index);
    if (!parsed.ok) return fail(parsed.message);
    images.push(parsed.value);
  }
  return { ok: true, images };
}
