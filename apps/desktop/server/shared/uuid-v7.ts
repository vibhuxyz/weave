import { randomBytes } from "node:crypto";

const UUID_BYTES = 16;
const TIMESTAMP_BYTES = 6;
const VERSION_BYTE_INDEX = 6;
const VARIANT_BYTE_INDEX = 8;
const VERSION_7_BITS = 0x70;
const LOW_NIBBLE_MASK = 0x0f;
const VARIANT_BITS = 0x80;
const VARIANT_MASK = 0x3f;
const UUID_GROUP_BOUNDS = [0, 8, 12, 16, 20, 32] as const;

export function uuidV7(nowMs: number): string {
  const bytes = randomBytes(UUID_BYTES);
  bytes.writeUIntBE(nowMs, 0, TIMESTAMP_BYTES);
  bytes.writeUInt8((bytes.readUInt8(VERSION_BYTE_INDEX) & LOW_NIBBLE_MASK) | VERSION_7_BITS, VERSION_BYTE_INDEX);
  bytes.writeUInt8((bytes.readUInt8(VARIANT_BYTE_INDEX) & VARIANT_MASK) | VARIANT_BITS, VARIANT_BYTE_INDEX);
  const hex = bytes.toString("hex");
  const groups: string[] = [];
  for (let index = 1; index < UUID_GROUP_BOUNDS.length; index += 1) {
    groups.push(hex.slice(UUID_GROUP_BOUNDS[index - 1], UUID_GROUP_BOUNDS[index]));
  }
  return groups.join("-");
}
