import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("action form sends domain and safely defaults legacy actions to project", async () => {
  const form = await source("app/actions/action-form.tsx");
  assert.match(form, /domain: "administratie" \| "huis_gezin" \| "project"/);
  assert.match(form, /owner_id: string \| null/);
  assert.match(form, /<select name="domain" defaultValue=\{action\?\.domain \|\| "project"\}/);
  assert.match(form, /Administratie/);
  assert.match(form, /Huis \/ gezin/);
  assert.match(form, /Project/);
});

test("action list uses selected domain in backend filter", async () => {
  const page = await source("app/actions/page.tsx");
  assert.match(page, /searchParams\?: \{ domain\?: string \}/);
  assert.match(page, /api\/actions\$\{domain \? `\?domain=\$\{domain\}`/);
  assert.match(page, /<select name="domain" defaultValue=\{domain \?\? ""\}/);
  assert.match(page, /Alle domeinen/);
});
