import express from "express";
import cors from "cors";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { registerEditorRoutes } from "../server/routes/editor.js";

// Isolated local-media QA only. No settings, projects, keys or provider routes.
const dir = await mkdtemp(path.join(tmpdir(), "newtnode-editor-qa-")), exec = promisify(execFile);
await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=24:d=6", "-f", "lavfi", "-i", "sine=frequency=440:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(dir, "scene-a.mp4")]);
await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=24:d=4", "-vf", "hue=h=120", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(dir, "scene-b.mp4")]);
await exec(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=220:duration=10", path.join(dir, "ambience.wav")]);
const app = express(); app.use(cors()); app.use(express.json({ limit: "8mb" }));
app.post("/api/editor-qa/save-path", (req, res) => {
  const name = path.basename(String(req.body.fileName || "QA sequence.mp4"));
  if (!/\.mp4$/i.test(name)) return res.status(400).json({ error: "Use an MP4 filename." });
  res.json({ path: path.join(dir, name) });
});
app.use("/uploads/editor-qa", express.static(dir)); app.use("/outputs/editor-qa", express.static(dir));
registerEditorRoutes(app, {
  ffmpegPath: ffmpeg, ffprobePath: ffprobe.path,
  resolveAsset: async url => {
    if (!/^\/(uploads|outputs)\/editor-qa\/[^/]+$/.test(url)) throw new Error("QA files only.");
    return { filePath: path.join(dir, path.basename(url)) };
  },
  createTarget: async (_req, kind, extension) => {
    const fileName = `${kind}-${randomUUID()}${extension}`;
    return { filePath: path.join(dir, fileName), publicPath: `/outputs/editor-qa/${fileName}`, fileName };
  },
  recordHistory: async () => {}
});
const server = app.listen(Number(process.env.EDITOR_QA_PORT || 3349), "127.0.0.1", () => console.log("Editor QA API ready on 3349"));
async function close() { server.close(); await rm(dir, { recursive: true, force: true }); process.exit(0); }
process.on("SIGTERM", close); process.on("SIGINT", close);
