import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { characterWardrobeMaskRegions, paintCharacterWardrobeMask } from "./fixtures/legacyCharacterMasks.js";
import { normalizeOpenAiEditMask, finishOpenAiMaskedEdit } from "../server/openai-edit-mask.js";

function rasterMask(width, height, kind, legacy = false) {
  const pixels = Buffer.alloc(width * height * 4);
  const rect = (x, y, w, h, color) => {
    for (let row = y; row < Math.min(height, y + h); row++) {
      for (let col = x; col < Math.min(width, x + w); col++) pixels.set(color, (row * width + col) * 4);
    }
  };
  const context = { fillStyle: "", fillRect: (x, y, w, h) => rect(x, y, w, h, context.fillStyle === "#fff" ? [255, 255, 255, 255] : [0, 0, 0, 255]),
    clearRect: (x, y, w, h) => rect(x, y, w, h, [0, 0, 0, 0]) };
  if (legacy) {
    context.fillStyle = "#000"; context.fillRect(0, 0, width, height); context.fillStyle = "#fff";
    for (const r of characterWardrobeMaskRegions(kind)) context.fillRect(Math.round(r.x * width), Math.round(r.y * height), Math.ceil(r.width * width), Math.ceil(r.height * height));
  } else paintCharacterWardrobeMask(context, width, height, kind);
  return { pixels, png: () => sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer() };
}

const image = (width, height) => sharp({ create: { width, height, channels: 3, background: "#647d91" } }).png().toBuffer();
const decode = buffer => sharp(buffer).toColourspace("srgb").ensureAlpha().raw().toBuffer();
const at = (data, width, x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];

for (const kind of ["image", "video"]) {
  test(`${kind} restores every protected pixel from the base when the provider returns black outside the edit`, async () => {
    const width = 384, height = 216, mask = rasterMask(width, height, kind);
    const source = await image(width, height), before = Buffer.from(source);
    const basePixels = await decode(source);
    const outputPixels = Buffer.alloc(width * height * 4);
    for (let i = 0; i < outputPixels.length; i += 4) {
      outputPixels.set(mask.pixels[i + 3] === 0 ? [155, 113, 77, 255] : [1, 1, 1, 255], i);
    }
    const generated = await sharp(outputPixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
    const finished = await finishOpenAiMaskedEdit({ source, mask: await mask.png() }, generated);
    const actual = await decode(finished);
    for (let i = 0; i < actual.length; i += 4) {
      if (mask.pixels[i + 3]) assert.deepEqual(actual.subarray(i, i + 4), basePixels.subarray(i, i + 4));
      else {
        for (let c = 0; c < 3; c++) {
          assert.ok(actual[i + c] >= Math.min(basePixels[i + c], outputPixels[i + c]));
          assert.ok(actual[i + c] <= Math.max(basePixels[i + c], outputPixels[i + c]));
        }
      }
    }
    assert.deepEqual(at(actual, width, 32, 130), [155, 113, 77, 255], "Clothing away from the join stays untouched");
    assert.deepEqual(source, before, "The saved base must never be modified");
    assert.equal((await sharp(finished).metadata()).width, width);
    assert.equal((await sharp(finished).metadata()).height, height);
  });

  test(`${kind} wardrobe PNG uses transparent edit regions and opaque protected faces at native size`, async () => {
    const width = 384, height = 216, mask = rasterMask(width, height, kind);
    const png = await mask.png(), metadata = await sharp(png).metadata(), pixels = await decode(png);
    assert.equal(metadata.hasAlpha, true);
    assert.equal(metadata.width, width); assert.equal(metadata.height, height);
    assert.equal(at(pixels, width, 32, 130)[3], 0);
    assert.deepEqual(at(pixels, width, 280, 42), [255, 255, 255, 255]);
    assert.equal(at(pixels, width, 280, 205)[3], 0);
    assert.equal(at(pixels, width, 32, 10)[3], kind === "video" ? 0 : 255);
    const prepared = await normalizeOpenAiEditMask({ buffer: png }, { buffer: await image(width, height) });
    assert.deepEqual(await decode(prepared.buffer), pixels, "Valid alpha masks must not be inverted or flattened");
  });

  test(`${kind} legacy opaque mask is converted to the same selection without modifying its input`, async () => {
    const width = 384, height = 216, original = await rasterMask(width, height, kind, true).png();
    const before = Buffer.from(original);
    for (const buffer of [original, await sharp(original).removeAlpha().png().toBuffer()]) {
      const converted = await normalizeOpenAiEditMask({ buffer, mimeType: "image/png" }, { buffer: await image(width, height) });
      const pixels = await decode(converted.buffer), expected = rasterMask(width, height, kind).pixels;
      assert.equal(converted.mimeType, "image/png");
      for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], expected[i]);
    }
    assert.deepEqual(original, before);
  });
}

test("masked output uses base dimensions and retains protected source transparency", async () => {
  const source = await sharp({ create: { width: 384, height: 216, channels: 4, background: { r: 80, g: 120, b: 160, alpha: 0.5 } } }).png().toBuffer();
  const generated = await image(768, 432);
  const result = await finishOpenAiMaskedEdit({ source, mask: await rasterMask(384, 216, "video").png() }, generated);
  assert.equal((await sharp(result).metadata()).width, 384);
  assert.deepEqual(at(await decode(result), 384, 280, 42), at(await decode(source), 384, 280, 42));
  assert.equal(at(await decode(result), 384, 32, 130)[3], 255);
});

test("hard masks feather only inside the editable side of the join", async () => {
  const source = await sharp({ create: { width: 384, height: 216, channels: 3, background: "#fff" } }).png().toBuffer();
  const generated = await sharp({ create: { width: 384, height: 216, channels: 3, background: "#000" } }).png().toBuffer();
  const mask = await rasterMask(384, 216, "video").png();
  const result = await decode(await finishOpenAiMaskedEdit({ source, mask }, generated));
  assert.deepEqual(at(result, 384, 192, 50), [255,255,255,255]);
  assert.ok(at(result, 384, 191, 50)[0] > at(result, 384, 190, 50)[0]);
  assert.ok(at(result, 384, 190, 50)[0] > at(result, 384, 185, 50)[0]);
  assert.deepEqual(at(result, 384, 180, 50), [0,0,0,255]);
});

test("masked output blends soft selection boundaries without darkening protected pixels", async () => {
  const mask = await sharp(Buffer.from([255,255,255,255, 255,255,255,128, 255,255,255,0]), { raw: { width: 3, height: 1, channels: 4 } }).png().toBuffer();
  const source = await sharp({ create: { width: 3, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const generated = await sharp({ create: { width: 3, height: 1, channels: 3, background: "#000000" } }).png().toBuffer();
  const result = await decode(await finishOpenAiMaskedEdit({ source, mask }, generated));
  assert.deepEqual([...result], [255,255,255,255, 128,128,128,255, 0,0,0,255]);
});

test("soft alpha boundaries survive normalization unchanged", async () => {
  const pixels = Buffer.from([255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0]);
  const mask = await sharp(pixels, { raw: { width: 3, height: 1, channels: 4 } }).png().toBuffer();
  const prepared = await normalizeOpenAiEditMask({ buffer: mask }, { buffer: await image(3, 1) });
  assert.deepEqual(await decode(prepared.buffer), pixels);
});

test("invalid mask dimensions, opaque color guides and empty selections fail clearly", async () => {
  const source = { buffer: await image(16, 16) };
  await assert.rejects(normalizeOpenAiEditMask({ buffer: await image(8, 8) }, source), /first reference image dimensions/);
  await assert.rejects(normalizeOpenAiEditMask({ buffer: source.buffer }, source), /transparency or a black-and-white selection/);
  const black = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#000" } }).png().toBuffer();
  await assert.rejects(normalizeOpenAiEditMask({ buffer: black }, source), /no editable region/);
  await assert.rejects(normalizeOpenAiEditMask({ buffer: black }), /reference image/);
});
