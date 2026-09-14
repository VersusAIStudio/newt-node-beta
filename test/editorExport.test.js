import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, symlink, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chooseEditorExportPath } from "../src/editorExport.js";
import { normalizeEditorExportPath, prepareEditorExport, saveEditorExport } from "../server/editor-export.js";

test("Editor opens the native MP4 save picker with a sanitized name and workflow directory", async () => {
  const expectedPath = path.join(os.tmpdir(), "My Cut.mp4");
  const chosen = await chooseEditorExportPath({ title: "First / Cut", workflowContext: { workflowPackagePath: "/project" } }, async request => {
    assert.deepEqual(request, { title: "Name and save the edited sequence", defaultName: "First _ Cut.mp4", defaultPath: "/project", extension: "mp4" });
    return { response: { ok: true }, data: { path: expectedPath } };
  });
  assert.equal(chosen, expectedPath);
  assert.equal(await chooseEditorExportPath({}, async () => ({ response: { ok: false }, data: { canceled: true } })), null);
  assert.equal(await chooseEditorExportPath({}, async () => ({ response: { ok: true }, data: { path: "" } })), null);
  await assert.rejects(chooseEditorExportPath({}, async () => ({ response: { ok: false }, data: { error: "Picker unavailable" } })), /Picker unavailable/);
});

test("export destinations accept MP4 names but reject relative and other file types", () => {
  const base = path.join(os.tmpdir(), "My cut");
  assert.equal(normalizeEditorExportPath(base), `${base}.mp4`);
  assert.equal(normalizeEditorExportPath(`${base}.MP4`), `${base}.MP4`);
  for (const invalid of [null, "", "../file.mp4", `${base}.txt`, `${base}\n.mp4`]) assert.throws(() => normalizeEditorExportPath(invalid));
});

test("chosen exports are atomic, preserve managed media, and protect sources and changed destinations", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "editor-save-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source.mp4"), rendered = path.join(dir, "managed.mp4"), chosen = path.join(dir, "My cut.mp4");
  await writeFile(source, "original source"); await writeFile(rendered, "rendered bytes");
  await assert.rejects(prepareEditorExport(source, [{ filePath: source }]), /must not replace a timeline source/);
  const destination = await prepareEditorExport(chosen, [{ filePath: source }]);
  await saveEditorExport(rendered, destination);
  assert.equal(await readFile(chosen, "utf8"), "rendered bytes");
  assert.equal(await readFile(source, "utf8"), "original source");
  assert.equal(await readFile(rendered, "utf8"), "rendered bytes");
  const before = await prepareEditorExport(chosen, []);
  await writeFile(chosen, "a newly changed destination");
  await assert.rejects(saveEditorExport(rendered, before), /destination changed/);
  assert.equal(await readFile(chosen, "utf8"), "a newly changed destination");
  const approved = await prepareEditorExport(chosen, []);
  await saveEditorExport(rendered, approved);
  assert.equal(await readFile(chosen, "utf8"), "rendered bytes");
  const abort = new AbortController(); abort.abort();
  await assert.rejects(saveEditorExport(rendered, await prepareEditorExport(chosen, []), { signal: abort.signal }));
  assert.equal(await readFile(chosen, "utf8"), "rendered bytes");
  assert.equal((await readdir(dir)).some(name => name.endsWith(".tmp")), false);
  if (process.platform !== "win32") {
    const link = path.join(dir, "link.mp4"); await symlink(source, link);
    await assert.rejects(prepareEditorExport(link, []), /symbolic link/);
  }
});
