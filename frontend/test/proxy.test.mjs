import assert from "node:assert/strict";
import test from "node:test";
import { forwardedProto, isTrustedProxy, loadProxyConfig, parseTrustedProxies, prepareRequest } from "../proxy.mjs";

test("only configured proxy CIDRs are trusted", () => {
  const proxies = parseTrustedProxies("192.168.86.10/32, 10.0.0.0/24");
  assert.equal(isTrustedProxy("192.168.86.10", proxies), true);
  assert.equal(isTrustedProxy("::ffff:10.0.0.25", proxies), true);
  assert.equal(isTrustedProxy("192.168.86.11", proxies), false);
});

test("untrusted clients cannot claim HTTPS with forwarded headers", () => {
  assert.equal(forwardedProto({ "x-forwarded-proto": "https" }, false), undefined);
  assert.equal(forwardedProto({ "x-forwarded-proto": "https, http" }, true), "https");
  assert.equal(forwardedProto({ "x-forwarded-proto": "http" }, true), undefined);
});

test("untrusted requests lose spoofed forwarding headers and host", () => {
  const config = loadProxyConfig({ PUBLIC_BASE_URL: "https://hera.connect2home.nl", TRUSTED_PROXY_CIDRS: "192.168.86.10" });
  const request = { socket: { remoteAddress: "192.168.86.99" }, headers: { host: "evil.example", "x-forwarded-proto": "https", "x-forwarded-for": "1.2.3.4", "x-mission-control-client-ip": "1.2.3.4", forwarded: "proto=https" } };
  assert.deepEqual(prepareRequest(request, config), { trusted: false, secure: false });
  assert.deepEqual(request.headers, { host: "hera.connect2home.nl" });
});

test("trusted proxy keeps verified HTTPS and client chain", () => {
  const config = loadProxyConfig({ PUBLIC_BASE_URL: "https://hera.connect2home.nl", TRUSTED_PROXY_CIDRS: "192.168.86.10" });
  const request = { socket: { remoteAddress: "192.168.86.10" }, headers: { host: "hera.connect2home.nl", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.10" } };
  assert.deepEqual(prepareRequest(request, config), { trusted: true, secure: true });
  assert.deepEqual(request.headers, { host: "hera.connect2home.nl", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.10", "x-mission-control-client-ip": "203.0.113.10" });
});

test("public base URL must be canonical HTTPS origin", () => {
  const config = loadProxyConfig({ PUBLIC_BASE_URL: "https://hera.connect2home.nl", TRUSTED_PROXY_CIDRS: "192.168.86.10" });
  assert.equal(config.publicUrl.origin, "https://hera.connect2home.nl");
  assert.throws(() => loadProxyConfig({ PUBLIC_BASE_URL: "http://hera.connect2home.nl", TRUSTED_PROXY_CIDRS: "192.168.86.10" }), /HTTPS/);
  assert.throws(() => loadProxyConfig({ PUBLIC_BASE_URL: "https://hera.connect2home.nl/app", TRUSTED_PROXY_CIDRS: "192.168.86.10" }), /origin-only/);
});
