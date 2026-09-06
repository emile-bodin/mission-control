# HYD-202 — Stitch functional-parity audit

Auditdatum: 2026-09-06. Bron: Stitch-project `projects/12179133354896504656`.

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

## Acceptance pass — 2026-09-06

Bronnen voor deze pass: actuele Stitch HTML/CSS en screenshots in `.stitch/designs/`, deze matrix, actuele branch-render op `http://localhost:3100` en HTTPS-render op `https://hera.connect2home.nl`. Beide renders gaven voor alle vijf routes HTTP 200. Hera draait de lokaal herbouwde frontend op poort 3100.

Er was geen beschikbare browser-engine voor klik-, viewport- of screenshotscenario's. Server-rendering is dus gecontroleerd; client-mutaties, detailnavigatie en responsive visual rendering zijn niet als uitgevoerd bewijs gemarkeerd. Dat is een verificatieblokker, geen verzonnen acceptancebewijs.

### `/` — Cortex Command Dashboard

| Blok | Pre-fix status | Implementation status | Acceptance status | Evidence | Remaining dependency |
| --- | --- | --- | --- | --- | --- |
| Topbar | partial | statische `AI SYNC: FACTUAL` en proposal-status verwijderd | accepted | lokale + Hera SSR bevatten geen runtimeclaim | — |
| Dagbriefing en contextcards | partial | briefingfeit, komende agenda en open actie hebben eigen feitelijke mapping | accepted | SSR toont briefing/agenda/action-context; geen directive-label voor onbekenden | — |
| Workspace strip | partial | lokale projectcontext met beschikbare/onbeschikbare badge | unavailable by source | HYD-160 workspace-details ontbreken expliciet | HYD-160 |
| Cluster telemetry strip | partial | Pulse resource-count/status | accepted | SSR toont feitelijke `20/32 resources online` zonder cluster-healthclaim | Pulse detailmetrics ontbreken |
| Chrono Stream | partial | agenda-items, lege/onbekende fallback en agendalink | partial | SSR toont vier agenda-items en link; click-flow niet uitgevoerd | browseracceptance |
| Bio-Vitals | partial | activiteit/gewicht apart; steps, sleep/recovery en fasting apart unavailable | partial | SSR toont afzonderlijke categorieën; responsive visual niet uitgevoerd | browseracceptance; ontbrekende healthbronnen |
| Stream Dock | partial | werkende `/ideas`-entry met HYD-201 capability-context | partial | SSR toont dock en link; paired capture niet uitgevoerd | browseracceptance |
| Coprocessor | matched | proposal-only behouden | partial | SSR toont availability/error zonder apply-actie; interactie niet uitgevoerd | browseracceptance |

Eindconclusie: structureel correct; nog niet volledig accepted door niet-uitgevoerde interactie/responsief bewijs.

### `/briefings` — Executive Daily Briefing

| Blok | Pre-fix status | Implementation status | Acceptance status | Evidence | Remaining dependency |
| --- | --- | --- | --- | --- | --- |
| Header en timestamp | matched | feitelijke run-status; unavailable state toegevoegd | accepted | lokale + Hera SSR tonen `DAILY BRIEF` | — |
| Highlight cards | partial | uitsluitend `facts` als `FACT 01…`; unknowns niet als directive | accepted | SSR bevat `Gevalideerde briefing highlights` | — |
| Facts en status | matched | facts/run/validatiefout gescheiden | accepted | SSR-section aanwezig | — |
| Proposal review | matched | proposal-only review plus unavailable state | partial | structureel aanwezig; confirm-flow niet uitgevoerd | browseracceptance |
| Unknowns | matched | aparte unknown/unavailable section | accepted | SSR-section aanwezig | — |
| Context strips | partial | Linear is unavailable by source; Pulse blijft read-only | accepted | SSR toont beide strips | HYD-160 voor Linear details |

Eindconclusie: structureel correct; proposalconfirmatie heeft nog browseracceptance nodig.

### `/ideas` — Idea Incubator & Second Brain

| Blok | Pre-fix status | Implementation status | Acceptance status | Evidence | Remaining dependency |
| --- | --- | --- | --- | --- | --- |
| Pairing | matched | HYD-201 pairing/error state | partial | clientcomponent en gerichte test; interactie niet uitgevoerd | browseracceptance + geldige pairing-code |
| Capture dock | partial | echte stream-entry POST, typen en loading state | partial | clientcomponent en test; mutation niet uitgevoerd | browseracceptance |
| Inbox, filters en empty state | partial | queryfilters, empty state en live reload | partial | component/test aanwezig; client-hydratie niet uitgevoerd | browseracceptance |
| Triage, archive en deleted state | partial | echte mutation endpoints en state labels | partial | component/test aanwezig; mutation niet uitgevoerd | browseracceptance |
| Error state | matched | retryable unavailable state | partial | component/test aanwezig; niet getriggerd | browseracceptance |
| Processing matrix | partial | afzonderlijk unavailable panel | accepted | bron is aantoonbaar afwezig; geen AI-structurering | — |
| Semantic/knowledge panels | unavailable by source | afzonderlijke unavailable panels | accepted | geen RAG/embeddings/classificatie getoond | — |

Eindconclusie: layout en veilige flowstructuur aanwezig, maar client-only flow nog niet live geaccepteerd.

### `/homelab` — Homelab & Infra Telemetry

| Blok | Pre-fix status | Implementation status | Acceptance status | Evidence | Remaining dependency |
| --- | --- | --- | --- | --- | --- |
| Global health band | partial | Pulse facts/Unknown, geen nominal claim | accepted | lokale + Hera SSR tonen `GLOBAL SYSTEM HEALTH` | — |
| Compute summary | missing | afzonderlijk unavailable panel | accepted | SSR-panel aanwezig | CPU-bron |
| System summary | missing | afzonderlijk unavailable panel | accepted | SSR-panel aanwezig | RAM-bron |
| Inference summary | missing | afzonderlijk unavailable panel | accepted | SSR-panel aanwezig | GPU-bron |
| Storage summary | missing | afzonderlijk unavailable panel | accepted | SSR-panel aanwezig | storage-metriekbron |
| Infrastructure nodes | partial | feitelijke Pulse identity/status/parent | accepted | SSR toont resourcecards zonder verzonnen rolmetrics | — |
| Network telemetry | missing | eigen unavailable paneel, geen grafiek | accepted | SSR toont paneel | throughput/tijdreeksbron |
| Local LLM velocity | missing | eigen unavailable paneel | accepted | SSR toont paneel; Codex niet als inferencebron | lokale inferencebron |
| SMART matrix | missing | eigen unavailable paneel | accepted | SSR toont paneel | SMART/storage-healthbron |
| Services en manual assets | partial/matched | services los van assets; asset-error state toegevoegd | partial | SSR toont beide; new/detail/edit links niet aangeklikt | browseracceptance |

Eindconclusie: Stitch-decompositie server-side zichtbaar en alle ontbrekende bronnen per paneel begrensd; assetsubflow wacht op browseracceptance.

### `/projects` — Linear & Projects Tracker

| Blok | Pre-fix status | Implementation status | Acceptance status | Evidence | Remaining dependency |
| --- | --- | --- | --- | --- | --- |
| Tracker header/cycle controls | partial | cycle context expliciet unavailable | accepted | lokale + Hera SSR tonen `CYCLE: UNAVAILABLE` | HYD-160 |
| Project summary en roadmap | partial | lokale registry, detailroutes, registry-error state | partial | SSR toont projectdata; detailroute niet geopend | browseracceptance |
| Issue board | unavailable by source | drie afzonderlijke unavailable kolommen | accepted | SSR toont `UNAVAILABLE BY SOURCE` | HYD-160 issues |
| Activity stream | unavailable by source | afzonderlijk unavailable paneel | accepted | SSR aanwezig | HYD-160 activity |
| Repository state | unavailable by source | afzonderlijk unavailable paneel | accepted | SSR aanwezig | HYD-160 PR/repository read-model |
| Copilot/proposal section | unavailable by source | geen fictief advies of mutatiepad | accepted | SSR aanwezig | HYD-160 + expliciete proposalbron |

Eindconclusie: **structurally accepted, functionally source-blocked** voor HYD-160-data; lokale projectdetailnavigatie wacht op browseracceptance.

## Acceptance defects and fixes

- Verwijderd: statische claims `AI SYNC: FACTUAL` en `Proposal service: unavailable` in de topbar.
- Gecorrigeerd: briefingfacts en unknowns werden visueel als directives behandeld. Highlight-cards tonen nu alleen feitelijke `FACT`-items; unknowns blijven apart.
- Toegevoegd: expliciete unavailable states wanneer briefing-, proposal-, projectregistry- of assetbronnen falen. Fouten worden niet langer als lege data gepresenteerd.
- Behouden: alle expliciete `Unavailable by source` blocks; geen fake telemetry, Linear-data, AI-output of automatische mutatie toegevoegd.
