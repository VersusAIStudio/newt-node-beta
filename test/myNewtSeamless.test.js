import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MyNewtService, myNewtRequestEstimate } from "../server/my-newt.js";
import { recordMyNewtInspection, currentMyNewtInspections } from "../server/my-newt-inspections.js";
import { myNewtSnapshot, myNewtSettings, myNewtDefaults, validateMyNewtPatch } from "../src/myNewt/contract.js";
import { reservedTotal } from "../server/my-newt-budget.js";
import { normalizeMyNewtPlan } from "../src/myNewt/plan.js";
import { estimateVideoRunCost } from "../src/generationPricing.js";

const owner = { projectId: "seamless-project", nodeId: "newt" };
const settings = { autoReview: true, allowExisting: true, allowVideos: true, allowImages: true, allowMediaInspection: true, budget: 150 };
const videoSettings = { model: "Seedance 2.5", duration: "4 seconds", resolution: "720p", aspectRatio: "16:9 (Landscape)", generateAudio: false, batchCount: 1 };
const graph = () => myNewtSnapshot({ ...owner, nodes: [{ id: "newt", type: "myNewt", data: {} },
  ...Array.from({ length: 9 }, (_, i) => [{ id: `source-${i}`, type: "image", data: { resultUrl: `/uploads/source-${i}.png` } },
    { id: `video-${i}`, type: "videoModel", data: { ...videoSettings, title: `Clip ${i + 1}`, prompt: "The patient waits." } }]).flat()],
  edges: Array.from({ length: 9 }, (_, i) => ({ from: { nodeId: `source-${i}`, port: "imageOut" }, to: { nodeId: `video-${i}`, port: "startFrameIn" } })) });
const plan = { summary: "Make nine clips", steps: [{ id: "generate", title: "Generate clips" }],
  deliverables: Array.from({ length: 9 }, (_, i) => ({ kind: "video", label: `Clip ${i + 1}`, nodeId: `video-${i}`, count: 1,
    settings: { model: videoSettings.model, duration: videoSettings.duration, resolution: videoSettings.resolution, aspectRatio: videoSettings.aspectRatio }, referenceIds: [`source-${i}`] })),
  runs: [{ ...videoSettings, kind: "video", batchCount: 9 }] };
const answerPlan = { summary: "Inspect the images", steps: [{ id: "inspect", title: "Read the subjects" }], deliverables: [{ kind: "answer", label: "Findings", count: 1 }] };
const response = (operation, payload, observation = "") => ({ status: "completed", usage: { input_tokens: 100, output_tokens: 100 },
  output: [{ type: "function_call", name: "project_action", call_id: crypto.randomUUID(), arguments: JSON.stringify({ operation, payload: JSON.stringify(payload), reason: operation, observation }) }] });
const context = body => JSON.parse(body.input.findLast(item => item.content?.startsWith?.("Current project data")).content.split("\n").slice(1).join("\n"));
async function settle(service) {
  for (let i = 0; i < 500; i++) { if (!service.loops.size) return; await new Promise(resolve => setTimeout(resolve, 3)); }
  throw new Error("Newt did not settle");
}
async function fixture(t, options, overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newt-seamless-"));
  const service = new MyNewtService({ directory, getKey: () => "mock-key", provider: () => "atlas", ...options });
  await service.ready;
  t.after(async () => { await settle(service); await Promise.all([...service.queues.values()]); await rm(directory, { recursive: true, force: true }); });
  const started = await service.start({ ...owner, brief: "Generate nine clips from the existing images using the exact prompt", settings: { ...settings, ...overrides }, snapshot: graph() });
  await settle(service);
  return { service, job: service.jobs.get(started.id), directory };
}

test("the reported Atlas 720p task has a shared estimate from plan through request", () => {
  assert.equal(estimateVideoRunCost({ ...videoSettings, provider: "atlas" }), 1.50228);
  assert.equal(myNewtRequestEstimate("/api/node/generate-video", { ...videoSettings, startFrameUrl: "/uploads/source-0.png" }, "atlas"), 1.50228);
  assert.equal(normalizeMyNewtPlan(plan, "atlas").estimatedGenerationCost, 13.52052);
});

test("Auto Review runs a nine-clip Atlas workflow without approval clicks and recognizes a manual completion", async t => {
  const submissions = [], calls = [];
  const { service, job } = await fixture(t, {
    invoke: async body => {
      calls.push(body); assert.equal(body.tool_choice, "required");
      const state = context(body);
      if (!state.plan) return response("plan", plan);
      const next = state.deliverableProgress.find(item => !item.complete);
      return next ? response("run", { nodeId: next.nodeId, stepId: "generate" }) : response("finish", { message: "All nine clips are complete." });
    },
    relay: async (_route, body) => { submissions.push(body.nodeId); return { status: 200, data: { cost: { amountUsd: 1.50228, estimated: true } } }; }
  });
  const live = graph();
  // Simulate the user's manual clip completing while Newt is preparing another clip.
  live.nodes.find(node => node.id === "video-8").data = { ...videoSettings, title: "Clip 9", status: "complete", resultUrl: "/outputs/manual-clip.mp4" };
  await service.sync(job.id, { ...owner, snapshot: live });
  for (let i = 0; i < 8; i++) {
    assert.equal(job.status, "running"); assert.equal(job.plan.approved, true);
    const actionId = job.pending.id, nodeId = job.pending.payload.nodeId;
    const preview = { ...videoSettings, provider: "atlas", title: nodeId, count: 1, estimatedCost: 1.50228 };
    await service.prepare(job.id, { ...owner, actionId, preview });
    assert.ok(await service.claim(job.id, { ...owner, actionId, clientId: "editor" }));
    const request = { ...owner, actionId, clientId: "editor", sequence: 1, route: "/api/node/generate-video", body: { ...videoSettings, nodeId } };
    await service.request(job.id, request); await service.request(job.id, request);
    const target = live.nodes.find(node => node.id === nodeId);
    Object.assign(target.data, { status: "complete", resultUrl: `/outputs/${nodeId}.mp4` });
    await service.complete(job.id, { ...owner, actionId, clientId: "editor", result: { nodeId, status: "complete" }, snapshot: structuredClone(live) });
    await settle(service);
  }
  assert.equal(job.status, "complete"); assert.equal(submissions.length, 8); assert.equal(new Set(submissions).size, 8);
  assert.ok(!submissions.includes("video-8")); assert.equal(job.outputs.length, 9);
  assert.equal(calls.length, 10); assert.ok(!job.activity.some(item => /approval|Continuing/.test(item.text)));
});

test("unpriced media stops at preflight before any generation and explains that approval cannot bypass it", async t => {
  let submissions = 0;
  const { service, job } = await fixture(t, { invoke: async body => !context(body).plan ? response("plan", plan) : response("run", { nodeId: "video-0" }), relay: async () => { submissions++; } });
  const actionId = job.pending.id;
  await service.prepare(job.id, { ...owner, actionId, preview: { ...videoSettings, provider: "atlas", estimatedCost: null } });
  assert.equal(job.status, "waiting"); assert.equal(job.pending, null); assert.deepEqual(job.receipts, {});
  assert.match(job.message, /No generation was submitted/); assert.match(job.message, /another approval cannot override/);
  assert.equal(await service.claim(job.id, { ...owner, actionId, clientId: "editor" }), null);
  assert.equal(submissions, 0);
});

test("inspection findings survive later actions and repeated inspection reuses them without new media loading", async t => {
  const inspected = [], bodies = []; let version = "file-v1";
  const inspector = Object.assign(async url => {
    inspected.push(url); return { version, cost: 0, content: [{ type: "input_text", text: `Evidence of ${url}` }, { type: "input_image", image_url: "data:image/jpeg;base64,mock" }] };
  }, { version: async () => version });
  const { service, job, directory } = await fixture(t, { inspectAsset: inspector, invoke: async body => {
    bodies.push(body);
    switch (bodies.length) {
      case 1: return response("plan", answerPlan);
      case 2: return response("inspect", { url: "/uploads/source-0.png" });
      case 3: return response("inspect", { url: "/uploads/source-1.png" }, "One patient waiting alone. Use the solo prompt.");
      case 4: return response("inspect", { url: "/uploads/source-0.png" }, "Two people talking. Use the consultation prompt.");
      default: return response("finish", { message: "Subjects mapped." });
    }
  } });
  assert.equal(job.status, "complete"); assert.equal(inspected.length, 2);
  assert.equal(context(bodies[3]).inspections[0].summary, "One patient waiting alone. Use the solo prompt.");
  assert.equal(context(bodies[4]).inspections.length, 2);
  assert.equal(job.inspections.length, 2);
  assert.doesNotMatch(await readFile(path.join(directory, `${job.id}.json`), "utf8"), /data:image\/jpeg;base64,mock/);
  assert.equal((await currentMyNewtInspections(job, inspector)).length, 2);
  version = "file-v2"; assert.equal((await currentMyNewtInspections(job, inspector)).length, 0);
  const recovered = new MyNewtService({ directory, getKey: () => "mock", inspectAsset: inspector }); await recovered.ready;
  assert.equal(recovered.jobs.get(job.id).inspections.length, 2);
});

test("inspection storage rejects missing evidence, removed assets and empty findings and is bounded", async () => {
  const job = { snapshot: graph(), inspections: [] };
  for (const change of [{ url: "/outputs/not-in-project.png" }, { version: null }, { observation: "" }]) {
    recordMyNewtInspection(job, { url: "/uploads/source-0.png", version: "v1", observation: "Observed", ...change });
  }
  assert.equal(job.inspections.length, 0);
  for (let i = 0; i < 50; i++) recordMyNewtInspection(job, { url: "/uploads/source-0.png", version: "v1", question: String(i), observation: "x".repeat(2000) });
  assert.equal(job.inspections.length, 40); assert.equal(job.inspections[0].summary.length, 1800);
  job.snapshot.nodes = []; assert.deepEqual(await currentMyNewtInspections(job, { version: async () => "v1" }), []);
});

test("unpriced generation permission is opt-in, cannot be model-edited, and does not enable media or auto approvals", () => {
  assert.equal(myNewtDefaults.allowUnpricedGenerations, false);
  for (const value of [undefined, false, "true", 1]) assert.equal(myNewtSettings({ allowUnpricedGenerations: value }).allowUnpricedGenerations, false);
  const allowed = myNewtSettings({ allowUnpricedGenerations: true });
  assert.equal(allowed.allowUnpricedGenerations, true); assert.equal(allowed.autoReview, false);
  assert.equal(allowed.allowVideos, false); assert.equal(allowed.approveRuns, true);
  assert.throws(() => validateMyNewtPatch({ id: "newt", type: "myNewt" }, { allowUnpricedGenerations: true }, settings), /not Newt/);
});

async function unpricedFixture(t, overrides = {}, relay) {
  const f = await fixture(t, { invoke: async body => !context(body).plan ? response("plan", plan) : response("run", { nodeId: "video-0" }),
    relay: relay || (async () => ({ status: 200, data: { cost: { amountUsd: null } } })) }, { allowUnpricedGenerations: true, ...overrides });
  f.actionId = f.job.pending.id;
  await f.service.prepare(f.job.id, { ...owner, actionId: f.actionId, preview: { ...videoSettings, provider: "atlas", estimatedCost: null } });
  await f.service.claim(f.job.id, { ...owner, actionId: f.actionId, clientId: "editor" });
  f.request = (sequence = 1) => f.service.request(f.job.id, { ...owner, actionId: f.actionId, clientId: "editor", sequence,
    route: "/api/node/generate-video", body: { ...videoSettings, nodeId: "video-0", referenceVideoUrls: ["/uploads/context.mp4"] } });
  return f;
}

test("opted-in unknown costs proceed and stay unknown through duplicate requests and restart", async t => {
  let submissions = 0;
  const { service, job, directory, request } = await unpricedFixture(t, {}, async () => { submissions++; return { status: 200, data: { cost: { amountUsd: null } } }; });
  const before = job.spent;
  await request(); await request(); await request(2);
  assert.equal(submissions, 2); assert.equal(job.spent, before); assert.equal(reservedTotal(job), 0);
  assert.equal(service.public(job).unpricedCount, 2);
  for (const reserve of Object.values(job.reservations)) { assert.equal(reserve.amount, null); assert.equal(reserve.state, "unpriced"); }
  assert.equal(job.status, "running"); assert.deepEqual(job.uncertainNodes, []);
  const recovered = new MyNewtService({ directory, getKey: () => "mock" }); await recovered.ready;
  const restored = recovered.jobs.get(job.id);
  assert.equal(restored.status, "paused"); assert.equal(restored.settings.allowUnpricedGenerations, true);
  assert.equal(recovered.public(restored).unpricedCount, 2); assert.ok(Object.values(restored.reservations).every(item => item.state === "unpriced"));
});

test("reported cost for an initially unpriced run counts toward the budget", async t => {
  const f = await unpricedFixture(t, {}, async () => ({ status: 200, data: { cost: { amountUsd: 2.75 } } }));
  const before = f.job.spent; await f.request();
  assert.equal(f.job.spent - before, 2.75); assert.equal(f.service.public(f.job).unpricedCount, 0);
});

test("unpriced permission never bypasses paid-run approval, media permission, known budget, or uncertain submission", async t => {
  const disabled = await unpricedFixture(t, { allowVideos: false });
  await assert.rejects(disabled.request(), /Enable video generation/);
  const approval = await unpricedFixture(t, { autoReview: false, approvePlan: false });
  assert.equal(approval.job.status, "approval"); await assert.rejects(approval.request(), /no longer owns/);
  const budget = await unpricedFixture(t); budget.job.spent = budget.job.settings.budget;
  await assert.rejects(budget.request(), /Known task costs/);
  const revoked = await unpricedFixture(t);
  await revoked.service.control(revoked.job.id, { ...owner, action: "settings", settings: { ...revoked.job.settings, allowUnpricedGenerations: false } });
  await assert.rejects(revoked.request(), /New direction or permissions/);
  let submissions = 0;
  const interrupted = await unpricedFixture(t, {}, async () => { submissions++; throw new Error("Connection lost after submission"); });
  await assert.rejects(interrupted.request(), /Connection lost/);
  assert.equal(interrupted.job.status, "paused"); assert.deepEqual(interrupted.job.uncertainNodes, ["video-0"]);
  await assert.rejects(interrupted.request(), /already started/); assert.equal(submissions, 1);
});
