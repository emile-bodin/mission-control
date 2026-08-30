#!/usr/bin/env bash
set -euo pipefail

public_url="${PUBLIC_BASE_URL:-https://hera.connect2home.nl}"
host="$(printf '%s' "$public_url" | sed -E 's#^https://([^/]+).*$#\1#')"
http_url="http://${host}/"

if [[ "$public_url" != "https://${host}" && "$public_url" != "https://${host}/" ]]; then
  echo "FAIL: PUBLIC_BASE_URL must be an HTTPS origin: $public_url" >&2
  exit 1
fi

echo "Checking TLS certificate chain and hostname: $host"
tls_output="$(openssl s_client -connect "${host}:443" -servername "$host" -verify_hostname "$host" -verify_return_error </dev/null 2>&1 || true)"
if ! printf '%s\n' "$tls_output" | grep -q 'Verify return code: 0 (ok)'; then
  echo "FAIL: TLS chain or hostname validation failed for $host. Check public DNS, proxy certificate and Let's Encrypt renewal." >&2
  printf '%s\n' "$tls_output" | grep -Ei 'verify error|Verify return code|connect:|error:' | tail -5 >&2 || true
  exit 1
fi
echo "PASS: certificate chain and hostname valid"

redirect_headers="$(curl --fail --silent --show-error --head --max-redirs 0 "$http_url")" || true
redirect_code="$(printf '%s\n' "$redirect_headers" | awk 'toupper($1) ~ /^HTTP\// { code=$2 } END { print code }')"
redirect_location="$(printf '%s\n' "$redirect_headers" | awk '/^[Ll]ocation:/ { sub(/^[^:]*:[[:space:]]*/, ""); sub(/\r$/, ""); print; exit }')"
if [[ "$redirect_code" != "301" && "$redirect_code" != "302" && "$redirect_code" != "307" && "$redirect_code" != "308" ]] || [[ "$redirect_location" != https://* ]]; then
  echo "FAIL: HTTP must redirect once to HTTPS (got ${redirect_code:-no response} ${redirect_location:-no location})" >&2
  exit 1
fi
curl --fail --silent --show-error --location --max-redirs 5 --output /dev/null "$http_url"
echo "PASS: HTTP redirects to HTTPS without loop"

headers="$(curl --fail --silent --show-error --head "$public_url")"
for required in 'strict-transport-security:' 'x-content-type-options: nosniff' 'x-frame-options: deny' 'referrer-policy:'; do
  if ! printf '%s\n' "$headers" | grep -qi "^$required"; then
    echo "FAIL: missing security header: $required" >&2
    exit 1
  fi
done
echo "PASS: HSTS and security headers present"

body="$(curl --fail --silent --show-error "$public_url")"
if printf '%s\n%s\n' "$headers" "$body" | grep -Fq "http://${host}"; then
  echo "FAIL: response publishes cleartext public base URL" >&2
  exit 1
fi
echo "PASS: no cleartext public base URL published"
