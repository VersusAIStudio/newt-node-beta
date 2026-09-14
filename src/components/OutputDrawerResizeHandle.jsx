import React from "react";
import { normalizeOutputDrawerWidth, outputDrawerMaxWidth, outputDrawerWidthLimits } from "../nodeGeometry.js";

export function OutputDrawerResizeHandle({ width, onResize, controlsId }) {
  const handleRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  const [maxWidth, setMaxWidth] = React.useState(outputDrawerWidthLimits.max);
  const currentWidth = normalizeOutputDrawerWidth(width, maxWidth);

  React.useLayoutEffect(() => {
    const workspace = handleRef.current?.closest(".node-workspace");
    if (!workspace) return undefined;
    const updateLimit = () => setMaxWidth(outputDrawerMaxWidth(workspace.clientWidth));
    updateLimit();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(updateLimit) : null;
    observer?.observe(workspace);
    return () => observer?.disconnect();
  }, []);

  function beginResize(event) {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startWidth = event.currentTarget.parentElement.getBoundingClientRect().width;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth, originalWidth: width, nextWidth: width };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveResize(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.nextWidth = normalizeOutputDrawerWidth(drag.startWidth + drag.startX - event.clientX, maxWidth);
    onResize(drag.nextWidth);
  }

  function finishResize(event, cancel = false) {
    const drag = dragRef.current;
    if (!drag || (event.pointerId != null && drag.pointerId !== event.pointerId)) return;
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    onResize(cancel ? drag.originalWidth : drag.nextWidth, !cancel);
    if (handleRef.current?.hasPointerCapture(drag.pointerId)) handleRef.current.releasePointerCapture(drag.pointerId);
  }

  function handleKeyDown(event) {
    event.stopPropagation();
    if (event.key === "Escape" && dragRef.current) {
      event.preventDefault();
      finishResize(event, true);
      return;
    }
    if (dragRef.current) return;
    const step = event.shiftKey ? 40 : 10;
    const nextWidth = { ArrowLeft: currentWidth + step, ArrowRight: currentWidth - step, Home: outputDrawerWidthLimits.default, End: maxWidth }[event.key];
    if (nextWidth == null) return;
    event.preventDefault();
    onResize(normalizeOutputDrawerWidth(nextWidth, maxWidth), true);
  }

  return <div ref={handleRef} className={`output-drawer-resize-handle${dragging ? " is-resizing" : ""}`}
    role="separator" tabIndex={0} aria-label="Resize project thumbnails" aria-orientation="vertical" aria-controls={controlsId}
    aria-valuemin={outputDrawerWidthLimits.min} aria-valuemax={maxWidth} aria-valuenow={currentWidth} aria-valuetext={`${currentWidth}px`}
    title="Drag to resize thumbnails. Double-click to reset."
    onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={finishResize}
    onPointerCancel={event => finishResize(event, true)} onLostPointerCapture={finishResize}
    onKeyDown={handleKeyDown} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
    onDoubleClick={event => { event.preventDefault(); event.stopPropagation(); onResize(outputDrawerWidthLimits.default, true); }} />;
}
