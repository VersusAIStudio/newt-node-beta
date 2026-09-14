import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nodeTypeDefinitions } from "../src/nodeRegistry.js";
import { createEditorTimeline, normalizeEditorTimeline, editorImportMedia, editorMove, editorTrim, editorSplit, editorDelete,
  editorDuplicate, editorUnlink, editorSelection, editorAddTrack, editorSetFrameRate, editorTimecode, editorEnd, editorRange, editorSnap, editorActiveClips, editorRenderSignature, validateEditorTimeline,
  editorCopyClips, editorPasteClips, editorEditPoint, editorGapAt, editorRippleDeleteGap } from "../src/editorTimeline.js";
import { normalizeEditorNodeWidth, estimatedNodeRect } from "../src/nodeGeometry.js";
import { buildEditorRenderArgs, validateEditorRequest } from "../server/editor-render.js";
import { cloneGraphState, remapImportedGraph, resetCopiedNodeRuntime } from "../src/workflowState.js";
import { isRunnableNode } from "../src/nodeRunner.js";

const video = { url: "/uploads/test/clip.mp4", label: "Test", type: "video", duration: 4, width: 1080, height: 1920, hasAudio: true };
const make = (asset = video) => editorImportMedia(createEditorTimeline(), asset, "connected-1");

test("Editor is directly below Director in the shared node catalog", () => {
  assert.equal(nodeTypeDefinitions[nodeTypeDefinitions.findIndex(n => n.type === "skillDirector") + 1].type, "editor");
});
test("defaults have V2, V1, A1, A2 and a frame-based empty sequence", () => {
  const t = createEditorTimeline(); assert.deepEqual(t.tracks.map(t => t.name), ["V2", "V1", "A1", "A2"]); assert.equal(t.fps, 24); assert.equal(editorEnd(t), 0);
});
test("a connected video imports once with linked audio and native aspect", () => {
  const t = make(); assert.equal(t.clips.length, 2); assert.equal(t.clips[0].duration, 96);
  assert.equal(t.clips[0].linkGroup, t.clips[1].linkGroup); assert.equal(t.width, 1080); assert.equal(t.height, 1920);
  assert.equal(editorImportMedia(t, video, "connected-1"), t);
});
test("deleting clips never re-imports them merely because the edge remains connected", () => {
  const t = make(), removed = editorDelete(t, [t.clips[0].id]); assert.equal(removed.clips.length, 0);
  assert.equal(editorImportMedia(removed, video, "connected-1"), removed);
});
test("new video appends and audio connections use A2 at the start", () => {
  let t = editorImportMedia(make(), { ...video, url: "/uploads/test/second.mp4", hasAudio: false }, "second");
  assert.equal(t.clips.at(-1).start, 96); assert.equal(t.clips.at(-1).linkGroup, "");
  t = editorImportMedia(t, { ...video, url: "/uploads/test/music.wav", type: "audio", width: 0, height: 0 }, "music");
  assert.equal(t.clips.at(-1).start, 0); assert.equal(t.clips.at(-1).trackId, "a2");
});
test("an audio-free video never manufactures a soundtrack", () => { assert.equal(make({ ...video, hasAudio: false }).clips.length, 1); });
test("unlink protects the whole group even with linked selection disabled", () => {
  const t = make(), locked = { ...t, tracks: t.tracks.map(track => ({ ...track, locked: track.id === "a1" })) };
  assert.throws(() => editorUnlink(locked, [t.clips[0].id]), /Unlock/);
  assert.ok(editorUnlink(t, [t.clips[0].id]).clips.every(c => c.linkGroup === ""));
});
test("save, copy and import preserve edits without copying an active export job", () => {
  const timeline = make(), node = { id: "editor", type: "editor", x: 0, y: 0,
    data: { editorTimeline: timeline, editorExportTimeline: timeline, editorExportJob: { id: "job" }, status: "running", editorStills: [{ url: "/outputs/still.png", type: "image" }] } };
  const saved = cloneGraphState({ nodes: [node] }).nodes[0];
  assert.deepEqual(saved.data.editorTimeline, timeline); assert.equal(saved.data.editorExportJob.id, "job");
  const copy = resetCopiedNodeRuntime(saved.data); assert.equal(copy.editorExportJob, null); assert.equal(copy.status, "ready");
  const imported = remapImportedGraph({ nodes: [node] }).nodes[0];
  assert.notEqual(imported.id, node.id); assert.equal(imported.data.editorExportJob, null);
  assert.deepEqual(imported.data.editorTimeline, timeline); assert.deepEqual(imported.data.editorStills, node.data.editorStills);
  assert.equal(editorRenderSignature(imported.data.editorExportTimeline), editorRenderSignature(imported.data.editorTimeline));
  assert.equal(isRunnableNode(node), false);
});
test("portable managed URL rewrites preserve import receipts and matching exports", () => {
  const timeline = editorImportMedia(createEditorTimeline(), video, video.url);
  const data = { editorTimeline: timeline, editorExportTimeline: timeline };
  const rewrite = value => typeof value === "string" ? value.replace(video.url, "/workflow-assets/copy/inputs/video.mp4")
    : Array.isArray(value) ? value.map(rewrite) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)])) : value;
  const copied = rewrite(data), source = copied.editorTimeline.assets[0];
  assert.equal(editorImportMedia(copied.editorTimeline, source, source.url), copied.editorTimeline);
  assert.equal(editorRenderSignature(copied.editorExportTimeline), editorRenderSignature(copied.editorTimeline));
});
test("new media uses a new track rather than changing locked tracks", () => {
  let t = createEditorTimeline(); t.tracks = t.tracks.map(track => ({ ...track, locked: true }));
  t = editorImportMedia(t, video, "first"); assert.equal(t.tracks.length, 6);
  assert.ok(t.clips.every(c => !t.tracks.find(track => track.id === c.trackId).locked));
});
test("move, trim, cut, delete and duplicate honor linked track locks", () => {
  let t = make(); t.tracks = t.tracks.map(track => ({ ...track, locked: track.id === "a1" }));
  const id = t.clips[0].id;
  for (const fn of [() => editorMove(t, [id], 10), () => editorTrim(t, id, "right", -10), () => editorSplit(t, 20, [id]), () => editorDelete(t, [id]), () => editorDuplicate(t, [id])]) assert.throws(fn, /Unlock/);
  assert.equal(editorSplit(t, 20).clips.length, 2);
});
test("linked moves stay synchronized, cannot cross zero, and can move video between tracks", () => {
  const t = make(), id = t.clips[0].id;
  const next = editorMove(t, [id], 15, { anchorId: id, trackId: "v2" }); assert.deepEqual(next.clips.map(c => c.start), [15, 15]);
  assert.equal(next.clips[0].trackId, "v2"); assert.equal(next.clips[1].trackId, "a1");
  assert.deepEqual(editorMove(next, [id], -100).clips.map(c => c.start), [0, 0]);
  assert.throws(() => editorMove(t, [id], 2, { anchorId: id, trackId: "a2" }), /same media/);
});
test("overlap on a single track is rejected without changing either clip", () => {
  const t = editorImportMedia(make(), { ...video, hasAudio: false }, "second");
  assert.throws(() => editorMove(t, [t.clips.at(-1).id], -10), /overlap/); assert.equal(t.clips.at(-1).start, 96);
});
test("trims maintain source offsets and cannot reveal frames beyond source bounds", () => {
  const t = make(), id = t.clips[0].id, trimmed = editorTrim(t, id, "left", 12);
  assert.ok(trimmed.clips.every(c => c.start === 12 && c.sourceIn === 12 && c.duration === 84));
  const restored = editorTrim(trimmed, id, "left", -100); assert.equal(restored.clips[0].sourceIn, 0);
  assert.equal(editorTrim(restored, id, "right", 100).clips[0].duration, 96);
  assert.equal(editorTrim(restored, id, "right", -100).clips[0].duration, 1);
});
test("split gives right halves a new shared link and exact contiguous frames", () => {
  const t = make(), cut = editorSplit(t, 30); assert.equal(cut.clips.length, 4);
  const right = cut.clips.filter(c => c.start === 30); assert.equal(right.length, 2); assert.equal(right[0].sourceIn, 30); assert.equal(right[0].duration, 66);
  assert.equal(right[0].linkGroup, right[1].linkGroup); assert.notEqual(right[0].linkGroup, t.clips[0].linkGroup);
  assert.equal(editorSelection(cut, [right[0].id]).length, 2);
  assert.equal(editorSplit(t, 0), t); assert.equal(editorSplit(t, 96), t);
});
test("unlink-edit mode can trim video separately from its sound", () => {
  const t = make(); const trimmed = editorTrim(t, t.clips[0].id, "right", -24, false);
  assert.equal(trimmed.clips[0].duration, 72); assert.equal(trimmed.clips[1].duration, 96);
});
test("duplicates append independent linked copies", () => {
  const t = make(), next = editorDuplicate(t, [t.clips[0].id]); assert.equal(next.clips.length, 4);
  assert.equal(next.clips[2].start, 96); assert.equal(next.clips[2].linkGroup, next.clips[3].linkGroup); assert.notEqual(next.clips[2].linkGroup, t.clips[0].linkGroup);
});
test("frame-rate changes preserve time, cuts and source offsets", () => {
  const t = editorSetFrameRate(editorSplit(make(), 24), 30); assert.equal(editorEnd(t), 120); assert.equal(t.clips[1].start, 30); assert.equal(t.clips[1].sourceIn, 30);
  assert.equal(editorTimecode(30 * 3661 + 15, 30), "01:01:01:15");
});
test("range normalization and snapping use frames, not accumulated floating-point seconds", () => {
  const t = make(); assert.deepEqual(editorRange(t), { start: 0, end: 96 });
  assert.deepEqual(editorRange(normalizeEditorTimeline({ ...t, inFrame: 300, outFrame: 0 })), { start: 95, end: 96 });
  assert.equal(editorSnap(t, 94, [], 3), 96); assert.equal(editorSnap(t, 89, [], 3), 89);
});
test("higher visible video tracks win, while audio mixes independently", () => {
  const t = make(), top = { ...t.clips[0], id: "top", trackId: "v2", start: 10, duration: 20 };
  t.clips.push(top); assert.equal(editorActiveClips(t, 15).video.id, "top"); assert.equal(editorActiveClips(t, 15).audio.length, 1);
  t.tracks[0].muted = true; assert.equal(editorActiveClips(t, 15).video.trackId, "v1");
  assert.equal(editorActiveClips(t, 96).video, null);
});
test("save/reload retains edits, media and import receipts without generating", () => {
  let t = make(); t = editorTrim(t, t.clips[0].id, "right", -20);
  t = editorSplit(t, 25); assert.deepEqual(normalizeEditorTimeline(JSON.parse(JSON.stringify(t))), normalizeEditorTimeline(t));
});
test("export signatures ignore track names and locks but include content, mute and range", () => {
  const t = make(), sig = editorRenderSignature(t);
  assert.equal(editorRenderSignature({ ...t, tracks: t.tracks.map(track => ({ ...track, locked: true, name: "Renamed" })) }), sig);
  assert.notEqual(editorRenderSignature({ ...t, outFrame: 20 }), sig);
});
test("server rejects remote sources, bad clips, duplicates and invalid overlaps", () => {
  const t = make(); assert.doesNotThrow(() => validateEditorRequest(t));
  assert.throws(() => validateEditorRequest({ ...t, assets: t.assets.map(a => ({ ...a, url: "https://example.com/x.mp4" })) }), /uploaded/);
  assert.throws(() => validateEditorRequest({ ...t, clips: t.clips.map(c => ({ ...c, sourceIn: 300 })) }), /bounds/);
  assert.throws(() => validateEditorRequest({ ...t, tracks: [...t.tracks, t.tracks[0]] }), /duplicate/);
  assert.throws(() => validateEditorTimeline({ ...t, clips: [...t.clips, { ...t.clips[0], id: "duplicate" }] }), /overlap/);
});
test("FFmpeg arguments contain exact range, independent sound, black gaps and no shell text", () => {
  const t = { ...make(), inFrame: 12, outFrame: 60 }, files = new Map([[t.assets[0].id, { filePath: "/tmp/path with spaces.mp4" }]]);
  const args = buildEditorRenderArgs(t, files, "/tmp/export.mp4"), filter = args[args.indexOf("-filter_complex") + 1];
  assert.ok(args.includes("/tmp/path with spaces.mp4")); assert.equal(args[args.indexOf("-frames:v") + 1], "48");
  assert.match(filter, /amix=inputs=2/); assert.match(filter, /repeatlast=1/); assert.match(filter, /color=c=black/); assert.match(filter, /adelay=0S/);
  assert.match(filter, /trim=start_frame=12:end_frame=60/);
  assert.ok(filter.includes("gte(round(t*24),0)*lt(round(t*24),48)"));
  const still = buildEditorRenderArgs(t, files, "/tmp/still.png", { frame: 30 });
  assert.equal(still[still.indexOf("-frames:v") + 1], "1"); assert.ok(still.includes("-an"));
});
test("Editor UI is lazy and wired to Preview, API health and timeline keyboard isolation", () => {
  const app = readFileSync(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  assert.match(app, /React\.lazy\(\(\) => import\("\.\/components\/EditorNodeBody\.jsx"\)/);
  assert.match(app, /previewSource\?\.editorTimeline && <React.Suspense/);
  assert.match(readFileSync(new URL("../server/index.js", import.meta.url), "utf8"), /editorTimeline: true/);
  assert.match(readFileSync(new URL("../src/nodeKeyboardRouting.js", import.meta.url), "utf8"), /data-editor-timeline/);
});

test("clipboard captures independent trimmed clips with timing, volume and linked sound", () => {
  const t = make(), trimmed = editorTrim(t, t.clips[0].id, "left", 12);
  trimmed.clips[1].volume = .4;
  const clipboard = editorCopyClips(trimmed, [t.clips[0].id]);
  assert.equal(clipboard.clips.length, 2); assert.equal(clipboard.assets.length, 1);
  assert.deepEqual(clipboard.clips.map(c => [c.start, c.sourceIn, c.duration]), [[0, 12, 84], [0, 12, 84]]);
  assert.equal(clipboard.clips[1].volume, .4);
  clipboard.clips[0].duration = 1; assert.equal(trimmed.clips[0].duration, 84);
  assert.equal(editorCopyClips(t, []), null);
  assert.equal(editorCopyClips(t, [t.clips[0].id], false).clips.length, 1);
});

test("paste appends independent linked copies without duplicating the media asset", () => {
  const t = make(), clipboard = editorCopyClips(t, [t.clips[0].id]);
  const next = editorPasteClips(t, clipboard, editorEnd(t)), pasted = next.clips.slice(2);
  assert.equal(next.assets.length, 1); assert.equal(next.clips.length, 4);
  assert.deepEqual(pasted.map(c => c.start), [96, 96]);
  assert.ok(pasted.every(c => !t.clips.some(old => old.id === c.id)));
  assert.equal(pasted[0].linkGroup, pasted[1].linkGroup); assert.notEqual(pasted[0].linkGroup, t.clips[0].linkGroup);
  assert.equal(editorEnd(editorPasteClips(next, clipboard, editorEnd(next))), 288);
  assert.equal(t.clips.length, 2);
});

test("copying multiple clips preserves relative gaps and cross-frame-rate paste preserves time", () => {
  const first = make(), t = editorDuplicate(first, [first.clips[0].id]);
  const second = t.clips[2].id, moved = editorMove(t, [second], 24);
  const clipboard = editorCopyClips(moved, [first.clips[0].id, second]);
  const pasted = editorPasteClips({ ...createEditorTimeline(), fps: 30 }, clipboard, 15);
  assert.deepEqual(pasted.clips.map(c => [c.start, c.duration]), [[15, 120], [15, 120], [165, 120], [165, 120]]);
  assert.equal(pasted.assets.length, 1);
  const trimmed = editorTrim(first, first.clips[0].id, "left", 24);
  assert.equal(editorPasteClips({ ...createEditorTimeline(), fps: 30 }, editorCopyClips(trimmed, [trimmed.clips[0].id]), 0).clips[0].sourceIn, 30);
});

test("pasting supports new tracks and chosen destinations while respecting locks and collisions", () => {
  const t = make(), clipboard = editorCopyClips(t, [t.clips[0].id]);
  const locked = { ...t, tracks: t.tracks.map(track => ({ ...track, locked: track.id === "a1" })) };
  assert.ok(editorCopyClips(locked, [t.clips[0].id]));
  assert.throws(() => editorPasteClips(locked, clipboard, 96), /Unlock A1/);
  assert.throws(() => editorPasteClips(t, clipboard, 10), /overlap/);
  const onlyVideo = editorCopyClips(t, [t.clips[0].id], false);
  assert.equal(editorPasteClips(t, onlyVideo, 0, { targetTrackId: "v2" }).clips.at(-1).trackId, "v2");
  const withTrack = editorAddTrack(t, "video", "v3");
  const upper = editorMove(withTrack, [t.clips[0].id], 0, { anchorId: t.clips[0].id, trackId: "v3" });
  const imported = editorPasteClips(createEditorTimeline(), editorCopyClips(upper, [t.clips[0].id]), 0);
  assert.equal(imported.tracks.length, 5);
  assert.equal(imported.tracks.find(track => track.id === imported.clips[0].trackId).name, "V3");
  assert.equal(t.clips.length, 2);
});

test("clipboard refuses unrelated data, invalid sources and exceeding sequence limits", () => {
  const t = make(), copied = editorCopyClips(t, [t.clips[0].id]);
  for (const bad of [null, {}, { ...copied, version: 2 }, { ...copied, clips: [] }, { ...copied, clips: [{ ...copied.clips[0], assetId: "missing" }] },
    { ...copied, assets: copied.assets.map(a => ({ ...a, url: "https://untrusted.example/video.mp4" })) }]) {
    assert.throws(() => editorPasteClips(t, bad, 96), /clipboard/i);
  }
  assert.throws(() => editorPasteClips(t, copied, 7200 * 24), /bounds/);
  assert.throws(() => editorPasteClips({ ...t, clips: Array.from({ length: 200 }, () => t.clips[0]) }, copied, 96), /clip limit/);
});

test("Up and Down navigation finds strict edit boundaries including gaps and the final end", () => {
  const t = make(), moved = editorSplit(t, 24);
  assert.equal(editorEditPoint(moved, 0, -1), 0); assert.equal(editorEditPoint(moved, 0, 1), 24);
  assert.equal(editorEditPoint(moved, 24, 1), 96); assert.equal(editorEditPoint(moved, 96, -1), 24);
  assert.equal(editorEditPoint(moved, 95, 1), 96); assert.equal(editorEditPoint(moved, 96, 1), 96);
  assert.equal(editorEditPoint(createEditorTimeline(), 0, 1), 0);
  const gapped = editorMove(t, [t.clips[0].id], 12);
  assert.equal(editorEditPoint(gapped, 0, 1), 12); assert.equal(editorEditPoint(gapped, 13, -1), 12);
});

const gappedSequence = () => {
  const t = make(), next = editorDuplicate(t, [t.clips[0].id]);
  return editorMove(next, [next.clips[2].id], 24);
};

test("gap selection finds only empty leading or interior regions with a following clip", () => {
  const t = gappedSequence();
  assert.deepEqual(editorGapAt(t, "v1", 100), { trackId: "v1", start: 96, end: 120 });
  assert.equal(editorGapAt(t, "v1", 95), null); assert.equal(editorGapAt(t, "v1", 120), null);
  assert.equal(editorGapAt(t, "v1", 216), null); assert.equal(editorGapAt(t, "v2", 50), null);
  assert.equal(editorGapAt(t, "missing", 50), null);
  const shifted = editorMove(t, t.clips.map(c => c.id), 10);
  assert.deepEqual(editorGapAt(shifted, "v1", 0), { trackId: "v1", start: 0, end: 10 });
});

test("ripple delete closes the gap, moves downstream linked sound and preserves other material", () => {
  const t = gappedSequence(), before = JSON.stringify(t);
  const withMusic = editorImportMedia(t, { ...video, url: "/uploads/music.wav", type: "audio", duration: 10 }, "music");
  const next = editorRippleDeleteGap(withMusic, editorGapAt(withMusic, "v1", 100));
  assert.deepEqual(next.clips.slice(0, 4).map(c => c.start), [0, 0, 96, 96]);
  assert.deepEqual(next.clips.at(-1), withMusic.clips.at(-1));
  assert.deepEqual(next.clips.slice(2, 4).map(c => [c.sourceIn, c.duration, c.linkGroup, c.volume]), t.clips.slice(2).map(c => [c.sourceIn, c.duration, c.linkGroup, c.volume]));
  assert.equal(JSON.stringify(t), before); assert.doesNotThrow(() => validateEditorTimeline(next));
});

test("ripple delete refuses locked tracks, collisions, stale gaps and linked clips crossing the gap", () => {
  const t = gappedSequence(), gap = editorGapAt(t, "v1", 100);
  for (const id of ["v1", "a1"]) assert.throws(() => editorRippleDeleteGap({ ...t, tracks: t.tracks.map(track => ({ ...track, locked: track.id === id })) }, gap), /Unlock/);
  const blocking = { ...t, clips: [...t.clips, { ...t.clips[0], id: "blocking", trackId: "v2", start: 80, duration: 35, linkGroup: "" },
    { ...t.clips[0], id: "later", trackId: "v2", start: 120, duration: 20, linkGroup: "" }] };
  assert.throws(() => editorRippleDeleteGap(blocking, gap), /overlap other clips/);
  const crossing = { ...t, clips: t.clips.map(c => c.id === t.clips[3].id ? { ...c, start: 100 } : c) };
  assert.throws(() => editorRippleDeleteGap(crossing, gap), /linked clip crosses/);
  assert.throws(() => editorRippleDeleteGap(t, { ...gap, end: 125 }), /empty gap/);
  assert.throws(() => editorRippleDeleteGap(t, null), /empty gap/);
  assert.deepEqual(t.clips.map(c => c.start), [0, 0, 120, 120]);
});

test("one-frame clip nudges leave sources unchanged and obey linking, bounds and locks", () => {
  const t = make(), id = t.clips[0].id, moved = editorMove(t, [id], 1);
  assert.deepEqual(moved.clips.map(c => [c.start, c.sourceIn]), [[1, 0], [1, 0]]);
  assert.deepEqual(editorMove(moved, [id], -1), t);
  assert.deepEqual(editorMove(t, [id], -1), t);
  assert.deepEqual(editorMove(t, [id], 1, { linked: false }).clips.map(c => c.start), [1, 0]);
});

test("Editor width is bounded, portable and used for graph geometry", () => {
  assert.equal(normalizeEditorNodeWidth(undefined), 1100); assert.equal(normalizeEditorNodeWidth(NaN), 1100);
  assert.equal(normalizeEditorNodeWidth(500), 720); assert.equal(normalizeEditorNodeWidth(9000), 3200);
  assert.equal(normalizeEditorNodeWidth(1600.4), 1600);
  const node = { id: "width-test", type: "editor", x: 100, y: 50, data: { editorNodeWidth: 1600 } };
  assert.equal(estimatedNodeRect(node).right, 1700);
  assert.equal(cloneGraphState({ nodes: [node] }).nodes[0].data.editorNodeWidth, 1600);
  assert.equal(remapImportedGraph({ nodes: [node] }).nodes[0].data.editorNodeWidth, 1600);
});
