import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BookOpen, RotateCcw, Save, X } from "lucide-react";
import { newtSkillsApi } from "../api/newtApi.js";

export function NewtSkillsEditor({ api = newtSkillsApi }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="my-newt-skills-button" title="Edit versioned creative guidance for new tasks on this computer" onClick={() => setOpen(true)}><BookOpen size={15} />Creative Skills</button>
    {open && createPortal(<SkillDialog api={api} onClose={() => setOpen(false)} />, document.body)}
  </>;
}

function SkillDialog({ api, onClose }) {
  const [items, setItems] = useState([]), [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState({ instructions: "", enabled: true });
  const [busy, setBusy] = useState(true), [error, setError] = useState(""), [status, setStatus] = useState("");
  const dialog = useRef(null), operation = useRef(false), alive = useRef(true);
  const selected = items.find(item => item.id === selectedId);
  const dirty = !!selected && (draft.instructions !== selected.instructions || draft.enabled !== selected.enabled);
  const choose = item => { setSelectedId(item?.id || ""); setDraft({ instructions: item?.instructions || "", enabled: item?.enabled ?? true }); };
  async function load() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try {
      const result = await api.list();
      if (alive.current) { setItems(result); choose(result.find(item => item.id === selectedId) || result[0]); setStatus(""); }
    } catch (err) { if (alive.current) setError(err.message); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialog.current?.focus();
    void load();
    return () => { alive.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  const mayDiscard = () => !dirty || window.confirm("Discard your unsaved skill changes?");
  const close = () => { if (!busy && mayDiscard()) onClose(); };
  async function persist(reset = false) {
    if (operation.current || !selected) return;
    if (reset && !window.confirm(`Restore the current system version of ${selected.title}? Your custom version is retained in local revision history.`)) return;
    operation.current = true; setBusy(true); setError(""); setStatus("");
    try {
      const item = reset ? await api.reset(selected.id, selected.revision) : await api.save(selected.id, { ...draft, expectedRevision: selected.revision });
      if (alive.current) { setItems(current => current.map(old => old.id === item.id ? item : old)); choose(item); setStatus(reset ? "System version restored. Applies to new tasks." : "Saved. Applies to new tasks."); }
    } catch (err) { if (alive.current) setError(err.message); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  function keyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const controls = [...dialog.current.querySelectorAll("input:not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)")].filter(item => item.getClientRects().length);
    if (!controls.length) { event.preventDefault(); return; }
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  return <div className="workflow-prompt-backdrop newt-skills-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <form ref={dialog} className="workflow-prompt newt-skills-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="newt-skills-title" onPointerDown={event => event.stopPropagation()} onKeyDown={keyDown} onSubmit={event => { event.preventDefault(); if (!busy && dirty) void persist(); }}>
      <header><h2 id="newt-skills-title">Creative Skills</h2><button type="button" className="my-newt-icon" title="Close skills" aria-label="Close skills" disabled={busy} onClick={close}><X size={18} /></button></header>
      <div className="newt-skills-controls"><label>Skill<select aria-label="Creative skill" value={selectedId} disabled={busy} onChange={event => { if (mayDiscard()) { choose(items.find(item => item.id === event.target.value)); setError(""); setStatus(""); } }}>
        {!items.length && <option value="">{busy ? "Loading..." : "Unavailable"}</option>}{items.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
      </select></label><label className="newt-skill-enabled"><input type="checkbox" checked={draft.enabled} disabled={busy || !selected} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} />Enabled</label></div>
      {selected && <div className="newt-skill-meta"><span>{selected.source} · v{selected.baseVersion}</span><span title="Customization applies to all new Newt tasks on this computer, not just this project.">This computer · New tasks</span></div>}
      {selected && <p className="newt-skill-scope">{selected.scope}</p>}
      {selected?.baseVersion !== selected?.version && <p role="status">System v{selected.version} is available. Your custom instructions are preserved.</p>}
      <label>Instructions<textarea aria-label="Skill instructions" maxLength={6000} spellCheck={false} value={draft.instructions} disabled={busy || !selected} onChange={event => setDraft(current => ({ ...current, instructions: event.target.value }))} /></label>
      <div className="newt-skill-meta"><span>{dirty ? "Unsaved changes" : ""}</span><span>{draft.instructions.length} / 6000</span></div>
      {error && <div className="newt-skill-error"><p role="alert">{error}</p><button type="button" disabled={busy} onClick={() => { if (mayDiscard()) void load(); }}>Reload</button></div>}
      {status && <p role="status">{status}</p>}
      <div className="workflow-prompt-actions"><button type="button" title="Restore the latest bundled skill" disabled={busy || !selected || (selected.source === "System" && !dirty)} onClick={() => persist(true)}><RotateCcw size={15} />Reset to System</button><button className="primary" type="submit" disabled={busy || !dirty || !draft.instructions.trim()}><Save size={15} />{busy ? "Please wait..." : "Save"}</button></div>
    </form>
  </div>;
}
