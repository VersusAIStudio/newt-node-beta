export const openAiImage25Models = Object.freeze({
  sunburst: "OpenAI Image 2.5 Sunburst",
  flare: "OpenAI Image 2.5 Flare"
});
export const openAiImage25QualityOptions = ["low", "medium", "high", "xhigh", "max"];
// Krea's published OpenAPI schema, verified 2026-09-18.
export const openAiImage25KreaAspectRatios = ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"];
export const openAiImage25KreaResolutionOptions = ["1K", "2K", "4K"];
export const openAiImage25BackgroundOptions = ["auto", "opaque", "transparent"];

export function openAiImage25Variant(model) {
  const value = String(model || "").toLowerCase();
  if (!/(?:image[ -]2\.5)/.test(value)) return "";
  return value.includes("sunburst") ? "sunburst" : value.includes("flare") ? "flare" : "";
}

export function isOpenAiImage25Model(model) { return Boolean(openAiImage25Variant(model)); }
export function normalizeOpenAiImage25Quality(value) {
  const quality = String(value || "").toLowerCase();
  return openAiImage25QualityOptions.includes(quality) ? quality : "high";
}
export function normalizeOpenAiImage25Background(value) {
  return openAiImage25BackgroundOptions.includes(value) ? value : "auto";
}

export function openAiImage25KreaSelection(data = {}) {
  const [width, height] = String(data.aspectRatio || "16:9").split(":").map(Number);
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9;
  const distance = value => { const [w, h] = value.split(":").map(Number); return Math.abs(Math.log(ratio / (w / h))); };
  const aspectRatio = data.aspectRatio === "Auto" ? "Auto" : openAiImage25KreaAspectRatios.includes(data.aspectRatio)
    ? data.aspectRatio : openAiImage25KreaAspectRatios.reduce((best, value) => distance(value) < distance(best) ? value : best);
  const resolution = String(data.resolution || "2K").toUpperCase();
  return { resolution: openAiImage25KreaResolutionOptions.includes(resolution) ? resolution : "2K", aspectRatio, quality: normalizeOpenAiImage25Quality(data.quality),
    background: openAiImage25Variant(data.model) === "sunburst" ? "auto" : normalizeOpenAiImage25Background(data.background) };
}

export function validateOpenAiImage25KreaRequest({ model, resolution, aspectRatio, referenceCount = 0, background, editMaskDataUrl } = {}) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!openAiImage25KreaResolutionOptions.includes(String(resolution || "2K").toUpperCase()) || !openAiImage25KreaAspectRatios.includes(aspectRatio))
    fail(`Krea GPT Image 2.5 supports 1K, 2K or 4K in ${openAiImage25KreaAspectRatios.join(", ")}. Choose a supported format or enable Fal for other ratios.`);
  if (referenceCount > 10) fail("Krea GPT Image 2.5 accepts up to 10 reference images. Remove extra references before running.");
  if (editMaskDataUrl) fail("Krea GPT Image 2.5 does not currently accept edit masks. Enable Fal for a masked edit.");
  if (openAiImage25Variant(model) === "sunburst" && background && background !== "auto")
    fail("Krea Sunburst does not currently offer a background setting. Use Auto or enable Fal.");
}

export function buildOpenAiImage25FalRequest({ model, prompt, size, quality, imageUrls = [], maskUrl, background } = {}) {
  const variant = openAiImage25Variant(model);
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!variant) fail("Choose GPT Image 2.5 Sunburst or Flare.");
  if (String(prompt || "").trim().length < 2 || String(prompt).length > 32000) fail("GPT Image 2.5 needs a prompt between 2 and 32,000 characters.");
  if (imageUrls.length > 16) fail("Fal GPT Image 2.5 accepts up to 16 reference images. Remove extra references before running.");
  if (maskUrl && !imageUrls.length) fail("An edit mask needs a reference image.");
  const [width, height] = String(size || "").split("x").map(Number);
  if (![width, height].every((v) => Number.isInteger(v) && v > 0 && v <= 3840 && v % 16 === 0)
    || Math.max(width / height, height / width) > 3 || width * height < 655360 || width * height > 8294400)
    fail("GPT Image 2.5 requires valid image dimensions up to 4K.");
  return {
    endpoint: `openai/gpt-image-2.5/${variant}/${imageUrls.length ? "edit" : "text-to-image"}`,
    input: { prompt, image_size: { width, height }, quality: normalizeOpenAiImage25Quality(quality),
      background: normalizeOpenAiImage25Background(background), num_images: 1, output_format: "png", sync_mode: false,
      ...(imageUrls.length ? { image_urls: imageUrls } : {}), ...(maskUrl ? { mask_url: maskUrl } : {}) }
  };
}

export function openAiImage25Cost({ model, provider, endpoint, resolution, size, quality } = {}) {
  // Equal token rates do not imply GPT Image 2's per-image estimates apply to 2.5.
  return { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", model,
    provider, endpoint, resolution, size, quality,
    pricingBasis: "Variable token-based cost; GPT Image 2.5 per-image estimate is not yet verified.",
    pricingSource: "gpt-image-2.5-provider-docs-2026-09-08" };
}
