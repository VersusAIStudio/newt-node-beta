import { snapshotAssetUrls } from "./contract.js";
import { myNewtOutputItems } from "./plan.js";
import { arrangeNodesOnGrid, nonOverlappingGridPosition } from "../nodeGrid.js";
import { estimatedNodeRect, groupToRect } from "../nodeGeometry.js";

export const myNewtCanvasOperations = ["arrange", "cleanup"];
const preparationTypes = new Set(["plainText", "text", "imageModel", "image", "style", "camera", "preview"]);
const busyStates = new Set(["running", "planning", "compiling", "uploading", "generating", "processing", "queued"]);
const validIds = ids => Array.isArray(ids) && ids.length > 0 && ids.length <= 250 && ids.every(id => typeof id === "string" && id) && new Set(ids).size === ids.length;

export function myNewtRetainedCanvasAssets(snapshot, nodeIds = []) {
  return snapshot.nodes.filter(node => nodeIds.includes(node.id)).flatMap(node =>
    [...new Set([node.data?.localUrl, node.data?.resultUrl, node.data?.url].filter(url => typeof url === "string" && /^\/(outputs|uploads|workflow-assets)\//.test(url) && !/thumbnail/i.test(url)))].map(url => ({ url, type: node.type, nodeId: node.id })));
}

export function myNewtTemporaryCreatedIds(action, result, snapshot) {
  if (!["create", "preset"].includes(action?.operation) || action.payload?.temporary !== true || result?.error) return [];
  const created = new Set([result?.createdId, ...(result?.createdIds || [])].filter(Boolean));
  return snapshot.nodes.filter(node => created.has(node.id) && preparationTypes.has(node.type)).map(node => node.id);
}

export function myNewtCanvasSignature(snapshot, action) {
  const ids = new Set([...(action.payload?.nodeIds || []), ...(action.payload?.retainedNodeIds || [])]);
  return JSON.stringify({ projectId: snapshot.projectId,
    nodes: snapshot.nodes.filter(node => ids.has(node.id)),
    edges: snapshot.edges.filter(edge => ids.has(edge.from.nodeId) || ids.has(edge.to.nodeId)),
    groups: (snapshot.groups || []).filter(group => group.nodeIds?.some(id => ids.has(id))) });
}

export function assertMyNewtCanvasAction(snapshot, action, task) {
  if (!myNewtCanvasOperations.includes(action.operation)) return;
  const { nodeIds, retainedNodeIds = [] } = action.payload || {};
  if (!validIds(nodeIds)) throw new Error("Choose 1 to 250 distinct nodes for canvas organization.");
  const ids = new Set(nodeIds), newIds = new Set(task.newIds || []);
  const targets = nodeIds.map(id => snapshot.nodes.find(node => node.id === id));
  for (const node of targets) {
    if (!node || node.type === "myNewt" || !newIds.has(node.id)) throw new Error("Newt may organize only nodes it created in this task, never pre-existing work.");
    if (node.data?.locked || node.data?.myNewtProtection?.approved || busyStates.has(node.data?.status) || task.uncertainNodes?.includes(node.id)) throw new Error("Keep locked, approved, busy, and uncertain-generation nodes unchanged.");
  }
  const sharedGroup = (snapshot.groups || []).find(group => group.nodeIds?.some(id => ids.has(id)) && group.nodeIds.some(id => !ids.has(id)));
  if (sharedGroup) throw new Error("Keep workflow groups intact. Include all of this task's group members or leave the group unchanged.");
  if ((task.layoutBlocks || []).some(block => block.some(id => ids.has(id)) && block.some(id => !ids.has(id) && snapshot.nodes.some(node => node.id === id)))) throw new Error("Keep inserted preset workflows together when organizing them.");
  if (action.operation === "arrange") return;
  const temporary = new Set(task.temporaryIds || []);
  if (targets.some(node => !temporary.has(node.id) || !preparationTypes.has(node.type))) throw new Error("Cleanup is limited to temporary preparation nodes marked when created. Keep main workflows and reusable production nodes.");
  if (!task.plan?.approved) throw new Error("Cleanup requires an approved plan.");
  for (const item of task.plan.deliverables || []) {
    if (item.referenceIds?.some(id => ids.has(id)) || targets.some(node => item.nodeId === node.id || (item.nodeTitle && item.nodeTitle === node.data?.title))) throw new Error("These nodes are required by the current plan. Preserve its deliverables and references.");
    if (!item.nodeId && !item.nodeTitle && ["workflow", "image", "text"].includes(item.kind)) throw new Error("Identify the retained deliverable nodes in the plan before cleaning up preparation work.");
  }
  if (snapshot.edges.some(edge => ids.has(edge.from.nodeId) && !ids.has(edge.to.nodeId))) throw new Error("A preparation node still feeds retained work. Preserve it; do not break downstream connections.");
  // Some tools keep source node IDs inside data instead of visible edges.
  const referencesRemovedId = value => typeof value === "string" ? ids.has(value) : Array.isArray(value) ? value.some(referencesRemovedId)
    : value && typeof value === "object" ? Object.entries(value).some(([key, entry]) => ids.has(key) || referencesRemovedId(entry)) : false;
  if (snapshot.nodes.some(node => !ids.has(node.id) && node.type !== "myNewt" && referencesRemovedId(node.data))) throw new Error("Retained work still references one of these nodes internally.");
  if (!validIds(retainedNodeIds) || retainedNodeIds.some(id => ids.has(id))) throw new Error("Keep the selected full-resolution result in a separate asset node before cleanup.");
  const retained = retainedNodeIds.map(id => snapshot.nodes.find(node => node.id === id));
  if (retained.some(node => !node || !["image", "video", "audio"].includes(node.type) || busyStates.has(node.data?.status) || ["error", "failed", "canceled", "cancelled"].includes(node.data?.status) || node.data?.error)) throw new Error("Retained results must be ready, independent asset nodes.");
  const retainedUrls = new Set(myNewtRetainedCanvasAssets(snapshot, retainedNodeIds).map(item => item.url));
  if (!retainedUrls.size) throw new Error("Preserve a full-resolution managed asset before cleanup.");
  const components = targets.map(node => new Set([node.id]));
  for (const edge of snapshot.edges) {
    const a = components.find(set => set.has(edge.from.nodeId)), b = components.find(set => set.has(edge.to.nodeId));
    if (a && b && a !== b) { for (const id of b) a.add(id); components.splice(components.indexOf(b), 1); }
  }
  for (const component of components) {
    const media = targets.filter(node => component.has(node.id)).flatMap(node => node.type === "image" ? [...snapshotAssetUrls({ nodes: [node] })] : myNewtOutputItems(node).map(item => item.url));
    if (media.length && !media.some(url => retainedUrls.has(url))) throw new Error("Preserve the chosen result from each preparation branch before removing its alternatives.");
  }
}

export function removeMyNewtCanvasNodes(graph, nodeIds) {
  const ids = new Set(nodeIds);
  return { ...graph, nodes: graph.nodes.filter(node => !ids.has(node.id)),
    edges: graph.edges.filter(edge => !ids.has(edge.from.nodeId) && !ids.has(edge.to.nodeId)),
    groups: (graph.groups || []).map(group => ({ ...group, nodeIds: group.nodeIds.filter(id => !ids.has(id)) })).filter(group => group.nodeIds.length) };
}

export function arrangeMyNewtCanvas(graph, nodeIds, { bounds = new Map(), layoutBlocks = [] } = {}) {
  const selected = new Set(nodeIds), ids = new Set(graph.nodes.map(node => node.id));
  const blocks = layoutBlocks.map(block => block.filter(id => ids.has(id))).filter(block => block.length > 1 && block.every(id => selected.has(id)));
  const groupIds = new Set((graph.groups || []).map(group => group.id));
  const virtualGroups = blocks.map((block, index) => {
    const rects = [...graph.nodes.filter(node => block.includes(node.id)).map(node => bounds.get(node.id) || estimatedNodeRect(node)),
      ...(graph.groups || []).filter(group => group.nodeIds.length && group.nodeIds.every(id => block.includes(id))).map(groupToRect)];
    const x = Math.min(...rects.map(rect => rect.left)), y = Math.min(...rects.map(rect => rect.top));
    let id = `newt-layout-${index}`;
    while (groupIds.has(id)) id += "-block";
    groupIds.add(id);
    return { id, nodeIds: block, x, y, width: Math.max(...rects.map(rect => rect.right)) - x, height: Math.max(...rects.map(rect => rect.bottom)) - y };
  });
  if (nodeIds.length === 1) {
    const node = graph.nodes.find(node => node.id === nodeIds[0]);
    const ownGroups = (graph.groups || []).filter(group => group.nodeIds.includes(node.id));
    const rects = [bounds.get(node.id) || estimatedNodeRect(node), ...ownGroups.map(groupToRect)];
    const x = Math.min(...rects.map(rect => rect.left)), y = Math.min(...rects.map(rect => rect.top));
    const position = nonOverlappingGridPosition({ width: Math.max(...rects.map(rect => rect.right)) - x, height: Math.max(...rects.map(rect => rect.bottom)) - y }, { x, y },
      [...graph.nodes.filter(other => other.id !== node.id).map(other => bounds.get(other.id) || estimatedNodeRect(other)), ...(graph.groups || []).filter(group => !group.nodeIds.includes(node.id)).map(groupToRect)]);
    const dx = position.x - x, dy = position.y - y;
    return { ...graph, changed: !!(dx || dy), nodes: graph.nodes.map(other => other.id === node.id ? { ...node, x: node.x + dx, y: node.y + dy } : other),
      groups: (graph.groups || []).map(group => ownGroups.includes(group) ? { ...group, x: group.x + dx, y: group.y + dy } : group) };
  }
  const groups = [...(graph.groups || []), ...virtualGroups];
  const arranged = arrangeNodesOnGrid(graph.nodes, nodeIds, { groups, bounds });
  return { ...graph, ...arranged, groups: arranged.groups.filter(group => !virtualGroups.some(virtual => virtual.id === group.id)) };
}
