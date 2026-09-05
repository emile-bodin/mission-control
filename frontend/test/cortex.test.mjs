import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Cortex shell reads its factual aggregate through backend Compose DNS", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /getJson<CortexToday \| null>\("\/api\/cortex\/today", null\)/);
  assert.match(page, /briefing\?\.summary/);
  assert.match(page, /streamDock\?\.reason/);
  assert.doesNotMatch(page, /"\/api\/status-cards"/);
});
