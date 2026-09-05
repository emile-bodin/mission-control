# HYD-201 — Second Brain browser access

`/ideas` implements the HYD-200 Idea Incubator source with paired-browser access. A one-time pairing code creates a paired device server-side; the browser receives only an opaque, secure, HttpOnly, SameSite=Strict session cookie. Browser reads use `/api/browser/stream-entries`, which deliberately omits owner IDs, audit data, source metadata, voice-reference payloads, and all credentials.

The Stitch source suggests vector-search-style knowledge work. This product has no vector index, embeddings, RAG, semantic score, automatic classification, transcript, or enrichment capability. The route states that limitation explicitly and exposes only capture, triage proposal, archive, and soft-delete operations backed by existing stream-entry behavior.
