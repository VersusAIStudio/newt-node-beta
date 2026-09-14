import { normalizeOutputDrawerWidth } from "./nodeGeometry.js";

const lastPackageParentKey = "newtnode-last-package-parent";
const lastOpenWorkflowKey = "newtnode-last-open-workflow";
const canvasSnapToGridKey = "newtnode-canvas-snap-to-grid";
const outputDrawerWidthKey = "newtnode-output-drawer-width";

export function savedOutputDrawerWidth() {
  return normalizeOutputDrawerWidth(readPreference(outputDrawerWidthKey));
}

export function rememberOutputDrawerWidth(width) {
  writePreference(outputDrawerWidthKey, String(normalizeOutputDrawerWidth(width)));
}

export function canvasSnapToGridEnabled() {
  return readPreference(canvasSnapToGridKey) === "true";
}

export function rememberCanvasSnapToGrid(enabled) {
  writePreference(canvasSnapToGridKey, enabled === true ? "true" : "false");
}

export function lastPackageParentPath() {
  return readPreference(lastPackageParentKey);
}

export function rememberPackageParentPath(path) {
  writePreference(lastPackageParentKey, path);
}

export function workflowPickerDefaultPath(projectPackagePath = "") {
  return projectPackagePath || readPreference(lastOpenWorkflowKey) || readPreference(lastPackageParentKey) || "";
}

export function rememberOpenedWorkflowPath(workflow = {}) {
  const packagePath = workflow.packagePath || workflow.package?.rootPath || "";
  writePreference(lastOpenWorkflowKey, packagePath || workflow.filePath || workflow.fileName || "");
}

function readPreference(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writePreference(key, value) {
  try {
    window.localStorage.setItem(key, value || "");
  } catch {
    // Dialog history should never block workflow operations.
  }
}
