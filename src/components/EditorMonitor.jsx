import React from "react";
import { Play, Pause, SkipBack } from "lucide-react";
import { editorPlayback } from "../editorPlayback.js";
import { editorTimecode } from "../editorTimeline.js";
import "../editorTimeline.css";

export function EditorMonitor({ nodeId, timeline, controls = true, allowNodeDrag = false }) {
  const player = React.useMemo(() => editorPlayback(nodeId), [nodeId]);
  const state = React.useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
  const canvasRef = React.useRef(null);
  React.useEffect(() => player.mirror(canvasRef.current), [player]);
  return <div className="editor-monitor" onPointerDown={event => { if (!allowNodeDrag) event.stopPropagation(); }}>
    <canvas ref={canvasRef} width={timeline.width} height={timeline.height} style={{ aspectRatio: `${timeline.width} / ${timeline.height}` }} aria-label="Editor sequence preview" />
    {state.buffering && <span className="editor-monitor-state" role="status">Buffering</span>}
    {state.error && <span className="editor-monitor-error" role="alert">{state.error}</span>}
    {controls && <div className="editor-monitor-controls">
      <button onClick={() => player.seek(timeline.inFrame)} title="Go to In" aria-label="Go to In"><SkipBack size={15} /></button>
      <button onClick={() => state.playing ? player.pause() : player.play()} title="Play / pause" aria-label={state.playing ? "Pause sequence" : "Play sequence"}>{state.playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <output>{editorTimecode(state.frame, timeline.fps)}</output>
    </div>}
  </div>;
}
