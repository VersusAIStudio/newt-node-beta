import test from "node:test";
import assert from "node:assert/strict";
import { estimateAtlasVideoCost, atlasSeedanceEstimateEndpoints, atlasSeedanceEstimateRates,
  ATLAS_PRICING_URL } from "../src/atlasPricing.js";
import { parseAtlasPricing } from "../server/atlas-pricing.js";

function fixture(endpoint = atlasSeedanceEstimateEndpoints[0]) {
  const lines = endpoint.endsWith("/reference-to-video") ? [
    "Per-second rates assume no reference-video input and derive from $17.3875 per 1M video tokens.",
    "Requests with reference videos bill every token \u2014 output plus reference video \u2014 at $10.4 per 1M video tokens; use View for an exact quote."
  ] : ["The displayed rate is an estimate derived from video tokens."];
  return { id: endpoint, display: true, type: "video", currency: "USD", billing_category: "video_token_postpaid", billing_mode: "token_postpaid",
    pricing_mode: endpoint.endsWith("/reference-to-video") ? "runtime_estimate" : "per_second",
    requires_runtime_quote: true, price_version: `sha256:${"a".repeat(64)}`, pricing_params: ["duration", "resolution"],
    billing_explanation: { lines: [...lines, "The final charge uses actual completion tokens after the task finishes."] }, price_count: 3,
    price_rows: Object.entries(atlasSeedanceEstimateRates).map(([resolution, amount]) => ({ row_id: resolution,
      billing_unit: "/s (estimated)", official_price: String(amount), our_price: "0.001", account_price: "0.0001", estimated: true,
      requires_quote: true, quote_defaults: { duration: 5, resolution } })) };
}
const parse = model => parseAtlasPricing({ code: 200, data: [model] }).find(row => row.id === `atlas:${model.id}`);

test("Atlas Seedance estimates cover supported durations and native tiers, but never claim fixed final billing", () => {
  for (const routeKind of ["text-to-video", "image-to-video", "reference-to-video"]) for (const duration of [4, 8, 15, 29, 30]) {
    const price = estimateAtlasVideoCost({ model: "Seedance 2.5", resolution: "720p", duration, routeKind,
      referenceImageCount: routeKind === "reference-to-video" ? 9 : 0, startFrameCount: routeKind === "image-to-video" ? 1 : 0 });
    assert.equal(price.amountUsd, Math.round(0.37557 * duration * 1e6) / 1e6);
    assert.equal(price.estimated, true); assert.equal(price.billingMode, "token_postpaid");
    assert.match(price.pricingBasis, /not a guaranteed quote/); assert.equal(price.pricingSource, ATLAS_PRICING_URL);
  }
});

test("unknown reference-video billing, unverified tiers, invalid durations and ambiguous counts remain unpriced", () => {
  const base = { model: "Seedance 2.5", resolution: "720p", duration: "4 seconds" };
  for (const patch of [{ duration: "auto" }, { duration: 0 }, { duration: 31 }, { duration: 4.5 }, { duration: "4garbage" },
    { resolution: "1920p" }, { resolution: "4k-esr" }, { hasVideoReference: true }, { hasVideoReference: "false" },
    { referenceVideoDuration: 5 }, { video_urls: ["clip"] }, { referenceImageCount: 31 }, { referenceImageCount: "1" },
    { startFrameCount: 2 }, { startFrameCount: 1, routeKind: "text-to-video" }, { prompt_expansion: true }]) {
    assert.equal(estimateAtlasVideoCost({ ...base, ...patch }).amountUsd, null, JSON.stringify(patch));
  }
});

test("weekly parser accepts published token estimates as estimates and ignores promotional/account columns", () => {
  for (const endpoint of atlasSeedanceEstimateEndpoints) {
    const parsed = parse(fixture(endpoint)); assert.ok(parsed.entry, parsed.issue);
    assert.equal(parsed.entry.priceKind, "standard-estimate"); assert.equal(parsed.entry.points.length, 81);
    const snapshot = { version: 1, revision: "test-atlas-estimates", entries: { [`atlas:${endpoint}`]: { ...parsed.entry, checkedAt: "2026-09-11" } } };
    const price = estimateAtlasVideoCost({ model: endpoint, resolution: "720p", duration: 4, snapshot });
    assert.equal(price.amountUsd, 1.50228); assert.equal(price.pricingVersion, snapshot.revision);
  }
});

test("changed rules, currency, estimate semantics and unusual prices require review", () => {
  for (const change of [m => m.billing_mode = "fixed", m => m.pricing_mode = "fixed", m => m.display = "true", m => m.billing_explanation.lines.push("New surcharge"),
    m => m.currency = "EUR", m => m.pricing_params.push("audio"), m => m.price_rows[0].estimated = false,
    m => m.price_rows[0].billing_unit = "/request", m => m.price_rows[0].quote_defaults.duration = 10,
    m => m.price_rows[0].price_role = "addon", m => m.price_rows[0].official_price = "0",
    m => m.price_rows[0].official_price = "9", m => m.price_rows[0].official_price = "NaN",
    m => m.price_rows[0] = m.price_rows[1], m => m.price_count++]) {
    const model = fixture(); change(model); assert.ok(parse(model).issue); assert.equal(parse(model).entry, undefined);
  }
});

test("a verified refresh replaces only future estimates and incompatible catalog entries stay unknown", () => {
  const model = fixture(); model.price_rows.forEach(row => row.official_price = String(Number(row.official_price) * 1.1));
  const entry = parse(model).entry, key = `atlas:${model.id}`;
  const options = { model: model.id, resolution: "720p", duration: 4 };
  const before = estimateAtlasVideoCost(options);
  const snapshot = { version: 1, revision: "higher-rates", entries: { [key]: entry } };
  assert.equal(estimateAtlasVideoCost({ ...options, snapshot }).amountUsd, 1.652508); assert.equal(before.amountUsd, 1.50228);
  for (const patch of [{ priceKind: "account" }, { priceKind: "standard" }, { unit: "second" }, { source: "other" }, { rulesVersion: 2 }, { points: [] }]) {
    assert.equal(estimateAtlasVideoCost({ ...options, snapshot: { ...snapshot, entries: { [key]: { ...entry, ...patch } } } }).amountUsd, null);
  }
});
