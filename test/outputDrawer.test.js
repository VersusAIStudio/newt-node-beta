import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeOutputDrawerWidth, outputDrawerMaxWidth } from "../src/nodeGeometry.js";
import { savedOutputDrawerWidth, rememberOutputDrawerWidth } from "../src/workflowPreferences.js";

test("output drawer width defaults to the compact rail and clamps stored or dragged widths", () => {
  for (const value of [undefined, null, "", "bad", NaN, Infinity, -50, 0]) assert.equal(normalizeOutputDrawerWidth(value), 116);
  assert.equal(normalizeOutputDrawerWidth(20), 116);
  assert.equal(normalizeOutputDrawerWidth("267.8"), 268);
  assert.equal(normalizeOutputDrawerWidth(900), 480);
  assert.equal(normalizeOutputDrawerWidth(450, 340), 340);
  assert.equal(normalizeOutputDrawerWidth(450, 50), 116);
  assert.equal(normalizeOutputDrawerWidth(900, 900), 480);
  assert.equal(normalizeOutputDrawerWidth(450, NaN), 450);
});

test("the rail reserves canvas room and only caps the displayed preference on smaller workspaces", () => {
  assert.equal(outputDrawerMaxWidth(2000), 480);
  assert.equal(outputDrawerMaxWidth(1000), 400);
  assert.equal(outputDrawerMaxWidth(861), 344);
  assert.equal(outputDrawerMaxWidth(200), 116);
  assert.equal(outputDrawerMaxWidth(0), 480);
  assert.equal(normalizeOutputDrawerWidth(480, outputDrawerMaxWidth(900)), 360);
  assert.equal(normalizeOutputDrawerWidth(480, outputDrawerMaxWidth(1400)), 480);
});

test("thumbnail size is a local preference, defaults compact, and tolerates blocked storage", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window"), saved = new Map();
  try {
    globalThis.window = { localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } };
    assert.equal(savedOutputDrawerWidth(), 116);
    rememberOutputDrawerWidth(320); assert.equal(savedOutputDrawerWidth(), 320);
    rememberOutputDrawerWidth(900); assert.equal(savedOutputDrawerWidth(), 480);
    rememberOutputDrawerWidth(116); assert.equal(savedOutputDrawerWidth(), 116);
    saved.set("newtnode-output-drawer-width", "broken"); assert.equal(savedOutputDrawerWidth(), 116);
    globalThis.window = { get localStorage() { throw new Error("Storage unavailable"); } };
    assert.equal(savedOutputDrawerWidth(), 116);
    assert.doesNotThrow(() => rememberOutputDrawerWidth(240));
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous); else delete globalThis.window;
  }
});

test("sidebar resize is accessible, cancelable and does not remove automatic history refresh", () => {
  const media = readFileSync(new URL("../src/components/MediaViews.jsx", import.meta.url), "utf8");
  const handle = readFileSync(new URL("../src/components/OutputDrawerResizeHandle.jsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(media, /Refresh outputs|onRefresh|RefreshCw/);
  assert.match(media, /<OutputDrawerResizeHandle/);
  assert.match(handle, /role="separator" tabIndex=\{0\}/);
  assert.match(handle, /aria-orientation="vertical"/);
  assert.match(handle, /setPointerCapture\(event.pointerId\)/);
  assert.match(handle, /onPointerCancel=\{event => finishResize\(event, true\)\}/);
  assert.match(handle, /event.key === "Escape"/);
  assert.match(handle, /drag.startWidth \+ drag.startX - event.clientX/);
  assert.match(editor, /observer.observe\(canvas\)/);
  assert.match(editor, /if \(!active \|\| outputsCollapsed \|\| outputHistoryLoadedRef.current\) return;\s+loadOutputHistory\(\)/);
  const css = readFileSync(new URL("../src/nodeEditor.css", import.meta.url), "utf8");
  assert.match(css, /\.project-output-list\s*\{[^}]*grid-auto-rows: max-content;/);
});
