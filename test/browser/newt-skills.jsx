import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NewtSkillsEditor } from "../../src/components/NewtSkillsEditor.jsx";
import manifest from "../../server/newt-skills/manifest.json";
import planning from "../../server/newt-skills/workflow-planning.md?raw";
import narrative from "../../server/newt-skills/cinematic-narrative.md?raw";
import selection from "../../server/newt-skills/asset-selection.md?raw";
import organization from "../../server/newt-skills/canvas-organization.md?raw";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

function Harness() {
  const state = useRef(manifest.skills.map((item, index) => ({ ...item, instructions: [planning, narrative, selection, organization][index].trim(), source: "System", baseVersion: item.version, revision: "1", enabled: true })));
  const conflict = useRef(false);
  const [saved, setSaved] = useState("No edits");
  const api = useRef({
    list: async () => structuredClone(state.current),
    save: async (id, body) => {
      if (conflict.current) throw new Error("This skill changed elsewhere. Reload it before saving; your text has been kept.");
      const old = state.current.find(item => item.id === id);
      const updated = { ...old, ...body, source: "Custom", revision: String(Number(old.revision) + 1) };
      state.current = state.current.map(item => item.id === id ? updated : item);
      setSaved(`${updated.title}: ${updated.enabled ? "enabled" : "disabled"}, ${updated.instructions}`);
      return structuredClone(updated);
    },
    reset: async id => {
      const index = state.current.findIndex(item => item.id === id), old = state.current[index];
      const updated = { ...old, instructions: [planning, narrative, selection, organization][index].trim(), source: "System", enabled: true, revision: String(Number(old.revision) + 1) };
      state.current[index] = updated; setSaved(`${updated.title}: System restored`);
      return structuredClone(updated);
    }
  }).current;
  return <main style={{ padding: 24, maxWidth: 740, overflowWrap: "anywhere" }}>
    <h1 style={{ fontSize: 20 }}>Creative skills QA</h1>
    <p>No project changes or provider requests.</p>
    <label><input type="checkbox" onChange={event => { conflict.current = event.target.checked; }} />Conflict on save</label>
    <div style={{ margin: "20px 0" }}><NewtSkillsEditor api={api} /></div>
    <output aria-label="Saved skill">{saved}</output>
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
