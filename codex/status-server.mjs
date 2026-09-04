import http from "node:http";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const port = Number(process.env.PORT ?? 8080);
const timeoutMs = Number(process.env.CODEX_AUTH_TIMEOUT_MS ?? 5000);
const runTimeoutMs = Number(process.env.CODEX_RUN_TIMEOUT_MS ?? 120000);
const runtimeToken = process.env.CODEX_RUNTIME_TOKEN ?? "";
let runActive = false;

function authState() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (state) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(state);
    };
    const child = spawn("codex", ["login", "status"], { stdio: "ignore" });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish("timeout");
    }, timeoutMs);

    child.once("error", () => finish("failed"));
    child.once("exit", (code) => finish(code === 0 ? "auth-ready" : "failed"));
  });
}

async function probe() {
  const auth = await authState();
  return { auth, ready: auth === "auth-ready" };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) request.destroy();
    });
    request.once("end", () => {
      try { resolve(JSON.parse(body)); } catch { reject(new Error("invalid json")); }
    });
    request.once("error", reject);
  });
}

function authorized(request) {
  return runtimeToken.length > 0
    && request.headers.authorization === `Bearer ${runtimeToken}`;
}

async function run(prompt) {
  const outputPath = `/tmp/codex-output-${randomUUID()}`;
  try {
    const result = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const child = spawn("codex", [
        "exec", "--ephemeral", "--skip-git-repo-check",
        "--output-last-message", outputPath, prompt,
      ], { stdio: "ignore" });
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        finish({ state: "timeout" });
      }, runTimeoutMs);
      child.once("error", () => finish({ state: "failed" }));
      child.once("exit", (code) => finish({ state: code === 0 ? "completed" : "failed" }));
    });
    if (result.state !== "completed") return result;
    return { state: "completed", output: await readFile(outputPath, "utf8") };
  } finally {
    await rm(outputPath, { force: true });
  }
}

if (process.argv.includes("--check")) {
  const result = await probe();
  process.exit(result.ready ? 0 : 1);
}

http.createServer(async (request, response) => {
  if (request.url === "/run" && request.method === "POST") {
    if (!authorized(request)) {
      response.writeHead(401).end();
      return;
    }
    if (runActive) {
      response.writeHead(409).end();
      return;
    }
    try {
      const body = await readJson(request);
      if (typeof body.prompt !== "string" || !body.prompt.trim()) {
        response.writeHead(422).end();
        return;
      }
      const status = await probe();
      if (!status.ready) {
        response.writeHead(503, { "content-type": "application/json" })
          .end(JSON.stringify({ status: status.auth }));
        return;
      }
      runActive = true;
      const result = await run(body.prompt);
      const code = result.state === "completed" ? 200 : result.state === "timeout" ? 504 : 502;
      response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" })
        .end(JSON.stringify(result));
    } catch {
      response.writeHead(422).end();
    } finally {
      runActive = false;
    }
    return;
  }
  if (request.url !== "/health" && request.url !== "/status") {
    response.writeHead(404).end();
    return;
  }

  const result = await probe();
  const code = request.url === "/health" && !result.ready ? 503 : 200;
  response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ service: "running", auth: result.auth }));
}).listen(port);
