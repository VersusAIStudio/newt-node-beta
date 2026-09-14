import { estimatedNodeRect, groupToRect, nonOverlappingPosition } from "./nodeGeometry.js";

export const canvasGridSize = 28;
const gridGap = canvasGridSize * 4;
export const snapCanvasCoordinate = value => Math.round(value / canvasGridSize) * canvasGridSize || 0;
const ceilGrid = value => Math.ceil((value - .001) / canvasGridSize) * canvasGridSize;

export function nonOverlappingGridPosition(size, preferred, occupied = []) {
  const roundedObstacles = occupied.map(rect => ({ ...rect, right: ceilGrid(rect.right) }));
  return nonOverlappingPosition(size, { x: snapCanvasCoordinate(preferred.x), y: snapCanvasCoordinate(preferred.y) }, roundedObstacles, gridGap);
}

export function canvasDragDelta(anchor, delta, enabled) {
  if (!enabled || (!delta.x && !delta.y)) return delta;
  return { x: snapCanvasCoordinate(anchor.x + delta.x) - anchor.x, y: snapCanvasCoordinate(anchor.y + delta.y) - anchor.y };
}

export function canvasDragAnchor(nodes, fallback = { x: 0, y: 0 }) {
  return nodes.length ? { x: Math.min(...nodes.map(n => n.x)), y: Math.min(...nodes.map(n => n.y)) } : fallback;
}

function enclosingRect(rects) {
  return { left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)),
    right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom)) };
}

export function arrangeNodesOnGrid(nodes, selectedIds, { groups = [], bounds = new Map() } = {}) {
  const selected = new Set(selectedIds), picked = nodes.filter(n => selected.has(n.id));
  if (picked.length < 2) return { nodes, groups, changed: false };
  const rectFor = node => {
    const measured = bounds.get(node.id), fallback = estimatedNodeRect(node);
    const width = measured?.right - measured?.left, height = measured?.bottom - measured?.top;
    return { left: node.x, top: node.y, right: node.x + (width > 0 ? width : fallback.right - fallback.left),
      bottom: node.y + (height > 0 ? height : fallback.bottom - fallback.top) };
  };
  const claimed = new Set(), units = [], nodeIds = new Set(nodes.map(n => n.id));
  const selectedGroups = groups.filter(g => g.nodeIds?.length && g.nodeIds.every(id => selected.has(id) && nodeIds.has(id)));
  // Keep complete groups together, including nested group backdrops, without changing their internal spacing.
  for (const group of [...selectedGroups].sort((a, b) => b.nodeIds.length - a.nodeIds.length)) {
    if (group.nodeIds.some(id => claimed.has(id))) continue;
    const members = picked.filter(n => group.nodeIds.includes(n.id));
    const memberGroups = selectedGroups.filter(g => g.nodeIds.every(id => group.nodeIds.includes(id)));
    units.push({ nodes: members, groups: memberGroups, rect: enclosingRect([...members.map(rectFor), ...memberGroups.map(groupToRect)]) });
    members.forEach(n => claimed.add(n.id));
  }
  for (const node of picked) if (!claimed.has(node.id)) units.push({ nodes: [node], groups: [], rect: rectFor(node) });
  const origin = enclosingRect(units.map(u => u.rect));
  units.sort((a, b) => Math.floor((a.rect.top - origin.top) / gridGap) - Math.floor((b.rect.top - origin.top) / gridGap)
    || a.rect.left - b.rect.left || a.rect.top - b.rect.top);
  const columns = Math.ceil(Math.sqrt(units.length)), rows = Math.ceil(units.length / columns);
  const widths = Array(columns).fill(0), heights = Array(rows).fill(0);
  units.forEach((u, i) => {
    widths[i % columns] = Math.max(widths[i % columns], ceilGrid(u.rect.right - u.rect.left));
    heights[Math.floor(i / columns)] = Math.max(heights[Math.floor(i / columns)], ceilGrid(u.rect.bottom - u.rect.top));
  });
  const size = { width: widths.reduce((a, b) => a + b, 0) + gridGap * (columns - 1), height: heights.reduce((a, b) => a + b, 0) + gridGap * (rows - 1) };
  const occupied = [...nodes.filter(n => !selected.has(n.id)).map(rectFor),
    ...groups.filter(g => !g.nodeIds?.some(id => selected.has(id))).map(groupToRect)];
  let position = { x: snapCanvasCoordinate(origin.left), y: snapCanvasCoordinate(origin.top) };
  // Recheck after rounding: moving onto the grid must not introduce a new collision.
  for (let i = 0; i <= occupied.length + 1; i++) {
    const free = nonOverlappingPosition(size, position, occupied, gridGap);
    const x = ceilGrid(free.x);
    if (x === position.x) break;
    position = { x, y: position.y };
  }
  const positions = new Map(), groupPositions = new Map();
  units.forEach((unit, i) => {
    const x = position.x + widths.slice(0, i % columns).reduce((a, b) => a + b + gridGap, 0);
    const y = position.y + heights.slice(0, Math.floor(i / columns)).reduce((a, b) => a + b + gridGap, 0);
    const dx = x - unit.rect.left, dy = y - unit.rect.top;
    unit.nodes.forEach(n => positions.set(n.id, { x: n.x + dx, y: n.y + dy }));
    unit.groups.forEach(g => groupPositions.set(g.id, { x: g.x + dx, y: g.y + dy }));
  });
  const move = (items, map) => items.map(item => {
    const next = map.get(item.id);
    return !next || (next.x === item.x && next.y === item.y) ? item : { ...item, ...next };
  });
  const nextNodes = move(nodes, positions), nextGroups = move(groups, groupPositions);
  return { nodes: nextNodes, groups: nextGroups, changed: nextNodes.some((n, i) => n !== nodes[i]) || nextGroups.some((g, i) => g !== groups[i]),
    bounds: { left: position.x, top: position.y, right: position.x + size.width, bottom: position.y + size.height } };
}
