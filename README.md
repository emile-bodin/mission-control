# Bodin Control Center

Self-hosted persoonlijke cockpit voor projectstatus, homelabstatus, Codex-runlogging en feitelijke volgende-stap-sturing. HYD-152 levert alleen basisruntime: externe systemen worden niet gelezen of gewijzigd.

## Vereiste

Alleen Docker Engine met Docker Compose-plugin. Node, Python en PostgreSQL op host zijn niet nodig.

## Start

```sh
cp .env.example .env
docker compose up -d --build
```

Zonder `.env` start Compose ook met lokale veilige placeholderwaarden. Maak voor normaal gebruik altijd `.env` uit `.env.example` en vervang `POSTGRES_PASSWORD`.

Open frontend op `http://localhost:3000`. Controleer backend:

```sh
curl http://localhost:8000/health
```

Verwacht:

```json
{"status":"ok"}
```

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

- `FRONTEND_PORT` — hostpoort voor Next.js, standaard `3000`.
- `BACKEND_PORT` — hostpoort voor FastAPI, standaard `8000`.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` — lokale PostgreSQL-configuratie.

`.env` staat in `.gitignore`. Commit geen echte secrets. PostgreSQL is alleen bereikbaar binnen Compose-netwerk; frontend en backend zijn vanaf host bereikbaar op hun geconfigureerde poorten.
