# BCC-018 health API

Local manual-entry API. No mobile sync, cursor, retries, or medical interpretation.

## Tables

- `health_weights`: `id`, `measured_at`, `normalized_kg`, original `source_value` and `source_unit`, `source`, optional `external_record_id`, timestamps.
- `health_activities`: `id`, `activity_type`, `started_at`, `ended_at`, `duration_seconds`, normalized `distance_meters` and `energy_kilocalories`, original distance/energy values and units, `source`, optional `external_record_id`, JSON `source_metadata`, timestamps.

Each table has a partial unique index on `(source, external_record_id)` when `external_record_id` is present.

## Endpoints

- `GET /api/health/weights`
- `GET /api/health/weights/{id}`
- `POST /api/health/weights`
- `PATCH /api/health/weights/{id}`
- `GET /api/health/activities`
- `GET /api/health/activities/{id}`
- `POST /api/health/activities`
- `PATCH /api/health/activities/{id}`

Weight create fields: `measured_at` (timezone-aware ISO-8601), `value`, `unit` (`kg` or `lb`), `source`, optional `external_record_id`.

Activity create fields: `activity_type`, timezone-aware `started_at` and `ended_at`, `duration_seconds`, optional paired `distance_value`/`distance_unit` (`m` or `km`), optional paired `energy_value`/`energy_unit` (`kcal` or `kj`), `source`, optional `external_record_id`, optional JSON object `source_metadata`.

Patches accept any subset. Supplied fields are merged with the stored record and validated as a complete record. Empty patches return `422`; unknown fields return `422`; missing records return `404`.

## Normalization and validation

- Timestamps require an explicit timezone and are stored as UTC.
- Weight is stored in kilograms. `lb` is multiplied by `0.45359237`; original value/unit remain stored.
- Distance is stored in metres. `km` is multiplied by `1000`; original value/unit remain stored.
- Energy is stored in kilocalories. `kj` is multiplied by `0.239005736`; original value/unit remain stored.
- Weight must be positive. Unsupported units, missing paired value/unit fields, negative distance/energy, non-positive duration, end at/before start, and a duration that differs from `ended_at - started_at` return `422`.

## External records

Manual records use a `source` such as `manual` and omit `external_record_id`. External records include both fields. Repeating `POST` with the same source plus external ID updates that one record in place and returns `200`; a newly created record returns `201`. This preserves one stable local ID for later sync idempotency.
