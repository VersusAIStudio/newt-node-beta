import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Grid2X2, Trash2, Undo2, ShieldCheck } from "lucide-react";
import { arrangeMyNewtCanvas, assertMyNewtCanvasAction, removeMyNewtCanvasNodes } from "../../src/myNewt/canvasActions.js";

const node = (id, type, x, y, title, data = {}) => ({ id, type, x, y, data: { title, status: "complete", ...data } });
const edge = (a, b) => ({ from: { nodeId: a }, to: { nodeId: b } });
const initial = { nodes: [
  node("existing", "skillDirector", 20, 20, "Existing Director"),
  node("prompt", "plainText", 50, 60, "Prop Prompt"),
  node("model", "imageModel", 310, 60, "Temporary Prop Model", { resultUrl: "/outputs/chosen-prop.png" }),
  node("chosen", "image", 320, 155, "Selected Prop", { url: "/outputs/chosen-prop.png" }),
  node("director", "skillDirector", 355, 205, "Main Director")
], edges: [edge("prompt", "model"), edge("chosen", "director")], groups: [] };
const task = { newIds: ["prompt", "model", "chosen", "director"], temporaryIds: ["prompt", "model"], layoutBlocks: [["prompt", "model"]],
  plan: { approved: true, deliverables: [{ kind: "video", nodeId: "director", referenceIds: ["chosen"] }] } };
const rect = n => ({ left: n.x, top: n.y, right: n.x + 232, bottom: n.y + 112 });

function App() {
  const [graph, setGraph] = useState(initial), [history, setHistory] = useState([]), [message, setMessage] = useState("Ready");
  const apply = action => {
    try {
      assertMyNewtCanvasAction(graph, action, task);
      const next = action.operation === "arrange"
        ? arrangeMyNewtCanvas(graph, action.payload.nodeIds, { layoutBlocks: task.layoutBlocks, bounds: new Map(graph.nodes.map(n => [n.id, rect(n)])) })
        : removeMyNewtCanvasNodes(graph, action.payload.nodeIds);
      setHistory([...history, graph]); setGraph(next);
      setMessage(action.operation === "arrange" ? "Aligned" : "Canvas cleaned; selected prop and main workflow retained");
    } catch (error) { setMessage(error.message); }
  };
  const undo = () => { if (history.length) { setGraph(history.at(-1)); setHistory(history.slice(0, -1)); setMessage("Undo restored the previous canvas"); } };
  return <>
    <style>{`*{box-sizing:border-box}body{margin:0;background:#0c0d0e;color:#eee;font:14px system-ui}header{display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid #444}h1{font-size:18px;margin:0 auto 0 0}button{display:grid;place-items:center;width:40px;height:40px;border:1px solid #555;background:#242526;color:#eee;border-radius:6px;cursor:pointer}button:disabled{opacity:.4}svg{width:18px;height:18px}.viewport{height:660px;overflow:auto}.scene{width:1900px;height:900px;position:relative;background-image:radial-gradient(#343638 1px,transparent 1px);background-size:28px 28px}.node{position:absolute;width:232px;height:112px;border:1px solid #666;border-radius:6px;padding:16px;background:#202224}.node[data-kind=skillDirector]{border-color:#d5c53f}.node[data-kind=image]{border-color:#52be91}.node small{display:block;margin-top:16px;color:#b7b9bb}.scene>svg{position:absolute;width:1900px;height:900px;pointer-events:none}footer{padding:16px;border-top:1px solid #444}output{display:block;margin-top:8px;color:#b6d1ee;overflow-wrap:anywhere}`}</style>
    <header><h1>Canvas Organization QA</h1>
      <button title="Arrange on grid" aria-label="Arrange on grid" onClick={() => apply({ operation: "arrange", payload: { nodeIds: task.newIds.filter(id => graph.nodes.some(n => n.id === id)) } })}><Grid2X2 /></button>
      <button title="Clean temporary branch" aria-label="Clean temporary branch" disabled={!graph.nodes.some(n => n.id === "model")} onClick={() => apply({ operation: "cleanup", payload: { nodeIds: ["prompt", "model"], retainedNodeIds: ["chosen"] } })}><Trash2 /></button>
      <button title="Undo" aria-label="Undo" disabled={!history.length} onClick={undo}><Undo2 /></button>
      <button title="Verify main workflow protection" aria-label="Verify main workflow protection" onClick={() => apply({ operation: "cleanup", payload: { nodeIds: ["director"], retainedNodeIds: ["chosen"] } })}><ShieldCheck /></button>
    </header>
    <div className="viewport"><div className="scene" aria-label="Mock canvas">
      <svg aria-hidden="true">{graph.edges.map((e, i) => { const a = graph.nodes.find(n => n.id === e.from.nodeId), b = graph.nodes.find(n => n.id === e.to.nodeId); return <path key={i} d={`M${a.x + 232} ${a.y + 56} C${a.x + 290} ${a.y + 56},${b.x - 58} ${b.y + 56},${b.x} ${b.y + 56}`} fill="none" stroke="#52be91" strokeWidth="2" />; })}</svg>
      {graph.nodes.map(n => <section key={n.id} className="node" data-node-id={n.id} data-kind={n.type} style={{ left: n.x, top: n.y }}><strong>{n.data.title}</strong><small>{n.x}, {n.y}</small></section>)}
    </div></div>
    <footer><div role="status">{message}</div><output aria-label="Retained source">{graph.nodes.find(n => n.id === "chosen")?.data.url}</output><output aria-label="Canvas state">{JSON.stringify({ nodes: graph.nodes.map(n => ({ id: n.id, x: n.x, y: n.y })), edges: graph.edges, groups: graph.groups })}</output></footer>
  </>;
}
createRoot(document.getElementById("root")).render(<App />);
