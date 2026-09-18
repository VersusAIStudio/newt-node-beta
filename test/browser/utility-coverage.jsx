import React from "react";
import { createRoot } from "react-dom/client";
import { NodeBody, createDefaultNodeData, normalizeCurrentNode } from "newtnode-qa-editor";
import { imageModelOptions, videoModelOptions } from "../../src/modelOptions.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// Isolated canvas tool using the real component. No project or provider requests.
function Harness() {
  const [node, setNode] = React.useState(() => normalizeCurrentNode({ id: "qa-coverage", type: "coverage", data: createDefaultNodeData("coverage", "Utility", 1) }));
  const [connected, setConnected] = React.useState(true);
  const update = (_, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }));
  const sample = "/storyboard/MOOD_BOARD.png";
  const incoming = connected ? { imageIn: [{ source: { type: "image", data: { title: "Reference image", url: sample } } }] } : {};
  const run = async () => {
    update(node.id, { status: "running" });
    await new Promise(resolve => setTimeout(resolve, 800));
    update(node.id, { status: "complete", resultUrl: sample, resultItems: Array.from({ length: 9 }, (_, index) => ({ url: `${sample}?angle=${index}`, type: "image", label: `Angle ${index + 1}`, coverageIndex: index })), selectedResultIndex: 0 });
  };
  return <main style={{ padding: 16 }}>
    <label><input type="checkbox" checked={connected} onChange={event => setConnected(event.target.checked)} />Connected sample image</label>
    <button onClick={() => setNode(value => normalizeCurrentNode(JSON.parse(JSON.stringify(value))))}>Save / Reopen</button>
    <article className="node-card utility" data-node-card-id={node.id} style={{ position: "relative", width: 390, maxWidth: "100%", transform: "none", marginTop: 16 }}>
      <header className="node-header">Utility</header>
      <NodeBody node={node} incoming={incoming} incomingByNode={{}} imageModelOptions={imageModelOptions} videoModelOptions={videoModelOptions} generationProvider="fal"
        connectedPortKeys={new Set(connected ? [`${node.id}:imageIn`] : [])} running={node.data.status === "running"} onUpdate={update} onRun={run} onConnectStart={() => {}} onDisconnectInput={() => {}} />
    </article>
    <output aria-label="Tool state">{node.data.utilityMode} / {node.data.utilityImageModel} / {node.data.model} / {node.data.coverageMethod} / {node.data.resultItems?.length || 0} results</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
