import http from "node:http";
import next from "next";
import { loadProxyConfig, prepareRequest } from "./proxy.mjs";

const config = loadProxyConfig();
const port = Number(process.env.PORT || 3000);
const app = next({ dev: false, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();
const securityHeaders = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
};

await app.prepare();
http.createServer((request, response) => {
  for (const [name, value] of Object.entries(securityHeaders)) response.setHeader(name, value);
  const { secure } = prepareRequest(request, config);
  if (!secure) {
    response.writeHead(308, { Location: `${config.publicUrl.origin}${request.url}` });
    response.end();
    return;
  }
  handle(request, response);
}).listen(port, "0.0.0.0");
