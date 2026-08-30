# Mission Control Agent Guide

## Product intent

Mission Control (Bodin Control Center) is a self-hosted, single-user personal assistant for daily direction across life, health, household, work, projects, and homelab.

- `Vandaag` is the primary experience: agenda, focus, routines, personal administration, household, health, and relevant work signals.
- Projects and homelab remain first-class context, but must not dominate the product as a project-manager dashboard.
- Facts, interpretation, and proposed actions stay separate.
- Unknown values remain unknown. Never infer or fabricate operational state.
- AI output is a proposal. It must not mutate personal data or external systems without explicit user confirmation.
- Prepare data models for a future household owner, but keep the current product single-user.

## Current architecture

- `frontend/`: Next.js 14 App Router, React 18, TypeScript, and Tailwind CSS.
  - Server components fetch the backend through Compose DNS at `http://backend:8000`.
  - Client components call relative `/api/...` URLs; `frontend/next.config.mjs` rewrites them to the backend.
  - UI copy is mostly Dutch. Preserve that language and the existing dark visual baseline unless an issue says otherwise.
- `backend/`: FastAPI, Pydantic, psycopg, and PostgreSQL 17.
  - `backend/app/main.py` currently contains schemas, startup migrations, seed data, integrations, and routes.
  - Database rows use `dict_row`; SQL is explicit rather than ORM-based.
  - Startup migrations must be additive and idempotent. Preserve existing records and seed behavior.
- `compose.yaml` is the supported runtime. Host installations of Node, Python, or PostgreSQL are not required.
- Existing external sources:
  - Google Calendar ICS: read-only.
  - Pulse: read-only homelab inventory/status.
- Product timezone is `Europe/Amsterdam`. Treat due dates, routines, calendar boundaries, DST, and notifications accordingly.

## Deployment facts

- Canonical public URL: `https://hera.connect2home.nl`.
- TLS terminates at an existing reverse proxy using a Let's Encrypt certificate.
- Proxy upstream: `http://192.168.86.75:3100` (`FRONTEND_PORT=3100` in deployment).
- External clients, including the planned Android companion, must use HTTPS only.
- Internal proxy-to-frontend HTTP is intentional. Do not add a second reverse proxy or certificate authority to this repository.
- Trust `Forwarded`/`X-Forwarded-*` headers only from explicitly configured proxy addresses or CIDRs. Never hardcode an unknown proxy IP.
- Do not expose backend, database, health data, tokens, or Codex auth volumes publicly.

## Working method

1. Read the active request or Linear issue and turn it into explicit acceptance criteria.
2. If `.codegraph/` exists, use CodeGraph first for symbols, flows, callers, and blast radius. Use normal file inspection for configs, docs, and non-indexed content.
3. Inspect the current worktree before editing. It may contain unrelated user changes; preserve them.
4. Reuse existing models, routes, components, and patterns before adding code or dependencies.
5. Make the smallest coherent change that fully satisfies the issue. Avoid adjacent cleanup and speculative abstractions.
6. Add or update focused tests for non-trivial behavior, then run proportional verification.
7. Report changed files, checks run, failures, and any manual deployment action still required.

Do not commit, push, reset, delete data, modify external infrastructure, or update Linear unless the user explicitly asks.

## Backend conventions

- Validate public input with Pydantic. Use `extra="forbid"` for mutation payloads unless compatibility requires otherwise.
- Keep API enums and PostgreSQL `CHECK` constraints aligned.
- Use parameterized SQL only. Never interpolate user-controlled values into SQL.
- Keep multi-write operations transactional and idempotent where retries are possible.
- Return factual failure/unknown states for unavailable read-only integrations; do not synthesize healthy status.
- Add schema changes through `run_migrations()` using `CREATE ... IF NOT EXISTS` and guarded `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` patterns until a dedicated migration system is introduced.
- Never use `docker compose down -v` during normal development or verification; it destroys PostgreSQL data.

## Frontend conventions

- Prefer server components for read-only page data and small client components for forms or interactive mutations.
- Keep browser mutations on relative `/api/...` paths so they pass through the Next.js rewrite.
- Use `cache: "no-store"` for live dashboard data.
- Preserve explicit empty, unavailable, stale, and error states. Do not turn missing data into zero or success.
- Reuse existing Tailwind tokens and layout patterns. Maintain responsive behavior, semantic headings, keyboard access, and visible labels.
- Keep date/time formatting in Dutch and apply `Europe/Amsterdam` deliberately rather than relying on container timezone.

## Integrations and sensitive data

- Keep Google Calendar and Pulse read-only unless a later issue explicitly changes that contract.
- Samsung Health integration must go through an Android companion and Health Connect with explicit permissions.
- Limit health scope to weight and activity data defined by the active issue. Do not add medical interpretation.
- Pair mobile devices with revocable tokens; store only token hashes server-side and use Android Keystore client-side.
- Codex runs in an isolated container with persistent session auth, no host/repository write mounts, and proposal-only authority.
- Never log secrets, raw device tokens, session credentials, calendar URLs, health payloads, or authorization headers.

## Verification

Use Docker-based checks so results match the supported runtime.

```sh
# Validate Compose configuration
docker compose config

# Backend unit tests using the built backend environment
docker compose run --rm -v "$PWD/backend:/app" backend \
  python -m unittest discover -s tests

# Production frontend compilation
docker compose build frontend

# Full runtime smoke check
docker compose up -d --build
curl --fail http://localhost:${BACKEND_PORT:-8000}/health
```

For proxy/TLS work, also verify the canonical endpoint without changing the external proxy:

```sh
curl --fail --show-error --location --head https://hera.connect2home.nl
openssl s_client -connect hera.connect2home.nl:443 \
  -servername hera.connect2home.nl </dev/null
```

Filter large test, build, log, and diff output with context-preserving tools when available. Always retain exact failing command, exit status, and relevant error lines.

## Linear mapping

- Linear project: `Bodin Control Center`, team `Hydra`.
- User-facing feature IDs use `BCC-*`; technical Linear issue identifiers use `HYD-*`.
- Parent issues coordinate work only. Implementation belongs in their non-overlapping subissues.
- When an issue is supplied, implement only its scope and honor its blockers. Mention discovered overlap instead of silently absorbing another issue.

