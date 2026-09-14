import React from "react";
import { createRoot } from "react-dom/client";
import { PanelsTopLeft, MonitorPlay } from "lucide-react";
import { EditorNodeBody } from "../../src/components/EditorNodeBody.jsx";
import { EditorMonitor } from "../../src/components/EditorMonitor.jsx";
import { createEditorTimeline, normalizeEditorTimeline } from "../../src/editorTimeline.js";
import { normalizeEditorNodeWidth } from "../../src/nodeGeometry.js";
import { postJson } from "../../src/api/newtApi.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

function Harness() {
  const [node, setNode] = React.useState({ id: "editor-qa-node", type: "editor", data: { title: "Editor", editorTimeline: createEditorTimeline() } });
  const [attached, setAttached] = React.useState(["scene-a.mp4"]), [preview, setPreview] = React.useState(true), [revision, setRevision] = React.useState(0), [narrow, setNarrow] = React.useState(false);
  const [opened, setOpened] = React.useState(null);
  const [saveDialog, setSaveDialog] = React.useState(null), [saveName, setSaveName] = React.useState("QA edited sequence.mp4");
  function chooseExportPath() { return new Promise(resolve => setSaveDialog({ resolve })); }
  const config = { input: [{ id: "videoIn", label: "Video", color: "#58ce63" }, { id: "audioIn", label: "Audio", color: "#ff8b35" }], output: [{ id: "videoOut", label: "Output", color: "#58ce63" }] };
  const sources = attached.map(file => ({ url: `/uploads/editor-qa/${file}`, key: `/uploads/editor-qa/${file}`, type: file.endsWith("wav") ? "audio" : "video", label: { "scene-a.mp4": "Scene A - with sound", "scene-b.mp4": "Scene B - portrait", "ambience.wav": "Ambience" }[file] }));
  function attach(file) { setAttached(items => items.includes(file) ? items.filter(i => i !== file) : [...items, file]); }
  return <main style={{ padding: 24, height: "100dvh", overflow: "auto", background: "#11130f" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
      <button onClick={() => attach("scene-a.mp4")}>{attached.includes("scene-a.mp4") ? "Disconnect" : "Connect"} video A</button>
      <button onClick={() => attach("scene-b.mp4")}>{attached.includes("scene-b.mp4") ? "Disconnect" : "Connect"} video B</button>
      <button onClick={() => attach("ambience.wav")}>{attached.includes("ambience.wav") ? "Disconnect" : "Connect"} audio</button>
      <button onClick={() => { setNode(value => ({ ...JSON.parse(JSON.stringify(value)), data: { ...value.data, editorTimeline: normalizeEditorTimeline(value.data.editorTimeline) } })); setRevision(v => v + 1); }}>Save and reopen</button>
      <button onClick={() => setNarrow(v => !v)}>Toggle narrow layout</button>
      <button onClick={() => setPreview(v => !v)}>Toggle Preview</button>
    </div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "start" }}>
      <article className="node-card editor" style={{ position: "relative", transform: "none", width: narrow ? 390 : normalizeEditorNodeWidth(node.data.editorNodeWidth), maxWidth: "100%", minWidth: 0 }}>
        <header className="node-title"><span className="node-title-label"><PanelsTopLeft size={15} />Editor</span></header>
        <EditorNodeBody key={revision} node={node} config={config} sources={sources} workflowContext={{ projectId: "editor-qa", projectName: "Editor QA" }}
          chooseExportPath={chooseExportPath}
          connectedPortKeys={new Set(["editor-qa-node:videoIn", "editor-qa-node:audioIn", ...(preview ? ["editor-qa-node:videoOut"] : [])])}
          onUpdate={(_id, patch) => setNode(value => ({ ...value, data: { ...value.data, ...patch } }))}
          onPreviewOpen={item => setOpened(item)} onConnectStart={() => setPreview(true)} onDisconnectInput={() => setAttached([])} />
      </article>
      {preview && <article className="node-card preview" style={{ position: "relative", width: 480, maxWidth: "100%", transform: "none" }}><header className="node-title"><span className="node-title-label"><MonitorPlay size={15} />Preview</span></header><EditorMonitor nodeId={node.id} timeline={node.data.editorTimeline} /></article>}
    </div>
    {opened && <div style={{ maxWidth: 600, marginTop: 16 }}><button onClick={() => setOpened(null)}>Close still</button><img src={opened.url} alt="Captured still" style={{ width: "100%" }} /></div>}
    {saveDialog && <div className="workflow-prompt-backdrop"><section className="workflow-prompt" role="dialog" aria-modal="true" aria-label="QA save dialog">
      <label>Export name<input aria-label="Export name" value={saveName} onChange={event => setSaveName(event.target.value)} /></label>
      <p>Temporary QA folder</p>
      <button onClick={() => { saveDialog.resolve(null); setSaveDialog(null); }}>Cancel save</button>
      <button onClick={async () => { const result = await postJson("/api/editor-qa/save-path", { fileName: saveName }, "QA save path"); saveDialog.resolve(result.path); setSaveDialog(null); }}>Save sequence</button>
    </section></div>}
    <output aria-label="QA timeline state" style={{ display: "block", marginTop: 12, maxWidth: 1100, overflowWrap: "anywhere", fontSize: 11 }}>{JSON.stringify({ clips: node.data.editorTimeline.clips, inFrame: node.data.editorTimeline.inFrame, outFrame: node.data.editorTimeline.outFrame, status: node.data.status, resultUrl: node.data.resultUrl, exports: node.data.resultItems?.length || 0, stills: node.data.editorStills?.length || 0 })}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
