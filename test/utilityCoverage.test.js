import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { imageModelOptions, videoModelOptions, creativeImageDefaultModel } from "../src/modelOptions.js";
import { isCoverageNode, coverageShotsForMethod, normalizeCoverageMethod } from "../src/coveragePresets.js";
import { migrateRetiredGraph } from "../src/retiredNodes.js";
import { buildNewtPresetGraph } from "../src/myNewt/presets.js";
import { myNewtSnapshot, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { myNewtRunOutputDigest } from "../src/myNewt/runReuse.js";
import { newtPresetDetails, newtPresetSummary } from "../server/newt-preset-discovery.js";

const source = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
const compiled = buildSync({ stdin: { contents: `${source}\nexport { NodeBody, normalizeEditorGraph, normalizeCurrentNode, createDefaultNodeData, utilityImageModelSelectionPatch, previewSourceResultItems, outputPortDefinitionsForNode, visiblePortIdsForNode };`, resolveDir: fileURLToPath(new URL("../src", import.meta.url)), loader: "jsx" },
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic", define: { "import.meta.env": "{}" }, external: ["/newt-mark.png"], loader: { ".css": "empty" } });
const module = { exports: {} };
new Function("require", "module", "exports", compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { NodeBody, normalizeEditorGraph, normalizeCurrentNode, createDefaultNodeData, utilityImageModelSelectionPatch, previewSourceResultItems, outputPortDefinitionsForNode, visiblePortIdsForNode } = module.exports;
const items = Array.from({ length: 9 }, (_, index) => ({ url: `/outputs/angle-${index}.png`, type: "image", label: `Angle ${index}`, coverageIndex: index }));
const coverage = () => ({ id: "coverage", type: "coverage", x: 25, y: 50, data: { title: "Coverage", model: "Nano Banana Pro", resolution: "2K", coverageMethod: "Dynamic", resultItems: items, resultUrl: items[4].url, selectedResultIndex: 4, status: "complete" } });
const graph = () => ({ nodes: [{ id: "source", type: "image", data: { title: "Source", url: "/uploads/reference.png" } }, coverage(), { id: "preview", type: "preview", data: { title: "Preview", previewTab: "layout" } }], edges: [
  { id: "in", from: { nodeId: "source", port: "imageOut" }, to: { nodeId: "coverage", port: "imageIn" } },
  { id: "out", from: { nodeId: "coverage", port: "imageOut" }, to: { nodeId: "preview", port: "sourceIn" } }
], groups: [{ id: "g", name: "Angles", nodeIds: ["coverage", "preview"] }] });

test("saved Coverage migrates to Utility with its model, images, selected result and connections intact", () => {
  const original = graph(), copy = structuredClone(original);
  const result = normalizeEditorGraph(original.nodes, original.edges, original.groups), node = result.nodes.find(node => node.id === "coverage");
  assert.equal(isCoverageNode(node), true); assert.equal(node.type, "utility"); assert.equal(node.data.title, "Utility");
  assert.equal(node.data.model, "Nano Banana Pro"); assert.equal(node.data.coverageMethod, "Dynamic");
  assert.equal(node.data.resultUrl, items[4].url); assert.equal(node.data.selectedResultIndex, 4);
  assert.deepEqual(node.data.resultItems.map(item => item.url), items.map(item => item.url));
  assert.equal(result.edges.length, 2); assert.equal(result.edges[1].from.port, "utilityOut");
  assert.deepEqual(visiblePortIdsForNode(node), ["imageIn", "utilityOut"]);
  assert.equal(outputPortDefinitionsForNode(node)[0].disabled, false);
  assert.equal(previewSourceResultItems(node, result.edges[1]).length, 9);
  assert.deepEqual(normalizeEditorGraph(result.nodes, result.edges, result.groups), result);
  assert.deepEqual(original, copy);
});

test("selecting Coverage starts clean with the existing quality model and method", () => {
  const previous = { ...createDefaultNodeData("utility", "My utility", 1), resultItems: items, resultUrl: items[0].url };
  const patch = utilityImageModelSelectionPatch(previous, "Coverage");
  assert.equal(patch.model, creativeImageDefaultModel); assert.equal(patch.quality, "high");
  assert.equal(patch.title, "My utility"); assert.equal(patch.coverageMethod, "Standard");
  assert.equal(patch.resultUrl, ""); assert.deepEqual(patch.resultItems, []);
  const node = normalizeCurrentNode({ id: "new", type: "utility", data: patch });
  assert.equal(isCoverageNode(node), true); assert.equal(node.data.model, creativeImageDefaultModel);
  assert.equal(outputPortDefinitionsForNode(node)[0].disabled, true);
  assert.equal(isCoverageNode({ ...node, data: { ...node.data, utilityMode: "video" } }), false);
});

test("legacy presets migrate before catalog filtering and agent discovery matches the inserted graph", () => {
  const original = graph(), clean = buildNewtPresetGraph(original);
  assert.equal(clean.nodes.length, 3); assert.equal(clean.edges[1].from.port, "utilityOut");
  const node = clean.nodes.find(node => node.id === "coverage"); assert.equal(isCoverageNode(node), true);
  const preset = { id: "saved", name: "Coverage recipe", graph: original };
  assert.deepEqual(newtPresetSummary(preset).nodeTypes, ["image", "utility", "preview"]);
  assert.equal(newtPresetSummary(preset).settings[0].utilityImageModel, "Coverage");
  assert.equal(newtPresetDetails(preset).edges[1].from.port, "utilityOut");
});

test("Composer is retired without deleting rendered frames, scene data or outgoing image connections", () => {
  const original = graph(); original.nodes[1] = { id: "coverage", type: "composer", x: 10, y: 20, data: { title: "Composer", resultUrl: "/outputs/captured.png", composerScene: { saved: true } } };
  const result = normalizeEditorGraph(original.nodes, original.edges, original.groups);
  const asset = result.nodes.find(node => node.id === "coverage");
  assert.equal(asset.type, "image"); assert.equal(asset.data.url, "/outputs/captured.png");
  assert.deepEqual(asset.data.composerScene, { saved: true }); assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0].from.port, "imageOut");
  const preset = buildNewtPresetGraph(original);
  assert.equal(preset.nodes.length, 3); assert.equal(preset.edges.length, 1);
  assert.equal(normalizeCurrentNode({ type: "composer", data: { title: "Blocking reference" } }).data.title, "Blocking reference");
  assert.deepEqual(migrateRetiredGraph(migrateRetiredGraph(original)), migrateRetiredGraph(original));
  assert.doesNotMatch(source, /<ComposerNodeBody|<ComposerEditorModal|onOpenComposer/);
});

test("Utility Coverage retains Newt's editable inputs and nine-output reuse requirement", async () => {
  const node = normalizeCurrentNode(coverage()), snapshot = myNewtSnapshot({ nodes: [node] });
  assert.equal(snapshot.nodes[0].data.utilityImageModel, "Coverage"); assert.equal(snapshot.nodes[0].data.coverageMethod, "Dynamic");
  assert.deepEqual(validateMyNewtPatch(node, { coverageMethod: "Insane" }, { allowExisting: true }), { coverageMethod: "Insane" });
  assert.throws(() => validateMyNewtPatch(node, { utilityImageModel: "DWPose" }, { allowExisting: true }), /Only Utility/);
  assert.ok(await myNewtRunOutputDigest(node));
  assert.equal(await myNewtRunOutputDigest({ ...node, data: { ...node.data, resultItems: items.slice(0, 8), resultUrl: items[0].url } }), null);
});

test("Coverage UI has Image/Video tool selection, a nine-angle action and the Utility output", () => {
  const node = normalizeCurrentNode(coverage());
  const render = running => renderToStaticMarkup(React.createElement(NodeBody, { node, imageModelOptions, videoModelOptions, generationProvider: "fal", running,
    incoming: { imageIn: [{ source: { type: "image", data: { title: "Source", url: "/uploads/reference.png" } } }] }, incomingByNode: {}, connectedPortKeys: new Set(), onUpdate() {}, onRun() {} }));
  const html = render(false);
  assert.match(html, /Utility mode/); assert.match(html, /<option selected="">Coverage<\/option>/);
  assert.match(html, /Generate Coverage/); assert.match(html, /utilityOut/); assert.match(html, /Dynamic/);
  assert.match(render(true), /disabled=""[^>]*>Video/); assert.match(render(true), /Generating 9 angles/);
  node.data.resultItems = []; node.data.resultUrl = "";
  assert.match(render(false), /disabled="" title="Generate Coverage before connecting it"/);
});

test("the real run dispatch submits all nine Coverage angles rather than generic Utility preprocessing", async () => {
  const start = source.indexOf("      if (isCoverageNode(currentNode)) {"), end = source.indexOf('      if (currentNode.type === "utility") {', start);
  assert.ok(start > 0 && end > start);
  const currentNode = normalizeCurrentNode(coverage()), calls = [], updates = [];
  const deps = { currentNode, isCoverageNode, normalizeCoverageMethod, coverageShotsForMethod,
    incoming: { imageIn: ["reference"] }, connectedAssetUrls: () => ["/uploads/reference.png"],
    imageModelAutoAspectRatio: "Auto", resolveImageModelAspectRatio: async () => "16:9",
    requestContext: { projectId: "qa" }, generationProvider: "fal", imageRunStaggerMs: 0,
    resetCoverageOutputPatch: () => ({ resultItems: [], resultUrl: "" }),
    updateNode: (id, patch) => updates.push({ id, patch }),
    settleSequential: async (shots, run) => { const results = []; for (let i = 0; i < shots.length; i++) results.push({ status: "fulfilled", value: await run(shots[i], i) }); return results; },
    runCoverageGeneration: async request => { calls.push(request); return [items[request.index]]; },
    fulfilledRunValues: settled => settled.flatMap(item => item.value), rejectedRunResults: () => [], ensureRunSuccesses() {},
    appendedNodeResultState: (_, results) => ({ resultItems: results, firstNewIndex: 0 }), resultTextFromItems: () => "", batchRunError: () => "", loadOutputHistory() {}
  };
  const run = new Function(...Object.keys(deps), `return (async () => { ${source.slice(start, end)} })();`);
  assert.deepEqual(await run(...Object.values(deps)), { status: "complete" });
  assert.equal(calls.length, 9); assert.equal(updates.at(-1).patch.resultItems.length, 9);
  assert.deepEqual(calls.map(call => call.shot), coverageShotsForMethod("Dynamic"));
  for (const call of calls) { assert.equal(call.node.type, "utility"); assert.equal(call.node.data.model, "Nano Banana Pro"); assert.equal(call.sourceImageUrl, "/uploads/reference.png"); assert.equal(call.aspectRatio, "16:9"); }
});
