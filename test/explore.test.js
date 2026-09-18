import test from "node:test";
import { isCoverageNode } from "../src/coveragePresets.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { exploreDefaults, exploreRequest, normalizeExploreData, exploreSelectionPatch, validateExplorePlan, exploreImagePrompt, explorePlanningInstructions, exploreGrades, exploreReferenceDescription } from "../src/explore.js";
import { gradePresetPrompts } from "../src/colorLook.js";
import { normalizedResultItems } from "../src/mediaResults.js";
import { runExploreGeneration } from "../src/nodeRunners/explore.js";
import { clearStaleRunningState } from "../src/workflowState.js";
import { registerExploreRoutes } from "../server/routes/explore.js";
import { validateCreativeResponse, openAiLlmBody, falLlmInput } from "../server/creative-llm.js";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { shouldNotifyNodeGenerationComplete } from "../src/generationChime.js";
import { nodeApi } from "../src/api/newtApi.js";

const direction = (name = "Sculptural light") => ({ name, concept: `${name}: a purposeful still life`, composition: "Off-center, generous negative space",
  lighting: "Hard directional key", palette: "Black, white, yellow", treatment: "Precise editorial photography", styleBrief: "Graphic lighting and restrained materials.", prompt: `A single image with ${name}.` });
const input = (patch = {}) => ({ data: exploreDefaults(), prompt: "A perfume bottle", references: [], ...patch });
const item = (name = "Sculptural light") => ({ url: `/outputs/${name}.png`, type: "image", label: name, direction: direction(name) });

test("Explore defaults, normalization, selection and port-independent style survive persistence", () => {
  const data = normalizeExploreData({ ...exploreDefaults(), resultItems: [item(), item("Reflections")], selectedResultIndex: 1, custom: "keep" });
  assert.equal(data.resultText, direction().styleBrief);
  assert.equal(data.resultUrl, item("Reflections").url);
  assert.equal(data.custom, "keep");
  assert.deepEqual(normalizeExploreData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(exploreSelectionPatch(data, 0).resultUrl, item().url);
  assert.equal(exploreDefaults().model, "OpenAI Image 2.5 Flare");
  assert.equal(exploreDefaults().quality, "medium");
  assert.equal(exploreDefaults().directionCount, 9);
  assert.ok(nodeTypeDefinitions.some(node => node.type === "explore"));
});

test("new Explore defaults survive normalization without changing saved model, quality or direction choices", () => {
  const data = normalizeExploreData();
  assert.equal(data.model, "OpenAI Image 2.5 Flare");
  assert.equal(data.quality, "medium");
  assert.equal(data.directionCount, 9);
  assert.equal(exploreRequest(input()).count, 9);
  assert.equal(normalizeExploreData({ directionCount: 100 }).directionCount, 25);
  assert.equal(normalizeExploreData({ directionCount: 25 }).directionCount, 25);
  const saved = normalizeExploreData({ model: "Nano Banana Pro", quality: "high", directionCount: 4 });
  assert.equal(saved.model, "Nano Banana Pro");
  assert.equal(saved.quality, "high");
  assert.equal(saved.directionCount, 4);
});

test("planning is bounded and rejects missing briefs, parents and refinement notes", () => {
  assert.throws(() => exploreRequest(input({ prompt: " " })), /brief/);
  assert.equal(exploreRequest(input({ data: { directionCount: 8, variations: 3 } })).count, 8);
  assert.throws(() => exploreRequest(input({ action: "refine", parents: [item()] })), /Describe/);
  assert.throws(() => exploreRequest(input({ action: "combine", parents: [item()], note: "Mix" })), /two/);
  assert.throws(() => exploreRequest(input({ references: Array(9).fill({ url: "/outputs/a.png" }) })), /eight/);
  assert.throws(() => exploreRequest(input({ action: "invent" })), /supported/);
});

test("removed Advanced Outputs state is discarded without altering saved images or direction details", () => {
  assert.equal(Object.hasOwn(exploreDefaults(), "advancedOutputsOpen"), false);
  const legacy = normalizeExploreData({ resultItems: [item()], selectedResultIndex: 0 });
  const open = normalizeExploreData(JSON.parse(JSON.stringify({ ...legacy, advancedOutputsOpen: true })));
  assert.equal(Object.hasOwn(open, "advancedOutputsOpen"), false);
  assert.equal(open.resultText, legacy.resultText);
  assert.equal(open.resultUrl, legacy.resultUrl);
  assert.deepEqual(open.resultItems, legacy.resultItems);
  assert.deepEqual(normalizeExploreData({ ...open, advancedOutputsOpen: false }), legacy);
});

test("medium, reference authority and cinematic craft are explicit rather than a universal film filter", () => {
  assert.match(explorePlanningInstructions, /Graphic\/logo tasks require clean marks/);
  assert.match(explorePlanningInstructions, /not merely in grade/);
  assert.match(explorePlanningInstructions, /None of these settings weakens subject\/identity fidelity/);
  const request = exploreRequest(input({ references: [{ url: "/outputs/product.png", role: "product", label: "Bottle" }, { url: "/outputs/mood.png", role: "mood", label: "Lighting" }], camera: "35mm", style: "Muted color" }));
  const prompt = exploreImagePrompt(request, direction(), 1);
  assert.match(prompt, /1: product - Bottle; 2: mood - Lighting/);
  assert.match(prompt, /Variation 2/);
  assert.match(prompt, /35mm/);
  assert.match(prompt, /Muted color/);
});

test("Astra structured output and Fal local validation reject malformed, duplicate and incomplete plans", () => {
  const request = { route: "explore-plan", model: "gpt-6-astra", prompt: "test", responseMimeType: "application/json", reasoningEffort: "medium" };
  assert.equal(openAiLlmBody(request).text.format.type, "json_schema");
  assert.equal(falLlmInput({ ...request, model: "openai/gpt-6-astra" }).reasoning, true);
  const plan = { directions: [direction(), direction("Reflections")] };
  assert.deepEqual(validateExplorePlan(plan, 2), plan);
  assert.throws(() => validateExplorePlan(plan, 3), /expected/);
  assert.throws(() => validateExplorePlan({ directions: [direction(), direction()] }, 2), /duplicate/);
  assert.throws(() => validateCreativeResponse({}, { route: request.route, provider: "mock", text: '{"directions":[{"name":"Test"}]}' }), /planning data/);
  assert.throws(() => validateCreativeResponse({ status: "incomplete" }, { route: request.route, provider: "mock", text: JSON.stringify(plan) }), /incomplete/);
});

function runnerFixture(patch = {}, options = {}) {
  let data = { ...exploreDefaults(), directionCount: 2, prompt: "Bottle", ...patch }, plans = 0, generations = [];
  const run = () => runExploreGeneration({ node: { id: "explore-test", data, type: "explore" }, prompt: data.prompt, references: [], workflowContext: { projectId: "test" },
    update: update => { data = { ...data, ...structuredClone(update) }; options.onUpdate?.(data); }, shouldStop: options.shouldStop,
    plan: async request => { plans++; return { directions: Array.from({ length: request.count }, (_, index) => direction(`Direction ${index + 1}`)) }; },
    generate: async args => { generations.push(args); if (options.generate) return options.generate(args, generations.length); return [item(`Image ${generations.length}`)]; }
  });
  return { run, data: () => data, plans: () => plans, generations, patch: patch => { data = { ...data, ...patch }; } };
}

test("full exploration preserves old outputs and appends each image with its reusable direction", async () => {
  const fixture = runnerFixture({ resultItems: [item("Existing")] });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 2);
  assert.equal(fixture.data().resultItems.length, 3);
  assert.equal(fixture.data().resultItems[0].label, "Existing");
  assert.equal(fixture.data().selectedResultIndex, 1);
  assert.equal(fixture.data().exploreQueue.every(item => item.status === "complete"), true);
  assert.equal(fixture.generations[0].workflowContext.projectId, "test");
});

test("the default run plans and generates all nine images with Flare medium quality", async () => {
  const fixture = runnerFixture({ ...exploreDefaults(), prompt: "A perfume bottle" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 9);
  assert.equal(fixture.data().resultItems.length, 9);
  for (const generation of fixture.generations) {
    assert.equal(generation.node.data.model, "OpenAI Image 2.5 Flare");
    assert.equal(generation.node.data.quality, "medium");
  }
});

test("More Like This reuses direction planning and references the exact selected image", async () => {
  const fixture = runnerFixture({ resultItems: [item()], exploreAction: "more", exploreParentIndexes: [0], variations: 2 });
  await fixture.run();
  assert.equal(fixture.plans(), 0);
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.generations[0].imagePromptItems[0].url, item().url);
  assert.match(fixture.generations[0].imagePromptItems[0].label, /direction/);
});

test("Grade survives persistence and reaches planning and image prompts without replacing reference guidance", async () => {
  assert.equal(exploreDefaults().gradePreset, "None");
  assert.equal(exploreGrades.includes("Custom"), false, "custom palettes remain in the connected Style node");
  for (const gradePreset of exploreGrades) {
    const request = exploreRequest(input({ data: { gradePreset }, style: "Painterly 3D", camera: "Wide lens" }));
    assert.equal(request.grade, gradePresetPrompts[gradePreset] || "");
    assert.equal(normalizeExploreData(JSON.parse(JSON.stringify({ gradePreset }))).gradePreset, gradePreset);
    const prompt = exploreImagePrompt(request, direction());
    assert.ok(!request.grade || prompt.includes(request.grade));
    assert.match(prompt, /Painterly 3D/);
    assert.match(prompt, /Wide lens/);
  }
  let handler, planned;
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async options => { planned = JSON.parse(options.prompt); return { text: JSON.stringify({ directions: [direction()] }) }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const request = exploreRequest(input({ data: { directionCount: 1, gradePreset: "Jaws of Life" }, style: "Keep typography flat" }));
  const res = { status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
  await handler({ body: request }, res);
  assert.equal(res.value.directions.length, 1);
  assert.equal(planned.grade, request.grade, "server reconstructs the same grade exactly once");
  assert.equal(planned.style, request.style);
  const fixture = runnerFixture({ gradePreset: "Jaws of Life" });
  await fixture.run();
  assert.ok(fixture.generations.every(call => call.prompt.includes(request.grade)));
  assert.equal(fixture.data().resultItems[0].exploreSettings.gradePreset, "Jaws of Life");
  assert.ok(fixture.data().resultText.includes(request.grade), "direction details retain the generated image's grade");
  assert.ok(normalizeExploreData({ ...fixture.data(), gradePreset: "Cool" }).resultText.includes(request.grade), "changing future settings does not relabel an existing image");
});

test("new runs ignore old variation multipliers but unfinished legacy queues preserve their images and grade", async () => {
  const fixture = runnerFixture({ variations: 3, gradePreset: "Warm" });
  await fixture.run();
  assert.equal(fixture.generations.length, 2);
  const queue = fixture.data().exploreQueue;
  const legacy = [{ ...queue[0], status: "complete" }, { ...queue[0], id: "legacy:1", variation: 1, status: "pending" },
    { ...queue[0], id: "legacy:2", variation: 2, status: "failed" }];
  fixture.patch({ exploreQueue: legacy, exploreAction: "retry", gradePreset: "Cool" });
  await fixture.run();
  assert.equal(fixture.generations.length, 4);
  assert.equal(fixture.plans(), 1);
  assert.match(fixture.generations.at(-1).prompt, /Variation 3/);
  assert.ok(fixture.generations.at(-1).prompt.includes(gradePresetPrompts.Warm));
  assert.equal(fixture.data().resultItems.at(-1).label, "Direction 1 3");
});

test("reference descriptions show source names and connected settings without losing multiple assets", () => {
  const source = data => ({ source: { data } });
  assert.equal(exploreReferenceDescription("imageIn"), "");
  assert.equal(exploreReferenceDescription("imageIn", [source({ title: "Bottle", fileName: "product.jpg" }), source({ title: "Packaging" })]), "Bottle: product.jpg\nPackaging");
  assert.equal(exploreReferenceDescription("styleIn", [source({ title: "Look", stylePreset: "Vintage 8mm", gradePreset: "Jaws of Life" })]), "Look: Vintage 8mm / Jaws of Life");
  assert.equal(exploreReferenceDescription("cameraIn", [source({ title: "Camera", shotPreset: "Wide", lensPreset: "35mm", typePreset: "None" })]), "Camera: Wide / 35mm");
});

test("Preview's actual source helper receives all full-resolution Explore images, with direction labels and selection", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function connectedPreviewSources(");
  const helpers = editor.slice(start, editor.indexOf("function normalizedPreviewLayoutItems(", start));
  const preview = new Function("normalizedResultItems", "sourceLabel", "previewMediaType", "isCoverageNode", `${helpers}; return connectedPreviewSources;`)(normalizedResultItems, source => source.data.title, () => "image", isCoverageNode);
  const source = { id: "e", type: "explore", data: { title: "Explore", resultItems: [item(), item("Reflections")], selectedResultIndex: 1, resultUrl: item("Reflections").url } };
  const result = preview([{ source, edge: { from: { port: "imageOut" } } }]);
  assert.deepEqual(result[0].items.map(item => item.url), source.data.resultItems.map(item => item.url));
  assert.deepEqual(result[0].items.map(item => item.label), ["Sculptural light", "Reflections"]);
  assert.equal(result[0].items[1].sourceSelectedResult, true);
  assert.equal(result[0].items[1].sourceResultIndex, 1);
  assert.deepEqual(preview([{ source, edge: { from: { port: "styleOut" } } }]), []);
  assert.deepEqual(preview([{ source, edge: { from: { port: "promptOut" } } }]), []);
});

test("a failed candidate preserves successful siblings; resume never replans or repeats successes", async () => {
  const fixture = runnerFixture({}, { generate: async (_, index) => { if (index === 1) throw new Error("Provider rejected the dimensions"); return [item(`Image ${index}`)]; } });
  assert.equal((await fixture.run()).status, "error");
  assert.equal(fixture.data().resultItems.length, 1);
  fixture.patch({ exploreAction: "retry", model: "OpenAI Image 2" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 3);
  assert.equal(fixture.generations.at(-1).node.data.model, "OpenAI Image 2.5 Flare", "resume uses original settings");
});

test("stop waits for the current request and leaves the rest unsubmitted", async () => {
  let stop = false;
  const fixture = runnerFixture({}, { shouldStop: () => stop, generate: async () => { stop = true; return [item()]; } });
  assert.equal((await fixture.run()).status, "error", "downstream scheduling is blocked for a paused batch");
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.data().status, "paused");
  assert.equal(fixture.data().exploreQueue[1].status, "pending");
});

test("uncertain and recovered requests cannot be resumed automatically", async () => {
  const fixture = runnerFixture({}, { generate: async () => { throw new Error("Connection interrupted; image may still be generating"); } });
  await fixture.run();
  assert.equal(fixture.generations.length, 1);
  fixture.patch({ exploreAction: "retry" });
  await assert.rejects(fixture.run(), /interrupted/);
  const restored = clearStaleRunningState({ type: "explore", data: { status: "running", exploreQueue: [{ status: "running" }, { status: "pending" }] } });
  assert.equal(restored.data.exploreQueue[0].status, "uncertain");
  assert.equal(restored.data.exploreQueue[1].status, "pending");
});

test("Explore chimes once after the full batch, not incremental results or a paused run", () => {
  const previous = { id: "a", type: "explore", data: { status: "running" } };
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "running", resultItems: [item()] } }), false);
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "complete" } }), true);
  assert.equal(shouldNotifyNodeGenerationComplete(previous, { ...previous, data: { status: "paused" } }), false);
});

test("planning route records successful and rejected paid usage, sends labeled images in one request", async () => {
  let handler, calls = [], history = [], output = { directions: [direction(), direction("Reflections")] };
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, { runTextLlm: async () => { throw Error("Unexpected text-only call"); },
    runMediaDescriptionLlm: async args => { calls.push(args); return { text: JSON.stringify(output), provider: "mock", model: "gpt-6-astra", usages: [{ cost: .01 }] }; },
    recordHistory: async entry => { history.push(entry); }, estimateCost: () => ({ amountUsd: .01 }) });
  const body = { ...exploreRequest(input({ data: { directionCount: 2 }, references: [{ role: "product", label: "Bottle", url: "/outputs/bottle.png" }] })), nodeId: "test" };
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } });
  const res = response(); await handler({ body }, res);
  assert.equal(res.code, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].inputs[0].label, "product: Bottle");
  assert.equal(history[0].cost.amountUsd, .01);
  output = { directions: [direction()] };
  const failed = response(); await handler({ body }, failed);
  assert.equal(failed.code, 400);
  assert.equal(history.length, 2);
  assert.match(history[1].error, /expected/);
  const invalid = response(); await handler({ body: { ...body, references: [{ role: "product", url: "https://untrusted.example/file" }] } }, invalid);
  assert.equal(invalid.code, 400);
  assert.equal(calls.length, 2);
});

test("the planning route and structured schema accept 25 directions and reject oversized batches", async () => {
  let handler, calls = 0;
  const plan = { directions: Array.from({ length: 25 }, (_, index) => direction(`Look ${index + 1}`)) };
  const llmRequest = { route: "explore-plan", model: "gpt-6-astra", prompt: "test", responseMimeType: "application/json" };
  assert.equal(openAiLlmBody(llmRequest).text.format.schema.properties.directions.maxItems, 25);
  assert.equal(openAiLlmBody(llmRequest).max_output_tokens, 24000);
  assert.equal(falLlmInput({ ...llmRequest, model: "openai/gpt-6-astra" }).max_tokens, 24000);
  assert.doesNotThrow(() => validateCreativeResponse({}, { route: "explore-plan", provider: "mock", text: JSON.stringify(plan) }));
  registerExploreRoutes({ post: (_, fn) => { handler = fn; } }, {
    runTextLlm: async args => { calls++; assert.equal(JSON.parse(args.prompt).count, 25); return { text: JSON.stringify(plan), provider: "mock", model: "gpt-6-astra" }; },
    recordHistory: async () => {}, estimateCost: () => ({ amountUsd: 0 })
  });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(value) { this.value = value; } });
  const body = exploreRequest(input({ data: { directionCount: 25 } })), ok = response();
  await handler({ body }, ok);
  assert.equal(ok.code, 200); assert.equal(ok.value.directions.length, 25);
  for (const count of [0, 26, 9.5]) {
    const rejected = response(); await handler({ body: { ...body, count } }, rejected);
    assert.equal(rejected.code, 400);
  }
  assert.equal(calls, 1);
  assert.throws(() => validateCreativeResponse({}, { route: "explore-plan", provider: "mock", text: JSON.stringify({ directions: [...plan.directions, direction("Look 26")] }) }), /planning data/);
});

test("a 25-image batch can pause and resume without replanning or repeating completed images", async () => {
  let stop = false;
  const fixture = runnerFixture({ directionCount: 25 }, {
    shouldStop: () => stop,
    generate: async (_, index) => { if (index === 1) stop = true; return [item(`Image ${index}`)]; }
  });
  await fixture.run();
  assert.equal(fixture.data().exploreQueue.length, 25);
  assert.equal(fixture.generations.length, 1);
  assert.equal(fixture.data().status, "paused");
  stop = false;
  fixture.patch({ exploreAction: "retry" });
  assert.equal((await fixture.run()).status, "complete");
  assert.equal(fixture.plans(), 1);
  assert.equal(fixture.generations.length, 25);
  assert.equal(fixture.data().resultItems.length, 25);
  assert.equal(new Set(fixture.generations.map(item => item.prompt)).size, 25);
  assert.ok(fixture.data().exploreQueue.every(item => item.status === "complete"));
});

test("resuming over-limit queues is rejected before any planning or generation calls", async () => {
  const fixture = runnerFixture({ exploreAction: "retry", exploreQueue: Array.from({ length: 26 }, () => ({ status: "pending" })) });
  await assert.rejects(fixture.run(), /up to 25/);
  assert.equal(fixture.plans(), 0);
  assert.equal(fixture.generations.length, 0);
});

test("Explore integration retains typed ports, output rail and manual-only agent guards", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(editor, /manualOnly: \[.*"explore"/);
  assert.match(editor, /if \(type === "explore"\) return \{ title, \.\.\.exploreDefaults\(\) \}/);
  assert.match(editor, /source\?\.type === "explore" && edge\?\.from\?\.port !== "imageOut"/);
  assert.match(editor, /exploreRunsRef\.current\.has/);
});

test("new batches carry bounded prior directions without copying their full prompts", () => {
  const request = exploreRequest(input({ data: { exploreDirections: Array.from({ length: 25 }, (_, i) => direction(`Look ${i}`)) } }));
  assert.equal(request.previousDirections.length, 16);
  assert.equal(request.previousDirections[0].name, "Look 9");
  assert.equal(request.previousDirections[0].prompt, undefined);
  assert.throws(() => exploreRequest(input({ references: [null] })), /valid URLs/);
});

test("an uncertain planning POST is never replayed", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Socket closed"); });
  await assert.rejects(nodeApi.planExplore({ prompt: "Bottle" }), /did not resubmit/);
  assert.equal(requests, 1);
});

test("actual canvas output helper rejects removed style ports while keeping image output", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("function connectedOutputItem(");
  const helper = new Function("previewMediaType", "sourceLabel", `${editor.slice(start, editor.indexOf("function connectedOutputUrl(", start))}; return connectedOutputItem;`)(() => "image", source => source.data.title);
  const source = { type: "explore", data: { title: "Look", resultUrl: "/outputs/selected.png", resultText: "Graphic light" } };
  assert.equal(helper(source, { from: { port: "imageOut" } }).url, source.data.resultUrl);
  assert.equal(helper(source, { from: { port: "styleOut" } }), null);
  assert.equal(helper(source, { from: { port: "promptOut" } }), null);
});

test("actual canvas validator respects reference locks and rejects removed Explore outputs", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const start = editor.indexOf("  function getConnectionError(");
  const config = exploreCanvasConfig(editor);
  const deps = { outputPortIdsForNode: node => node.type === "explore" ? config.output.map(port => port.id) : ["styleOut", "characterOut", "transferOut"], inputPortIdsForNode: () => ["styleIn", "characterIn", "transferIn", "promptIn"],
    isImageModelUnsupportedInput: () => false, isImageModelUnsupportedSource: () => false, isVideoModelUnsupportedInput: () => false, getPortCompatibilityError: () => "" };
  const validatorSource = editor.slice(start, editor.indexOf("  function getPortPoint(", start));
  const validate = new Function(...Object.keys(deps), validatorSource + ";return getConnectionError;")(...Object.values(deps));
  const target = { id: "e", type: "explore", data: {} };
  assert.match(validate({ nodeId: "c", port: "characterOut" }, { nodeId: "e", port: "characterIn" }, [{ id: "c", type: "character", data: {} }, target]), /Lock/);
  assert.match(validate({ nodeId: "m", port: "transferOut" }, { nodeId: "e", port: "transferIn" }, [{ id: "m", type: "transfer", data: {} }, target]), /Lock/);
  const board = { id: "s", type: "storyboard", data: {} };
  assert.match(validate({ nodeId: "e", port: "styleOut" }, { nodeId: "s", port: "styleIn" }, [target, board]), /valid output/);
  assert.match(validate({ nodeId: "e", port: "promptOut" }, { nodeId: "s", port: "promptIn" }, [target, board]), /valid output/);
});

function exploreCanvasConfig(editor) {
  const block = editor.match(/    explore: (\{[\s\S]*?\n    \}),\n    storyboard:/);
  assert.ok(block, "Explore's actual canvas config is present");
  return new Function("Compass", "portColors", `return (${block[1]});`)(null, { image: "blue", style: "purple", prompt: "yellow", character: "cyan", transfer: "pink", camera: "red" });
}

test("restoring graphs drops only removed Explore output edges, keeping images and incoming style", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const config = exploreCanvasConfig(editor);
  assert.deepEqual(config.output.map(port => port.id), ["imageOut"]);
  assert.ok(config.input.some(port => port.id === "styleIn"));
  const start = editor.indexOf("function normalizeEdgeForCurrentGraph(");
  const deps = { cloneEdge: structuredClone, isModel3DNode: () => false, portColors: { style: "purple" },
    inputPortIdsForNode: node => node.type === "explore" ? config.input.map(port => port.id) : ["sourceIn", "styleIn", "promptIn", "imagePromptIn"],
    outputPortIdsForNode: node => node.type === "explore" ? config.output.map(port => port.id) : ["styleOut"],
    isImageModelUnsupportedInput: () => false, isImageModelUnsupportedSource: () => false, isVideoModelUnsupportedInput: () => false, portsAreCompatible: () => true };
  const normalize = new Function(...Object.keys(deps), `${editor.slice(start, editor.indexOf("function transferTitleFromLegacy(", start))}; return normalizeEdgeForCurrentGraph;`)(...Object.values(deps));
  const nodes = new Map(["explore", "preview", "imageModel", "text", "style"].map(type => [type, { id: type, type, data: {} }]));
  const edge = (fromPort, target, toPort, source = "explore", color = "blue") => ({ id: `${source}:${fromPort}:${target}`, from: { nodeId: source, port: fromPort }, to: { nodeId: target, port: toPort }, color });
  const removed = [edge("styleOut", "imageModel", "styleIn"), edge("promptOut", "text", "promptIn")];
  const kept = [edge("imageOut", "preview", "sourceIn"), edge("imageOut", "imageModel", "imagePromptIn"), edge("styleOut", "explore", "styleIn", "style", "purple")];
  assert.deepEqual([...removed, ...kept].map(item => normalize(item, nodes)).filter(Boolean), kept);
});

test("legacy Explore style text cannot leak through text or image-reference prompt helpers", async () => {
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const textStart = editor.indexOf("function connectedText(");
  const text = new Function(`${editor.slice(textStart, editor.indexOf("function directorPackageConnections(", textStart))};return connectedText;`)();
  const promptStart = editor.indexOf("function promptPiecesForSource(");
  const promptEnd = editor.indexOf("\nfunction ", promptStart + 1);
  const prompt = new Function(`${editor.slice(promptStart, promptEnd)};return promptPiecesForSource;`)();
  const source = { type: "explore", data: { resultText: "Legacy style description", title: "Explore" } };
  assert.equal(text([{ source }]), "");
  for (const outputPort of ["imageOut", "styleOut", "promptOut"]) assert.deepEqual(prompt(source, { outputPort }), []);
});
