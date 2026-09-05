import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Cortex coprocessor uses only backend-relative proposal API", async () => {
  const component = await readFile(new URL("app/cortex-coprocessor.tsx", root), "utf8");
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(component, /fetch\("\/api\/cortex\/coprocessor\/proposals"/);
  assert.doesNotMatch(component, /https?:\/\//);
  assert.match(page, /getJson<CoprocessorAvailability>\("\/api\/cortex\/coprocessor"/);
});

test("Cortex coprocessor displays proposal as advice without execute action", async () => {
  const component = await readFile(new URL("app/cortex-coprocessor.tsx", root), "utf8");
  assert.match(component, /VOORSTEL — GEEN ACTIE UITGEVOERD/);
  assert.doesNotMatch(component, /execute|\/accept|\/apply/i);
});
