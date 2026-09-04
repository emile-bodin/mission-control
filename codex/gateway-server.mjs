import http from "node:http";

const port = Number(process.env.PORT ?? 8090);
const token = process.env.CODEX_RUNTIME_TOKEN ?? "";
const runnerUrl = process.env.CODEX_RUNNER_URL ?? "";

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 65536) request.destroy();
    });
    request.once("end", () => resolve(body));
    request.once("error", reject);
  });
}

http.createServer(async (request, response) => {
  if (request.url !== "/run" || request.method !== "POST") {
    response.writeHead(404).end();
    return;
  }
  if (!token || request.headers.authorization !== `Bearer ${token}`) {
    response.writeHead(401).end();
    return;
  }
  try {
    const body = await readBody(request);
    const upstream = await fetch(runnerUrl, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(125000),
    });
    response.writeHead(upstream.status, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(await upstream.text());
  } catch {
    response.writeHead(503).end();
  }
}).listen(port);
