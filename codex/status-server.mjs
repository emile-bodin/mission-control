import http from "node:http";
import { spawn } from "node:child_process";

const port = Number(process.env.PORT ?? 8080);
const timeoutMs = Number(process.env.CODEX_AUTH_TIMEOUT_MS ?? 5000);

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

if (process.argv.includes("--check")) {
  const result = await probe();
  process.exit(result.ready ? 0 : 1);
}

http.createServer(async (request, response) => {
  if (request.url !== "/health" && request.url !== "/status") {
    response.writeHead(404).end();
    return;
  }

  const result = await probe();
  const code = request.url === "/health" && !result.ready ? 503 : 200;
  response.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify({ service: "running", auth: result.auth }));
}).listen(port);
