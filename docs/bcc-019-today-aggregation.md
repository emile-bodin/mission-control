# BCC-019 Today aggregation

`GET /api/today` returns one factual view model for `Europe/Amsterdam`.

## Sections

Sections are always returned in this order: `overdue`, `today`, `routines`,
`upcoming`, `context`. Each section has `status`, `items`, `source_status`,
and optional `error`. `sources` reports source status and fetched item count.

Priority is structural, not scored:

1. unresolved blocked/action-needed status cards and overdue personal actions;
2. personal actions due on local today and today calendar events;
3. routines due for local today;
4. personal actions and calendar events after local today;
5. project-domain actions without a personal domain, recent health records,
   projects, and explicit Pulse exceptions.

Completed actions are excluded. Project-domain actions stay in `context`, even
when they have a due date. Project records and homelab data never enter the
personal action buckets.

## Ordering

Actions sort by due date ascending, priority lexically case-insensitive, title
case-insensitive, then id. Routines sort by reminder time, title, then id.
Calendar events sort by `starts_at`, title, then generated id. Status cards sort
blocked before action-needed, then title and id. Health records sort newest
measurement/activity first, then id. Project and Pulse lists retain their
source ordering, which is already deterministic; Pulse exceptions are filtered
from that list.

## Source states and failure isolation

Sources use `available`, `empty`, `error`, `not_configured`, or `unavailable`.
A section with items plus a failed/unavailable/unconfigured source is
`partial`; an empty section reports its strongest unavailable state. Expected
database and network failures affect only their source. No fallback data is
fabricated. Health exposes at most five newest weights and five newest
activities, without interpretation.

Routines use existing `due_routines_for_date`; no second recurrence engine is
used. Calendar remains read-only ICS. Pulse remains read-only and only explicit
negative statuses (`Down`, `Offline`, `Error`, `Fout`, `Critical`, `Degraded`,
`Warning`, `Let op`, `Actie nodig`, `Geblokkeerd`, `Unhealthy`) become context
exceptions.
