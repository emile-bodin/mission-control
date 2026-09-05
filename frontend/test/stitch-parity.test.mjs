import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = new URL("../app/", import.meta.url);

async function source(path) {
  return readFile(new URL(path, app), "utf8");
}

test("Cortex keeps Stitch zones bound to factual sources", async () => {
  const page = await source("page.tsx");
  assert.match(page, /Autonome directives/);
  assert.match(page, /Workspace en clustercontext/);
  assert.match(page, /Chronologische agenda/);
  assert.match(page, /Stream Dock & Inname/);
  assert.match(page, /href="\/ideas"/);
  assert.match(page, /Geen stappenbron/);
  assert.match(page, /Geen herstel- of slaapbron/);
  assert.doesNotMatch(page, /Claude 3\.7|tokens\s*\/\s*sec|GPU:\s*\d/i);
});

test("Homelab preserves telemetry panels as unavailable without fake values", async () => {
  const page = await source("homelab/page.tsx");
  for (const label of ["Global system health", "Compute system inference and storage summary", "Infrastructure nodes", "Network / throughput telemetry", "Local LLM velocity", "Storage / drive health matrix", "Mission-critical self-hosted services"]) assert.match(page, new RegExp(label));
  assert.match(page, /Unavailable by source/);
  assert.match(page, /\/api\/homelab/);
  assert.match(page, /\/api\/assets/);
  assert.doesNotMatch(page, /ALL SYSTEMS NOMINAL|RTX 4090|38\.4\s*\/\s*64/);
});

test("Second Brain keeps paired stream entry flows and marks knowledge processing unavailable", async () => {
  const page = await source("ideas-client.tsx");
  assert.match(page, /Capture dock/);
  assert.match(page, /Raw ingestion stream/);
  assert.match(page, /Knowledge processing unavailable/);
  assert.match(page, /\/api\/browser-sessions\/pair/);
  assert.match(page, /\/api\/stream-entries\/\$\{entry\.id\}\/triage/);
  assert.match(page, /Unavailable by source/);
});

test("Briefings and projects preserve review and unavailable-source boundaries", async () => {
  const [briefings, projects] = await Promise.all([source("briefings/page.tsx"), source("projects/page.tsx")]);
  assert.match(briefings, /DIRECTIVE CONTEXT/);
  assert.match(briefings, /requires confirmation|vereisen bevestiging/i);
  assert.match(projects, /Linear issue tracker/);
  assert.match(projects, /Activity stream/);
  assert.match(projects, /Repository state/);
  assert.match(projects, /HYD-160/);
  assert.doesNotMatch(projects, /COR-\d+|github\.com\//);
});
