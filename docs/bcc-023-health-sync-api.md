# BCC-023 authenticated health sync API

Mobile base URL: `https://hera.connect2home.nl`. TLS terminates at existing trusted reverse proxy; backend remains internal HTTP only. Clients must not call internal Compose addresses or send trusted proxy headers.

## Version and authentication

API version is `v1`. Both endpoints require HYD-173 device authentication:

```text
Authorization: Bearer <device-token>
```

The backend HMAC-hashes the token with `DEVICE_TOKEN_PEPPER`, looks it up in `paired_devices`, rejects missing, invalid, and revoked tokens with `401` plus `WWW-Authenticate: Bearer`, and updates `last_seen_at` on the existing cadence. No second auth method exists.

## Endpoints

- `POST /api/v1/health/sync` uploads weight and activity records in a batch.
- `GET /api/v1/health/sync?cursor=<opaque>&limit=1..100` reads the incremental server change stream.

## Upload request and response

`POST` body:

```json
{
  "records": [
    {
      "type": "weight",
      "measured_at": "2026-08-31T09:30:00+02:00",
      "value": 70.2,
      "unit": "kg",
      "source": "health-connect",
      "external_record_id": "android-weight-123"
    },
    {
      "type": "activity",
      "activity_type": "running",
      "started_at": "2026-08-31T10:00:00+02:00",
      "ended_at": "2026-08-31T10:30:00+02:00",
      "duration_seconds": 1800,
      "distance_value": 2,
      "distance_unit": "km",
      "energy_value": 418.4,
      "energy_unit": "kj",
      "source": "health-connect",
      "external_record_id": "android-activity-123",
      "source_metadata": {"device": "Pixel"}
    }
  ]
}
```

`records` is required, has 1–100 JSON objects, and the complete JSON body is at most 1,048,576 bytes. Every record has `type` of `weight` or `activity` and a non-empty `external_record_id`. Other fields use the exact HYD-169 schemas: timezone-aware timestamps, supported units, positive weight/duration, paired optional distance/energy values, activity interval/duration consistency, and no unknown fields. Timestamps and units receive the same HYD-169 UTC/unit normalization; original source values remain stored.

Successful transport always returns `200` with a stable result per input index:

```json
{
  "api_version": "v1",
  "accepted": 2,
  "rejected": 1,
  "results": [
    {"index": 0, "type": "weight", "status": "created", "id": "…", "source": "health-connect", "external_record_id": "android-weight-123"},
    {"index": 1, "type": "activity", "status": "unchanged", "id": "…", "source": "health-connect", "external_record_id": "android-activity-123"},
    {"index": 2, "type": "weight", "status": "invalid", "error": {"code": "validation_error", "details": [{"loc": ["value"], "message": "…", "type": "…"}]}}
  ]
}
```

`status` is `created`, `updated`, `unchanged`, `invalid`, or `failed`. `invalid` is terminal client-data failure; `failed` is storage failure and may be retried. A bad record never rolls back other records: each valid record is committed independently. A batch containing only invalid records still returns `200`, with `accepted: 0` and per-record errors.

Identity is exactly `(source, external_record_id)` within its HYD-169 table. The endpoint performs an upsert: a changed duplicate is `updated`; an equal duplicate is `unchanged` and does not change its timestamp. Retrying one record, one batch, or a response-lost batch is therefore safe and never creates duplicates.

## Incremental cursor response

`GET` returns up to `limit` records in deterministic `(updated_at, type, id)` order:

```json
{
  "api_version": "v1",
  "records": [{"type": "weight", "id": "…", "measured_at": "…", "normalized_kg": 70.2}],
  "next_cursor": "eyJ2IjoxLC4uLn0",
  "has_more": false
}
```

The opaque v1 cursor is a server change-stream boundary containing the final returned record's UTC `updated_at`, type, and ID. Pass `next_cursor` to fetch strictly later records. With no returned records, `next_cursor` equals supplied cursor (or `null` for initial empty sync). Do not parse or manufacture cursors; malformed or unsupported cursors return `422`. A full initial sync omits `cursor`.

## Status codes

- `200`: upload processed (including record-level failures) or change page returned.
- `401`: missing, invalid, or revoked device token.
- `413`: upload body exceeds 1,048,576 bytes.
- `422`: malformed top-level body, empty/oversized `records`, malformed cursor, or invalid `limit`. Individual record schema faults stay in the `200` response.
- `500`: unexpected request-level failure. Retry only after preserving input batch; per-record result is unavailable.
