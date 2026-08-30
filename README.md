# Bodin Control Center

Self-hosted persoonlijke cockpit voor projectstatus, homelabstatus, Codex-runlogging en feitelijke volgende-stap-sturing. HYD-152 levert alleen basisruntime: externe systemen worden niet gelezen of gewijzigd.

## Vereiste

Alleen Docker Engine met Docker Compose-plugin. Node, Python en PostgreSQL op host zijn niet nodig.

## Start

```sh
cp .env.example .env
docker compose up -d --build
```

Maak altijd `.env` uit `.env.example`. Compose start niet zonder geldige device-secrets.

Open na reverse-proxyconfiguratie `https://hera.connect2home.nl`. FastAPI heeft geen hostpoort; API-verkeer loopt intern via Next.js-rewrite.

## Stop

```sh
docker compose down
```

Dit stopt en verwijdert containers/netwerk, maar bewaart PostgreSQL-data in named volume `postgres_data`.

## Logs

```sh
docker compose logs -f
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f db
```

## Database reset

Dit verwijdert alle lokale databasegegevens definitief:

```sh
docker compose down -v
docker compose up -d
```

Gebruik `docker compose down` zonder `-v` om data te behouden.

## Poorten en databaseconfiguratie

Kopieer `.env.example` naar `.env` en pas deze waarden aan:

- `PUBLIC_BASE_URL` — verplichte canonieke publieke HTTPS-origin: `https://hera.connect2home.nl`.
- `TRUSTED_PROXY_CIDRS` — verplichte komma-gescheiden reverse-proxyadressen/CIDR's, gezien vanuit de frontend-container. Gebruik nooit `0.0.0.0/0`.
- `FRONTEND_PORT` — interne HTTP-upstream voor reverse proxy, standaard `3100`.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — lokale PostgreSQL-configuratie.
- `DEVICE_TOKEN_PEPPER` — uniek hoog-entropie geheim voor HMAC-SHA256 van pairingcodes, device-tokens en rate-limit-IP's.
- `DEVICE_ADMIN_TOKEN` — uniek hoog-entropie geheim voor devicebeheer-API's; nooit in browsercode, URL's of logs zetten.

`.env` staat in `.gitignore`. Commit geen echte secrets. PostgreSQL en FastAPI zijn alleen bereikbaar binnen Compose-netwerk.

## Publieke reverse proxy (HYD-181)

Publieke URL: `https://hera.connect2home.nl`. TLS en Let's Encrypt blijven volledig eigendom van bestaande reverse proxy. Mission Control start geen tweede proxy en beheert geen certificaten.

De reverse proxy proxyt intern via HTTP naar `http://192.168.86.75:3100` en moet voor elke request zetten:

```text
Host: hera.connect2home.nl
X-Forwarded-Proto: https
X-Forwarded-For: <client-ip>, ...
```

Mission Control accepteert die forwarded headers alleen wanneer TCP-peer binnen `TRUSTED_PROXY_CIDRS` valt. Andere clients krijgen geen invloed op scheme, client-IP of host; zij worden naar canonieke HTTPS-origin geredirect. `PUBLIC_BASE_URL` is altijd HTTPS; applicatielinks blijven relatief of gebruiken deze canonieke origin.

Reverse proxy moet poort 80 naar `https://hera.connect2home.nl` redirecten. App voert dezelfde redirect defensief uit wanneer veilige HTTPS-detectie ontbreekt. Response bevat HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` en `Permissions-Policy`.

Firewall: sta TCP `3100` alleen toe vanaf reverse proxy en expliciete LAN-beheerhosts. Publiceer FastAPI-poort `8000` niet. Controleer na deployment Let's Encrypt-renewal in proxy (`certbot renew --dry-run` of proxy-specifieke renewal-status).

Uitvoerbare externe controle:

```sh
PUBLIC_BASE_URL=https://hera.connect2home.nl ./scripts/https-smoke-check.sh
```

De check valideert certificate chain/SNI-hostname, HTTP→HTTPS zonder redirectloop, security headers en afwezigheid van een cleartext publieke base-URL. Falen op verbinding, certificaat, redirect of headers wijst op nog te configureren proxy/DNS/firewall buiten deze app.

## Device pairing (HYD-173)

Maak voor elk apparaat een challenge. Pairingcodes zijn eenmalig, hebben tien minuten geldigheid en worden alleen gehasht bewaard. Device-tokens worden één keer teruggestuurd door de pairing-endpoint; sla ze alleen in veilige device-opslag op.

Beheer gebeurt zonder web-UI, zodat `DEVICE_ADMIN_TOKEN` nooit naar client-side JavaScript kan lekken. Gebruik alleen vanaf een geautoriseerde Docker-beheerhost:

```sh
docker compose exec backend python -m app.device_admin create-challenge "Pixel"
docker compose exec backend python -m app.device_admin list
docker compose exec backend python -m app.device_admin revoke <device-id>
```

HTTP API:

- `POST /api/devices/pairing-challenges` met `X-Device-Admin-Token` en `{"device_name":"Pixel"}` → `{"pairing_code":"…","expires_at":"…"}`.
- `POST /api/devices/pair` met `{"pairing_code":"…"}` → eenmalig `{"device_token":"…","device":{…}}`.
- `GET /api/devices/me` met `Authorization: Bearer <device-token>` → eigen apparaatstatus.
- `GET /api/devices` en `POST /api/devices/{device_id}/revoke` met `X-Device-Admin-Token` → beheren/intrekken.

De frontend verwijdert gespoofde forwarded headers. Alleen door HYD-181 vertrouwde reverse proxies mogen een gevalideerd client-IP aan pairing-rate-limiting doorgeven.
