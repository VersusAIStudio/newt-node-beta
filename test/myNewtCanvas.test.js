import test from "node:test";
import assert from "node:assert/strict";
import { assertMyNewtCanvasAction, myNewtCanvasSignature, myNewtTemporaryCreatedIds, arrangeMyNewtCanvas, removeMyNewtCanvasNodes } from "../src/myNewt/canvasActions.js";
import { myNewtSnapshot, myNewtActionSnapshot } from "../src/myNewt/contract.js";
import { nonOverlappingGridPosition, canvasGridSize } from "../src/nodeGrid.js";
import { estimatedNodeRect, rectsOverlap } from "../src/nodeGeometry.js";

const node = (id, type, data = {}, x = 7, y = 9) => ({ id, type, x, y, data: { title: id, status: "ready", ...data } });
const edge = (from, to) => ({ from: { nodeId: from, port: "imageOut" }, to: { nodeId: to, port: "imageIn" } });
const graph = () => ({ projectId: "canvas-test", nodes: [node("newt", "myNewt"), node("prompt", "plainText", { text: "A prop" }),
  node("model", "imageModel", { resultItems: [{ url: "/outputs/selected.png", type: "image" }, { url: "/outputs/rejected.png", type: "image" }], status: "complete" }),
  node("preview", "preview"), node("kept", "image", { url: "/outputs/selected.png" }), node("director", "skillDirector")],
  edges: [edge("prompt", "model"), edge("model", "preview"), edge("kept", "director")], groups: [] });
const task = () => ({ newIds: ["prompt", "model", "preview", "kept", "director"], temporaryIds: ["prompt", "model", "preview"], uncertainNodes: [],
  plan: { approved: true, deliverables: [{ kind: "video", nodeId: "director", referenceIds: ["kept"] }] } });
const cleanup = () => ({ operation: "cleanup", payload: { nodeIds: ["prompt", "model", "preview"], retainedNodeIds: ["kept"] } });

test("temporary scope is creation-only and excludes main production node types", () => {
  const state = graph();
  assert.deepEqual(myNewtTemporaryCreatedIds({ operation: "preset", payload: { temporary: true } }, { createdIds: ["model", "director"] }, state), ["model"]);
  for (const action of [{ operation: "update", payload: { temporary: true } }, { operation: "create", payload: {} }]) {
    assert.deepEqual(myNewtTemporaryCreatedIds(action, { createdId: "model" }, state), []);
  }
});

test("cleanup removes a disposable branch while retaining selected assets and all original data", () => {
  const state = graph(), before = structuredClone(state);
  assert.doesNotThrow(() => assertMyNewtCanvasAction(state, cleanup(), task()));
  const next = removeMyNewtCanvasNodes(state, cleanup().payload.nodeIds);
  assert.deepEqual(next.nodes.map(node => node.id), ["newt", "kept", "director"]);
  assert.deepEqual(next.edges, [edge("kept", "director")]);
  assert.equal(next.nodes.find(node => node.id === "kept").data.url, "/outputs/selected.png");
  assert.deepEqual(state, before);
  assert.equal(state.nodes.find(node => node.id === "model").data.resultItems.length, 2);
});

test("cleanup protects pre-existing, durable, main, locked, busy and uncertain work", () => {
  const changes = [
    (g, t) => { t.newIds = t.newIds.filter(id => id !== "model"); },
    (g, t) => { t.temporaryIds = []; },
    g => { g.nodes.find(node => node.id === "model").type = "videoModel"; },
    g => { g.nodes.find(node => node.id === "model").data.locked = true; },
    g => { g.nodes.find(node => node.id === "model").data.myNewtProtection = { approved: true }; },
    g => { g.nodes.find(node => node.id === "model").data.status = "generating"; },
    (g, t) => { t.uncertainNodes = ["model"]; },
    (g, t) => { t.plan.approved = false; }
  ];
  for (const change of changes) { const g = graph(), t = task(); change(g, t); assert.throws(() => assertMyNewtCanvasAction(g, cleanup(), t)); }
});

test("cleanup refuses connected dependencies, internal references, groups and plan deliverables", () => {
  for (const change of [
    g => g.edges.push(edge("model", "director")),
    g => { g.nodes.find(n => n.id === "director").data.manifest = { source: "model" }; },
    g => g.groups.push({ id: "shared", nodeIds: ["model", "director"] }),
    (g, t) => { t.plan.deliverables[0].referenceIds = ["model"]; },
    (g, t) => { t.plan.deliverables[0].nodeTitle = "model"; },
    (g, t) => { t.plan.deliverables = [{ kind: "workflow" }]; },
    (g, t) => { t.layoutBlocks = [["model", "director"]]; }
  ]) { const g = graph(), t = task(); change(g, t); assert.throws(() => assertMyNewtCanvasAction(g, cleanup(), t)); }
});

test("cleanup needs the chosen full-resolution output independently preserved from each branch", () => {
  for (const status of ["error", "failed", "canceled", "cancelled", "processing"]) {
    const g = graph(); g.nodes.find(n => n.id === "kept").data.status = status;
    assert.throws(() => assertMyNewtCanvasAction(g, cleanup(), task()), /ready, independent/);
  }
  for (const url of ["/outputs/unrelated.png", "/outputs/thumbnail-selected.png", "https://example.com/selected.png", ""]) {
    const g = graph(); g.nodes.find(n => n.id === "kept").data.url = url;
    assert.throws(() => assertMyNewtCanvasAction(g, cleanup(), task()));
  }
  const g = graph(), t = task(), action = cleanup();
  g.nodes.push(node("unrelated", "imageModel", { resultUrl: "/outputs/another.png" }));
  t.newIds.push("unrelated"); t.temporaryIds.push("unrelated"); action.payload.nodeIds.push("unrelated");
  assert.throws(() => assertMyNewtCanvasAction(g, action, t), /each preparation branch/);
});

test("canvas signatures detect movement, changed choices and new downstream edges with public snapshots", () => {
  const g = myNewtSnapshot(graph()), action = cleanup(), captured = myNewtCanvasSignature(g, action);
  assert.equal(myNewtCanvasSignature(myNewtActionSnapshot(g, action), action), captured);
  g.nodes.find(n => n.id === "model").x += 28;
  assert.notEqual(myNewtCanvasSignature(g, action), captured);
  const changed = myNewtSnapshot(graph()); changed.edges.push(edge("model", "director"));
  assert.notEqual(myNewtCanvasSignature(changed, action), captured);
  changed.edges.pop(); changed.nodes.find(n => n.id === "kept").data.url = "/outputs/different.png";
  assert.notEqual(myNewtCanvasSignature(changed, action), captured);
});

test("grid placement rounds away from obstacles rather than reintroducing collisions", () => {
  const occupied = [{ left: -17, top: -200, right: 390.6, bottom: 900 }];
  const size = { width: 420, height: 530 };
  const p = nonOverlappingGridPosition(size, { x: 12, y: 19 }, occupied);
  assert.equal(p.x % canvasGridSize, 0); assert.equal(p.y % canvasGridSize, 0);
  assert.equal(rectsOverlap({ left: p.x, top: p.y, right: p.x + size.width, bottom: p.y + size.height }, occupied[0]), false);
});

test("arrangement preserves preset spacing, groups, data, edges and pre-existing nodes", () => {
  const g = graph(); g.nodes = [node("existing", "character", {}, 0, 0), node("a", "plainText", {}, 13, 17), node("b", "imageModel", {}, 477, 61), node("c", "image", {}, 31, 30)];
  g.edges = [edge("a", "b")];
  const before = structuredClone(g);
  const next = arrangeMyNewtCanvas(g, ["a", "b", "c"], { layoutBlocks: [["a", "b"]] });
  const [existing, a, b, c] = next.nodes;
  assert.deepEqual(existing, before.nodes[0]);
  assert.equal(b.x - a.x, 464); assert.equal(b.y - a.y, 44);
  assert.equal(a.x % canvasGridSize, 0); assert.equal(a.y % canvasGridSize, 0);
  assert.equal(c.x % canvasGridSize, 0); assert.equal(c.y % canvasGridSize, 0);
  for (const moved of [a, b, c]) assert.equal(rectsOverlap(estimatedNodeRect(existing), estimatedNodeRect(moved)), false);
  assert.deepEqual(next.edges, g.edges); assert.deepEqual(next.nodes.map(n => n.data), g.nodes.map(n => n.data));
  assert.deepEqual(next.groups, []); assert.deepEqual(g, before);
  assert.equal(arrangeMyNewtCanvas(next, ["a", "b", "c"], { layoutBlocks: [["a", "b"]] }).changed, false);
  g.groups = [{ id: "newt-layout-0", nodeIds: ["a", "b"], x: 0, y: 0, width: 1200, height: 1500 }];
  const grouped = arrangeMyNewtCanvas(g, ["a", "b", "c"], { layoutBlocks: [["a", "b"]] });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.groups[0].id, "newt-layout-0");
  assert.deepEqual(grouped.groups[0].nodeIds, ["a", "b"]);
});
