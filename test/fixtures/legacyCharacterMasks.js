// Retired layouts, retained only to reproduce old mask encoding/output failures.
export function characterWardrobeMaskRegions(sheetKind = "image") {
  return sheetKind === "video" ? [
    { x: 0, y: 0, width: 0.5, height: 1 },
    { x: 0.5, y: 0.78, width: 0.5, height: 0.22 }
  ] : [
    { x: 0, y: 0.14, width: 0.47, height: 0.86 },
    { x: 0.47, y: 0.39, width: 0.53, height: 0.11 },
    { x: 0.47, y: 0.89, width: 0.53, height: 0.11 }
  ];
}

export function paintCharacterWardrobeMask(context, width, height, sheetKind = "image") {
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  for (const region of characterWardrobeMaskRegions(sheetKind)) {
    context.clearRect(Math.round(region.x * width), Math.round(region.y * height),
      Math.ceil(region.width * width), Math.ceil(region.height * height));
  }
}
