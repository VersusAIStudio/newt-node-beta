import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createEditorTimeline, editorImportMedia, editorMove, editorSplit } from "../src/editorTimeline.js";
import { probeEditorMedia, buildEditorRenderArgs, executeEditorFfmpeg, editorWaveform } from "../server/editor-render.js";
const exec = promisify(execFile);

test("local FFmpeg export verifies stacking, source audio, In/Out frames and PNG stills", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "newtnode-editor-test-"));
  try {
    const red = path.join(dir, "red.mp4"), blue = path.join(dir, "blue.mp4");
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=red:s=160x90:r=24:d=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", red]);
    await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x90:r=24:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", blue]);
    const redMeta = await probeEditorMedia(red, ffprobe.path), blueMeta = await probeEditorMedia(blue, ffprobe.path);
    assert.equal(redMeta.hasAudio, true); assert.equal(blueMeta.hasAudio, false);
    let timeline = editorImportMedia(createEditorTimeline(), { ...redMeta, url: "/uploads/qa/red.mp4", label: "Red" }, "red");
    timeline = editorImportMedia(timeline, { ...blueMeta, url: "/uploads/qa/blue.mp4", label: "Blue" }, "blue");
    const blueClip = timeline.clips.at(-1);
    timeline = editorMove(timeline, [blueClip.id], -24, { anchorId: blueClip.id, trackId: "v2" });
    timeline = { ...timeline, inFrame: 12, outFrame: 60 };
    const files = new Map(timeline.assets.map(a => [a.id, { filePath: a.label === "Red" ? red : blue }]));
    const output = path.join(dir, "export.mp4");
    await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, output));
    const metadata = await probeEditorMedia(output, ffprobe.path); assert.equal(metadata.width, 160); assert.equal(metadata.height, 90);
    assert.ok(Math.abs(metadata.duration - 2) < .06); assert.equal(metadata.hasAudio, true);
    const { stdout: probeFrames } = await exec(ffprobe.path, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames", "-of", "json", output]);
    assert.equal(JSON.parse(probeFrames).streams[0].nb_frames, "48");
    const pixel = async (file, time) => (await exec(ffmpeg, ["-v", "error", "-ss", String(time), "-i", file, "-frames:v", "1", "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" })).stdout;
    const first = await pixel(output, 0), second = await pixel(output, .6);
    assert.ok(first[0] > 200 && first[2] < 40, `expected red, got ${[...first]}`);
    assert.ok(second[2] > 200 && second[0] < 40, `expected blue, got ${[...second]}`);
    const still = path.join(dir, "still.png"); await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(timeline, files, still, { frame: 30 }));
    const stillPixel = await pixel(still, 0); assert.ok(stillPixel[2] > 200 && stillPixel[0] < 40);
    const waveform = await editorWaveform(red, redMeta.duration, ffmpeg); assert.equal(waveform.length, 256); assert.ok(waveform.some(n => n > .01));
    const muted = { ...timeline, tracks: timeline.tracks.map(t => ({ ...t, muted: t.kind === "video" })) };
    const black = path.join(dir, "black.png"); await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(muted, files, black, { frame: 30 }));
    assert.ok([...(await pixel(black, 0))].every(n => n < 5));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("every exported frame at a cut matches the timeline, including one-frame clips and partial ranges", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-cuts-"));
  try {
    const files = new Map();
    for (const color of ["red", "blue"]) {
      const filePath = path.join(dir, `${color}.mp4`);
      await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=${color}:s=160x90:r=30:d=4`, "-c:v", "libx264", "-pix_fmt", "yuv420p", filePath]);
      files.set(color, { filePath });
    }
    for (const fps of [24, 25, 30, 60]) {
      const timeline = { ...createEditorTimeline(), fps, width: 160, height: 90,
        assets: ["red", "blue"].map(id => ({ id, type: "video", url: `/uploads/${id}.mp4`, duration: 4, hasAudio: false })), clips: [] };
      let start = 0;
      for (const [index, duration] of [1, 2, 7, 13, 1, 17, 19, 12].entries()) {
        timeline.clips.push({ id: `cut-${index}`, assetId: index % 2 ? "blue" : "red", trackId: "v1", start, sourceIn: index * 3, duration, volume: 1 });
        start += duration;
      }
      for (const [inFrame, outFrame] of [[0, start], [7, 65]]) {
        const output = path.join(dir, `cut-${fps}-${inFrame}.mp4`);
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs({ ...timeline, inFrame, outFrame }, files, output));
        const { stdout: pixels } = await exec(ffmpeg, ["-v", "error", "-i", output, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" });
        assert.equal(pixels.length / 3, outFrame - inFrame);
        for (let frame = inFrame; frame < outFrame; frame++) {
          const expected = timeline.clips.find(c => c.start <= frame && c.start + c.duration > frame).assetId;
          const pixel = pixels.subarray((frame - inFrame) * 3, (frame - inFrame + 1) * 3);
          assert.ok(expected === "red" ? pixel[0] > 200 && pixel[2] < 40 : pixel[2] > 200 && pixel[0] < 40,
            `${fps}fps, In ${inFrame}, frame ${frame}: expected ${expected}, got ${[...pixel]}`);
        }
      }
    }
    const layered = { ...createEditorTimeline(), width: 160, height: 90, inFrame: 0, outFrame: 21, clips: [
      { id: "lower-a", assetId: "red", trackId: "v1", start: 0, sourceIn: 0, duration: 7 },
      { id: "lower-b", assetId: "red", trackId: "v1", start: 10, sourceIn: 7, duration: 11 },
      { id: "upper-a", assetId: "blue", trackId: "v2", start: 1, sourceIn: 3, duration: 2 },
      { id: "upper-b", assetId: "blue", trackId: "v2", start: 8, sourceIn: 9, duration: 1 },
      { id: "upper-c", assetId: "blue", trackId: "v2", start: 13, sourceIn: 17, duration: 3 }
    ] };
    const output = path.join(dir, "layers.mp4");
    await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(layered, files, output));
    const { stdout: pixels } = await exec(ffmpeg, ["-v", "error", "-i", output, "-vf", "scale=1:1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer" });
    assert.equal(pixels.length / 3, 21);
    for (let frame = 0; frame < 21; frame++) {
      const visible = layered.clips.filter(c => c.start <= frame && c.start + c.duration > frame).sort((a, b) => b.trackId.localeCompare(a.trackId))[0];
      const pixel = pixels.subarray(frame * 3, frame * 3 + 3);
      assert.ok(!visible ? [...pixel].every(n => n < 5) : visible.assetId === "red" ? pixel[0] > 200 && pixel[2] < 40 : pixel[2] > 200 && pixel[0] < 40, `layer/gap frame ${frame}: ${[...pixel]}`);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("razor cuts do not change source frame sampling or duplicate moving frames", { timeout: 90000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-motion-cuts-"));
  try {
    for (const [sourceFps, fps] of [[30, 24], ["30000/1001", 24], [24, 60]]) {
      const source = path.join(dir, `motion-${fps}.mp4`);
      await exec(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=160x90:r=${sourceFps}:d=3`, "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
      const metadata = await probeEditorMedia(source, ffprobe.path);
      let timeline = editorImportMedia({ ...createEditorTimeline(), fps }, { ...metadata, url: "/uploads/motion.mp4", label: "Motion" }, "motion");
      timeline = { ...timeline, inFrame: 7, outFrame: 65 };
      let split = timeline;
      for (const cut of [1, 2, 8, 13, 25, 39, 53, 64, 65]) split = editorSplit(split, cut, [], false);
      const files = new Map(timeline.assets.map(a => [a.id, { filePath: source }])), decoded = [];
      for (const [index, version] of [timeline, split].entries()) {
        const output = path.join(dir, `motion-${index}.mp4`);
        await executeEditorFfmpeg(ffmpeg, buildEditorRenderArgs(version, files, output));
        decoded.push((await exec(ffmpeg, ["-v", "error", "-i", output, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"], { encoding: "buffer", maxBuffer: 8 * 1024 * 1024 })).stdout);
      }
      assert.equal(decoded[0].length, 58 * 160 * 90 * 3);
      assert.equal(decoded[1].length, decoded[0].length);
      for (let frame = 0; frame < 58; frame++) {
        const size = 160 * 90 * 3; let difference = 0;
        for (let i = frame * size; i < (frame + 1) * size; i++) difference += Math.abs(decoded[0][i] - decoded[1][i]);
        assert.ok(difference / size < 1, `${sourceFps} -> ${fps}fps, frame ${frame + 7}: split changed pixels by ${difference / size}`);
      }
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
