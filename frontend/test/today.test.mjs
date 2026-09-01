import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }

test("Today page renders the API contract and personal hierarchy", async () => {
  const page = await source("app/page.tsx");
  const representativeToday = {
    generated_at: "2026-03-29T08:00:00Z", timezone: "Europe/Amsterdam", local_date: "2026-03-29",
    sources: { actions: { status: "available", item_count: 1, error: null } },
    sections: { overdue: { items: [{ kind: "action", domain: "administratie" }] }, today: { items: [{ kind: "calendar_event" }] }, routines: { items: [{ kind: "routine" }] }, upcoming: { items: [] }, context: { items: [{ kind: "health_weight", source: "health" }, { kind: "project", source: "projects" }] } }
  };
  assert.equal(representativeToday.timezone, "Europe/Amsterdam");
  assert.match(page, /fetch\("http:\/\/backend:8000\/api\/today", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(page, /api\/(projects|actions|status-cards|homelab|calendar\/schedule|codex-runs)/);
  for (const heading of ["Briefing", "Agenda en focus", "Routines", "Administratie", "Huis en gezin", "Gezondheid", "Werk en projectsignalen"]) assert.match(page, new RegExp(`title="${heading}"`));
  assert.match(page, /<h1/); assert.match(page, /<h2/); assert.match(page, /<h3/);
});

test("Today distinguishes source empty, configuration, failure, partial, and stale", async () => {
  const page = await source("app/page.tsx");
  const sourceStates = ["empty", "not_configured", "unavailable", "error", "partial", "stale"];
  for (const status of sourceStates) assert.match(page, new RegExp(`status === "${status}"`));
  assert.match(page, /Bron reageerde, zonder resultaten/);
  assert.match(page, /Bron is niet ingesteld; dit is geen lege uitkomst/);
  assert.match(page, /Bron leverde verouderde data/);
  assert.match(page, /Bron is tijdelijk niet bereikbaar/);
  assert.match(page, /stale: "border-cyan-400\/35 bg-cyan-400\/10 text-cyan-200"/);
  assert.match(page, /Actualiteit volgt bronstatussen; geen lokale stale-beoordeling/);
  assert.match(page, /formatDateTime\(today.generated_at, today.timezone\)/);
  assert.doesNotMatch(page, /Date\.now\(|setTimeout|setInterval/);
});

test("Today uses semantic links and responsive keyboard-focusable controls", async () => {
  const page = await source("app/page.tsx");
  assert.match(page, /`\/actions\/\$\{item.id\}`/); assert.match(page, /`\/status-cards\/\$\{item.id\}`/); assert.match(page, /`\/projects\/\$\{item.id\}`/); assert.match(page, /return "\/homelab"/);
  assert.match(page, /focus-visible:ring-2/); assert.match(page, /lg:grid-cols/); assert.doesNotMatch(page, /onClick=/);
});
