# HYD-202 — Stitch functional-parity audit

Auditdatum: 2026-09-05. Bron: Stitch-project `projects/12179133354896504656`.

Gebruikt: screen-id, lokale HTML/CSS-structuur in `.stitch/designs/` en beschikbare screenshots. `Cortex Command Dashboard` heeft geen Stitch-screenshot; de HTML-bron is gecontroleerd. Oude HYD-200-classificaties zijn niet als bewijs gebruikt.

Status betekent hieronder huidige status vóór de correctie. `unavailable by source` behoudt het Stitch-paneel zonder feitelijke gegevens te verzinnen.

## `/` — Cortex Command Dashboard

Screen-id: `fa736b2bc0c64b8ca89e8f7e7505421d`.

| Stitch sectie/paneel | Doel en plaats | Vereiste data | Huidige Mission Control component / API | Status | Correctie |
| --- | --- | --- | --- | --- | --- |
| Command shell, topbar, navigatie | Globale context bovenaan | lokale tijd, beschikbare integratiestatus, routes | `layout.tsx`, `Navigation`, `/api/homelab` | partial | Behoud shell; toon alleen feitelijke Pulse-context en geen provider/model/token/GPU-claim. |
| Autonomous brief + directive cards | Primair blok boven content | laatste briefing, acties/statuskaarten | `page.tsx`, `/api/cortex/today` | partial | Maak briefing, losse veilige directives en status expliciete kaarten. |
| Workspace strip | Project/Linear-context naast briefing | lokale projecten; HYD-160 voor Linear | `/api/cortex/today.projects` | partial | Behoud aparte workspace-strip; Linear-details `Unavailable by source`. |
| Cluster telemetry strip | Pulse-context naast workspace | Pulse resources | `/api/cortex/today.homelab` | partial | Behoud apart paneel; onbekende metriek blijft Unknown. |
| Chrono Stream | Tijdlijn met context en detailroute | agenda, routines, acties | `/api/cortex/today.chrono`, actions | partial | Behoud tijd/type/context; alleen veilige links, geen Auto-Block. |
| Bio-Vitals & Recovery | Losse categoriekaarten | activiteit, gewicht; overige health-bronnen | `/api/cortex/today.health` | partial | Activity/gewicht binden; sleep, steps, recovery en fasting expliciet unavailable. |
| Stream Dock & Ingestion | Entry naar Second Brain | browser session + `stream_entries` | `/ideas`, HYD-201 API | partial | Werkende link en capability-state, geen disabled placeholder. |
| Coprocessor / inspector | Proposal-only vraag en resultaat | Cortex proposal capability | `CortexCoprocessor`, `/api/cortex/coprocessor*` | matched | Behoud gescheiden voorstelstroom; geen execute/apply. |

## `/briefings` — Executive Daily Briefing

Screen-id: `ac094dab28a6466098350becb0572507`.

| Stitch sectie/paneel | Doel en plaats | Vereiste data | Huidige Mission Control component / API | Status | Correctie |
| --- | --- | --- | --- | --- | --- |
| Briefing header/directive | Titel, samenvatting en veilige refresh | nieuwste briefing-run | `briefings/page.tsx`, `/api/briefings` | matched | Geen wijziging nodig. |
| Run/status/timestamp | Uitvoering, fout en afgerond-moment | briefing-run | `/api/briefings` | matched | Geen wijziging nodig. |
| Validated facts | Feiten los van interpretatie | briefing facts | `/api/briefings` | matched | Geen wijziging nodig. |
| Proposal review | Review/confirm begrensd per voorstel | briefing proposals | `ProposalReview`, `/api/briefing-proposals` | matched | Behoud bevestigingsgrens. |
| Unknowns/context | Onbeschikbare informatie zichtbaar | briefing unknowns | `/api/briefings` | matched | Geen wijziging nodig. |
| Extra directive/priority cards | Prioritering als Stitch-structuur | echte briefing facts/proposals | bestaande briefingpanelen | partial | Voeg geen fictieve directives toe; samenvatting/status vult deze plaats. |

## `/ideas` — Idea Incubator & Second Brain

Screen-id: `bb4c8d68c24c4d18b8ff19dd274a7a3b`.

| Stitch sectie/paneel | Doel en plaats | Vereiste data | Huidige Mission Control component / API | Status | Correctie |
| --- | --- | --- | --- | --- | --- |
| Capture dock | Nieuwe capture/type bovenaan | paired browser session | `IdeasClient`, `POST /api/stream-entries` | partial | Houd capturevorm prominent en noem alleen bestaande typen. |
| Pairing/auth state | Toegang vóór inhoud | HYD-201 browser-session | `/api/browser-sessions/pair` | matched | Behoud state en foutfeedback. |
| Inbox/raw stream | Binnengekomen entries links | `stream_entries` | `/api/browser/stream-entries` | partial | Behoud cardgroep met type/status/tijd/action. |
| Tabs/filters | Inbox, archive, all, type/status | `stream_entries` | `IdeasClient` query params | matched | Geen wijziging nodig. |
| Triage/processing | Veilige triage-status en actie | `stream_entries` | `/triage` | partial | Gebruik echte captured/triaged state; geen AI-structurering. |
| Archive | Archief en archive-actie | `stream_entries` | `/archive` | matched | Geen wijziging nodig. |
| Promoted/knowledge/semantic panels | Verdere kennisverwerking | geen bron | geen API | unavailable by source | Behoud duidelijk unavailable-paneel; geen RAG, embeddings of classificatie. |

## `/homelab` — Homelab & Infra Telemetry

Screen-id: `67701329476240429af185a0d31d6a38`.

| Stitch sectie/paneel | Doel en plaats | Vereiste data | Huidige Mission Control component / API | Status | Correctie |
| --- | --- | --- | --- | --- | --- |
| Global health/status band | Read-only systeemcontext bovenaan | Pulse availability/resources | `/api/homelab` | partial | Geen nominal/healthy-claim; feitelijke Pulse-status. |
| Compute/system/inference/storage summary | Vier afzonderlijke metrics | CPU, RAM, GPU, ZFS-bronnen | geen detailmetrics | missing | Vier kaarten met `Unavailable by source`. |
| Infrastructure node cards | Resource-identiteit en status | Pulse resource naam/type/status/parent | `/api/homelab.resources` | partial | Resourcecards per feitelijke resource; geen verzonnen node-rol of metrics. |
| Network/throughput telemetry | Tijdreeks-paneel | throughput/tijdreeks | geen bron | missing | Paneel met unavailable-state, geen grafiek. |
| Local LLM velocity | Inference-rate-paneel | lokale inference telemetry | geen bron | missing | Paneel met unavailable-state; Codex is geen telemetrybron. |
| Storage/drive health matrix | Drive/SMART matrix | SMART/storage health | geen bron | missing | Matrix/paneel unavailable, zonder drivewaarden. |
| Mission-critical services | Servicegroep onder telemetry | Pulse resources | `/api/homelab.resources` | partial | Feitelijke resource name/status/type/parent kaarten. |
| Manual asset registry | Eigen assetflow onder Pulse-data | assets | `/api/assets`, new/detail/edit routes | matched | Behoud los van Pulse en links naar flow. |

## `/projects` — Linear & Projects Tracker

Screen-id: `fcabbedcf2874d47af933f92740f7b4b`.

| Stitch sectie/paneel | Doel en plaats | Vereiste data | Huidige Mission Control component / API | Status | Correctie |
| --- | --- | --- | --- | --- | --- |
| Tracker header/cycle controls | Trackercontext en acties bovenaan | lokale projectcontext; HYD-160 cycle data | `/api/projects` | partial | Lokale context + nieuw project; cycle controls unavailable by source. |
| Project summary/roadmap | Projectgroepering en status | lokale projecten | `/api/projects` | partial | Behoud projectboard en detailroutes als primaire bruikbare data. |
| Issue columns/boards | In progress/review/next cycle | HYD-160 issues | geen bron | unavailable by source | Sectie zichtbaar met expliciete unavailable-state. |
| Activity stream | Commits, PR's, issue-events | HYD-160 activity/PR data | geen bron | unavailable by source | Paneel zichtbaar zonder fictieve activiteit. |
| Repository state | Repo sync/branches/coverage | repository telemetry | geen bron | unavailable by source | Paneel zichtbaar zonder git-/CI-waarden. |
| Sprint copilot | Prioriteitsvoorstel | HYD-160 + proposal capability | geen bron | unavailable by source | Geen fictief advies of mutatiepad. |

## Reële bronnen en begrenzingen

- `/api/cortex/today`: briefing, projecten, statuskaarten, acties, agenda/routine-context, Pulse-samenvatting, gewicht en activiteiten.
- `/api/briefings` en `/api/briefing-proposals`: feiten, onbekenden en proposal-only review.
- HYD-201 browser-session en `stream_entries`: capture, list, triage, archive en pairing.
- `/api/homelab`: read-only Pulse resource facts. `/api/assets`: handmatige asset-flow.
- `/api/projects`: lokale projectregistry en detailroutes.

Niet geïmplementeerd als feit: AI provider/model/token/GPU-status, CPU/RAM/ZFS/SMART/networkwaarden of grafieken, lokale LLM-snelheid, Linear issues/PR's/cycles/blockers, repository/CI-data, RAG/embeddings/vector search, AI-classificatie/enrichment/transcriptie of automatische uitvoering.
