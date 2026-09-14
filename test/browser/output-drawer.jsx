import React from "react";
import { createRoot } from "react-dom/client";
import { ProjectOutputDrawer, OutputPreviewLightbox } from "../../src/components/MediaViews.jsx";
import { rememberOutputDrawerWidth, savedOutputDrawerWidth } from "../../src/workflowPreferences.js";
import "../../src/styles.css";
import "../../src/nodeEditor.css";

// No provider or project access. Exercise the real rail with bundled image assets.
const items = ["storyboard/MOOD_BOARD.png", "newtnode-logo.png", "newt-mark.png"].map((file, i) => ({ id: `qa-${i}`, type: "image", url: `/${file}`, label: `QA image ${i + 1}` }));
function Harness() {
  const [width, setWidth] = React.useState(savedOutputDrawerWidth), [open, setOpen] = React.useState(true);
  const [preview, setPreview] = React.useState(null), [drop, setDrop] = React.useState("");
  function resize(nextWidth, remember) { setWidth(nextWidth); if (remember) rememberOutputDrawerWidth(nextWidth); }
  return <main style={{ padding: 16 }}>
    <button onClick={() => setOpen(value => !value)}>Toggle outputs</button>
    <output aria-label="Preferred thumbnail width">{width}</output>
    <section className={`node-workspace toolbar-collapsed ${open ? "outputs-open" : "outputs-collapsed"}`} style={{ "--output-drawer-width": `${width}px` }}>
      <div className="node-canvas" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setDrop(event.dataTransfer.types.join(", ")); }}>
        <output aria-label="Dropped content">{drop}</output>
      </div>
      {open && <ProjectOutputDrawer items={items} width={width} onResize={resize} onClose={() => setOpen(false)} onPreviewOpen={setPreview} />}
    </section>
    {preview && <OutputPreviewLightbox item={preview} onClose={() => setPreview(null)} />}
  </main>;
}
createRoot(document.getElementById("root")).render(<Harness />);
