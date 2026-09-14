import { systemApi } from "./api/newtApi.js";

export async function chooseEditorExportPath({ title = "Editor", workflowContext = {} } = {}, selectSavePath = systemApi.selectSavePath) {
  const name = String(title).replace(/\.mp4$/i, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim().slice(0, 100) || "Editor";
  const { response, data } = await selectSavePath({
    title: "Name and save the edited sequence",
    defaultPath: workflowContext.workflowPackagePath || "",
    defaultName: `${name}.mp4`,
    extension: "mp4"
  });
  if (data?.canceled) return null;
  if (!response.ok) throw new Error(data?.error || "Could not choose where to save the export.");
  return data?.path || null;
}
