import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
async function source(path) { return readFile(new URL(path, root), "utf8"); }

test("personal action routes use fixed backend domain filters and shared controlled form", async () => {
  const [administration, household, form] = await Promise.all([source("app/administratie/page.tsx"), source("app/huis-gezin/page.tsx"), source("app/personal/action-domain-page.tsx")]);
  assert.match(administration, /api\/actions\?domain=administratie/);
  assert.match(household, /api\/actions\?domain=huis_gezin/);
  assert.match(form, /method: editing \? "PATCH" : "POST"/);
  assert.match(form, /due_date: values\.due_date \|\| null/);
  assert.match(form, /value=\{values\.title\}/);
  assert.match(form, /role="alert"/);
  assert.match(form, /Nog geen acties/);
  assert.match(form, /← Terug naar Vandaag/);
  assert.match(form, /sm:grid-cols-2/);
});

test("routine route supports schedule edit completion reopen empty and validation state", async () => {
  const [route, page] = await Promise.all([source("app/routines/page.tsx"), source("app/routines/routine-page.tsx")]);
  assert.match(route, /http:\/\/backend:8000\/api\/routines/);
  assert.match(page, /\/api\/routines\/\$\{routine\.id\}\/completions/);
  assert.match(page, /"uncomplete" : "complete"/);
  assert.match(page, /Planning/);
  assert.match(page, /Actief/);
  assert.match(page, /Nog geen routines/);
  assert.match(page, /role="alert"/);
  assert.match(page, /value=\{values\.title\}/);
  assert.match(page, /← Terug naar Vandaag/);
});

test("health route only uses manual weight and activity APIs with edit and empty states", async () => {
  const [route, page] = await Promise.all([source("app/gezondheid/page.tsx"), source("app/gezondheid/health-page.tsx")]);
  assert.match(route, /api\/health\/weights/);
  assert.match(route, /api\/health\/activities/);
  assert.match(page, /\/api\/health\/weights\/\$\{weightEdit\.id\}/);
  assert.match(page, /\/api\/health\/activities\/\$\{activityEdit\.id\}/);
  assert.match(page, /duration_seconds: durationSeconds/);
  assert.match(page, /source: "manual"/);
  assert.match(page, /Nog geen gewichtsmetingen/);
  assert.match(page, /Nog geen activiteiten/);
  assert.match(page, /role="alert"/);
  assert.match(page, /datetime-local/);
});

test("Today directs personal records to domain pages", async () => {
  const page = await source("app/page.tsx");
  for (const path of ["/administratie", "/huis-gezin", "/routines", "/gezondheid"]) assert.match(page, new RegExp(`return "${path}"`));
});
