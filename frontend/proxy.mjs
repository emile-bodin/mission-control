import { BlockList, isIP } from "node:net";

function normaliseAddress(address) {
  return address?.startsWith("::ffff:") ? address.slice(7) : address;
}

function requireHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PUBLIC_BASE_URL must be an absolute HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("PUBLIC_BASE_URL must be an origin-only HTTPS URL");
  }
  return url;
}

export function parseTrustedProxies(value) {
  if (!value?.trim()) throw new Error("TRUSTED_PROXY_CIDRS must list at least one reverse-proxy address or CIDR");
  const list = new BlockList();
  for (const entry of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const [address, prefix] = entry.split("/");
    const family = isIP(address);
    if (!family || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error(`Invalid trusted proxy entry: ${entry}`);
    }
    if (prefix === undefined) list.addAddress(address, family === 4 ? "ipv4" : "ipv6");
    else list.addSubnet(address, Number(prefix), family === 4 ? "ipv4" : "ipv6");
  }
  return list;
}

export function loadProxyConfig(environment = process.env) {
  return {
    publicUrl: requireHttpsUrl(environment.PUBLIC_BASE_URL),
    trustedProxies: parseTrustedProxies(environment.TRUSTED_PROXY_CIDRS)
  };
}

export function isTrustedProxy(address, trustedProxies) {
  const normalised = normaliseAddress(address);
  const family = isIP(normalised);
  return Boolean(family && trustedProxies.check(normalised, family === 4 ? "ipv4" : "ipv6"));
}

export function forwardedProto(headers, trusted) {
  if (!trusted) return undefined;
  const value = headers["x-forwarded-proto"];
  const first = Array.isArray(value) ? value[0] : value?.split(",")[0];
  return first?.trim().toLowerCase() === "https" ? "https" : undefined;
}

export function prepareRequest(request, config) {
  const trusted = isTrustedProxy(request.socket.remoteAddress, config.trustedProxies);
  const sourceHeaders = request.headers;
  const proto = forwardedProto(sourceHeaders, trusted);
  const forwardedFor = trusted ? sourceHeaders["x-forwarded-for"] : undefined;

  for (const name of ["x-forwarded-proto", "x-forwarded-for", "x-forwarded-host", "forwarded"]) delete sourceHeaders[name];
  sourceHeaders.host = config.publicUrl.host;
  if (trusted) {
    if (proto) sourceHeaders["x-forwarded-proto"] = proto;
    if (forwardedFor) sourceHeaders["x-forwarded-for"] = forwardedFor;
  }
  return { trusted, secure: proto === "https" };
}
