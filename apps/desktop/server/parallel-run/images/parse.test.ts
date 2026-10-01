import test from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGE_NOTE_CHARS, MAX_PROMPT_IMAGES } from "@weave/agent";
import { parseRunImages } from "./parse.ts";

const SECRET = "TOPSECRETDATA";
const png = { data: Buffer.from("cart").toString("base64"), mimeType: "image/png", prompt: "cart page" };

test("a screenshot is kept, and its bytes never appear in an error", () => {
  assert.deepEqual(parseRunImages([png]), { ok: true, images: [png] });
  assert.deepEqual(parseRunImages(undefined), { ok: true, images: [] });
  const refused = parseRunImages([{ data: Buffer.from(SECRET).toString("base64"), mimeType: "text/html", prompt: SECRET }]);
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.match(refused.message, /text\/html/);
    assert.equal(refused.message.includes(SECRET), false);
    assert.equal(refused.message.includes(Buffer.from(SECRET).toString("base64")), false);
  }
});

test("a parallel run refuses too many images, a data url, and a note that is too long", () => {
  const images = Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => png);
  assert.equal(parseRunImages(images).ok, false);
  assert.equal(parseRunImages([{ data: "data:image/png;base64,YQ==", mimeType: "image/png" }]).ok, false);
  assert.equal(parseRunImages([{ data: png.data, mimeType: "image/png", prompt: "x".repeat(MAX_IMAGE_NOTE_CHARS + 1) }]).ok, false);
  const spaced = parseRunImages([{ data: `${png.data.slice(0, 4)}\n${png.data.slice(4)}`, mimeType: "image/png", prompt: "cart\npage" }]);
  assert.deepEqual(spaced, { ok: true, images: [{ data: png.data, mimeType: "image/png", prompt: "cart page" }] });
});
