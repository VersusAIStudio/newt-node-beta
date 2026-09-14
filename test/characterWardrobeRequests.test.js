import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCharacterWardrobeRequest } from "../server/character-wardrobe.js";

const legacyRequest = (cu = false) => ({
  nodeId: "character-1789337293189-0v98f4",
  nodeTitle: `Character 1${cu ? " CU Video" : ""} Wardrobe Edit`,
  prompt: "Keep the saved base and apply the selected outfit.",
  imagePromptUrls: ["/outputs/base.png", "/uploads/outfit.png"],
  imagePromptLabels: [`Locked Base Identity ${cu ? "CU Video" : "Character"} Sheet`, "Selected wardrobe reference; clothing only"],
  editMaskDataUrl: "data:image/png;base64,obsolete-rectangles",
  resolution: "4K",
  quality: "high"
});

for (const cu of [false, true]) {
  test(`old open ${cu ? "CU" : "regular"} Character tabs cannot send rectangle masks`, () => {
    const original = legacyRequest(cu);
    const result = normalizeCharacterWardrobeRequest(original);
    const { editMaskDataUrl, ...expected } = original;
    assert.deepEqual(result, { ...expected, characterWardrobeEdit: true });
    assert.ok(original.editMaskDataUrl, "Do not mutate callers' saved request data");
  });
}

test("explicit wardrobe edits discard obsolete masks without changing prompt, references or settings", () => {
  const original = { ...legacyRequest(), characterWardrobeEdit: true, nodeId: "imported-id", nodeTitle: "Renamed" };
  const { editMaskDataUrl, ...expected } = original;
  const result = normalizeCharacterWardrobeRequest(original);
  assert.deepEqual(result, expected);
  assert.deepEqual(normalizeCharacterWardrobeRequest(result), result);
});

test("ordinary image masks and incomplete lookalike requests remain untouched", () => {
  for (const overrides of [
    { nodeId: "imageModel-1" },
    { nodeTitle: "Character 1" },
    { imagePromptLabels: ["Original image", "Drawing guide"] },
    { imagePromptUrls: ["/uploads/original.png"] },
    { characterWardrobeEdit: "true", nodeId: "imageModel-1" }
  ]) {
    const request = { ...legacyRequest(), ...overrides };
    assert.strictEqual(normalizeCharacterWardrobeRequest(request), request);
    assert.ok(request.editMaskDataUrl);
  }
  assert.deepEqual(normalizeCharacterWardrobeRequest(), {});
});
