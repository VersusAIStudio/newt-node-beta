import { createHash } from "node:crypto";
import { myNewtSnapshot } from "../src/myNewt/contract.js";
import { myNewtReadDetails } from "../src/myNewt/context.js";
import { migrateRetiredGraph } from "../src/retiredNodes.js";

const fields = ["utilityMode", "utilityImageModel", "coverageMethod", "model", "characterSheetModel", "stylePreset", "gradePreset", "shotPreset", "lensPreset", "typePreset", "aspectRatio", "resolution", "batchCount", "skillApproach", "skillVideoModel"];
const text = (value, max = 120) => String(value || "").slice(0, max);
export const newtPresetRevision = preset => createHash("sha256").update(JSON.stringify({ name: preset.name, graph: preset.graph })).digest("hex");

export function newtPresetSummary(preset, isSystem = preset.isSystem === true) {
  const nodes = migrateRetiredGraph(preset.graph).nodes;
  return {
    id: preset.id, name: text(preset.name), createdAt: preset.createdAt, nodeCount: nodes.length,
    slots: preset.graph.slots || [], isSystem, revision: newtPresetRevision(preset),
    nodeTypes: [...new Set(nodes.map(node => node.type))],
    settings: nodes.filter(node => fields.some(key => node.data?.[key])).slice(0, 12).map(node => ({
      type: node.type, title: text(node.data?.title),
      ...Object.fromEntries(fields.filter(key => ["string", "number", "boolean"].includes(typeof node.data?.[key])).map(key => [key, text(node.data[key])]))
    })),
    hasSavedAssets: nodes.some(node => node.data?.url || node.data?.resultUrl || node.data?.characterPortrait?.url || node.data?.transferImages?.length),
    note: "Inspect the saved text, assets and connections before use. Adapt only the inserted copy; preserve chosen models and production settings unless explicitly asked to change them."
  };
}

export function newtPresetIndex(presets, brief = "", offset = 0) {
  const words = new Set(String(brief).toLowerCase().match(/[a-z]{3,}/g) || []);
  const score = preset => (text(preset.name).toLowerCase().match(/[a-z]{3,}/g) || []).reduce((sum, word) => sum + (words.has(word) ? 1 : 0), 0);
  const sorted = [...presets].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  return { total: presets.length, offset: start, items: sorted.slice(start, start + 12).map(compactSummary), nextOffset: start + 12 < presets.length ? start + 12 : null,
    retrieval: "Name matches are a navigation hint, not proof of suitability. Read {presetId} to inspect a candidate; read {presetOffset:N} pages this library. Use preset {presetId,bindings,stepId} to insert the inspected revision." };
}

export function newtPresetDetails(preset, request = {}) {
  const snapshot = myNewtSnapshot(migrateRetiredGraph(preset.graph));
  if (request.nodeIds?.length) {
    if (request.field && request.nodeIds.length !== 1) throw new Error("Read one preset node field at a time.");
    const details = myNewtReadDetails(snapshot, request);
    return { presetId: preset.id, revision: newtPresetRevision(preset), details: boundedDetails(details) };
  }
  const start = Math.max(0, Math.floor(Number(request.offset) || 0));
  const edgeOffset = Math.max(0, Math.floor(Number(request.edgeOffset) || 0));
  const slotOffset = Math.max(0, Math.floor(Number(request.slotOffset) || 0));
  const nodes = snapshot.nodes.slice(start, start + 6);
  const slots = preset.graph.slots || [];
  return { ...compactSummary(newtPresetSummary(preset)), offset: start, nextOffset: start + 6 < snapshot.nodes.length ? start + 6 : null,
    slots: slots.slice(slotOffset, slotOffset + 12), slotCount: slots.length, nextSlotOffset: slotOffset + 12 < slots.length ? slotOffset + 12 : null,
    nodes: boundedDetails(myNewtReadDetails(snapshot, { nodeIds: nodes.map(node => node.id) })),
    edges: snapshot.edges.slice(edgeOffset, edgeOffset + 30), edgeCount: snapshot.edges.length, nextEdgeOffset: edgeOffset + 30 < snapshot.edges.length ? edgeOffset + 30 : null,
    retrieval: "Read {presetId,offset:N} for more nodes, {presetId,edgeOffset:N} for connections, {presetId,slotOffset:N} for inputs, or {presetId,nodeIds:[id],field:fieldName,itemOffset:N} for untruncated fields. This is library data, not the live project. Insert before editing and use the returned new node IDs. Saved outputs are not new deliverables." };
}

function boundedDetails(nodes) {
  let remaining = 18000;
  return nodes.map(node => {
    const size = JSON.stringify(node).length;
    if (size <= remaining) { remaining -= size; return node; }
    return { id: node.id, type: node.type, title: text(node.data?.title), omittedDetails: true,
      fields: Object.keys(node.data || {}), retrieval: "Read this node's individual fields with nodeIds:[id],field,itemOffset." };
  });
}

function compactSummary(preset) {
  const settings = [];
  for (const setting of preset.settings || []) {
    if (JSON.stringify([...settings, setting]).length > 2400) break;
    settings.push(setting);
  }
  return { ...preset, settings, omittedSettings: (preset.settings || []).length - settings.length,
    slots: (preset.slots || []).slice(0, 12), slotCount: (preset.slots || []).length };
}
