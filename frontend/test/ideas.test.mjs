import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Second Brain uses bounded browser API and no invented AI workflow", async () => {
  const source = await readFile(new URL("../app/ideas-client.tsx", import.meta.url), "utf8");
  assert.match(source, /\/api\/browser\/stream-entries/);
  assert.match(source, /\/api\/browser-sessions\/pair/);
  assert.match(source, /\/api\/browser-sessions\/current/);
  assert.match(source, /\/api\/stream-entries/);
  assert.doesNotMatch(source, /embedding|vector search|RAG|semantic score|AI classification/i);
});
