import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { newtPresetDisplayName } from "../myNewt/presets.js";

export function PresetWorkflowPicker({ controller: presets, insertionDisabled = false }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null), trigger = useRef(null), menu = useRef(null);
  const menuId = useId();
  const error = presets.error && !presets.draft;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = event => { if (!root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  function close() { setOpen(false); trigger.current?.focus(); }
  function onKeyDown(event) {
    if (event.key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); setOpen(true);
      }
      return;
    }
    event.preventDefault(); event.stopPropagation();
    const buttons = [...menu.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const index = buttons.indexOf(document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
  return <div className="preset-workflow-picker" ref={root} onKeyDown={onKeyDown}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button type="button" className="project-picker-trigger" ref={trigger} aria-haspopup="menu" aria-expanded={open}
      aria-controls={menuId} aria-busy={presets.busy} disabled={presets.busy}
      title={insertionDisabled ? "Pause Newt before inserting a preset" : "Preset Workflow"} onClick={() => setOpen(value => !value)}>
      <span>Preset Workflow</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    <div className="project-menu preset-workflow-menu" role="menu" aria-label="Preset workflows" id={menuId} ref={menu} hidden={!open}>
      {!presets.items.length && <small>No saved presets</small>}
      {presets.items.map(preset => <div className="preset-workflow-row" role="none" key={preset.id}>
        <button type="button" role="menuitem" className="preset-workflow-load" aria-label={`Insert ${newtPresetDisplayName(preset)}`}
          title={insertionDisabled ? "Pause Newt before inserting a preset" : `Insert ${newtPresetDisplayName(preset)}`}
          disabled={presets.busy || insertionDisabled} onClick={() => { close(); presets.insert(preset.id, {}); }}>
          <span>{preset.name}</span><small>({preset.isSystem ? "System" : "User"})</small>
        </button>
        {preset.isSystem === false && <button type="button" role="menuitem" className="preset-workflow-delete"
          title={`Delete ${preset.name}`} aria-label={`Delete ${preset.name}`} disabled={presets.busy}
          onClick={() => { close(); presets.remove(preset.id); }}><Trash2 size={14} aria-hidden="true" /></button>}
      </div>)}
    </div>
    {error && <div className="preset-workflow-error-row">
      <p className="preset-workflow-error" role="alert">{presets.error}</p>
      <button type="button" title="Reload presets" aria-label="Reload presets" disabled={presets.busy} onClick={presets.refresh}><RefreshCw size={15} /></button>
    </div>}
  </div>;
}
