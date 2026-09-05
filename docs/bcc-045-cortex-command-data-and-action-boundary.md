# BCC-045 — Cortex Command Dashboard: data- en actiegrens

Status: implementatiemapping voor HYD-195. Geen dashboard-UI of productdata toegevoegd.

## Bronnen en uitgangspunten

- Visuele en functionele doeltoestand: Stitch `Personal Life OS Dashboard`, screen `projects/12179133354896504656/screens/fa736b2bc0c64b8ca89e8f7e7505421d` (`Cortex Command Dashboard`, desktop, 1280×1024).
- Technische vertrekpunt: huidige Mission Control-bron op commit `02b0101`.
- De concrete waarden in Stitch zijn ontwerpinhoud, geen productdata. Deze mapping geeft die waarden nooit uit als bestaande feiten.
- Producttijdzone blijft `Europe/Amsterdam`. Dit geldt voor kalenderblokken, routine-dagen, health-timestamps en alle afgeleide lokale tijden.
- Google Calendar en Pulse blijven read-only. AI produceert voorstellen; geen automatische domein- of externe mutaties.

Legenda in tabellen:

- **Bruikbaar**: huidige data/actie kan zonder semantische vervalsing worden gebruikt.
- **Aanpassen**: bestaande bron bestaat, maar respons of presentatie mist velden/gedrag.
- **Additief**: nieuw schermspecifiek read-model of uitbreiding naast bestaande contracten.
- **Nieuw backend/API**: geen passend bestaand persistent of HTTP-contract.
- **Unavailable**: nu geen feitelijke bron of veilige actie. Toon `Unknown` of disabled met reden, niet een Stitch-voorbeeldwaarde.

## Bewezen huidige basis

| Gebied | Huidige bron | Feitelijke grens |
| --- | --- | --- |
| Vandaag | `frontend/app/page.tsx` laadt statuskaarten, acties, kalender, projecten, Pulse, gewicht en activiteiten parallel met `cache: "no-store"`. | Bestaand dashboard bevat geen Cortex-read-model of ingestie. Het toont statische, afgeleide inzichten; geen AI-resultaat. |
| Dagbriefing | `backend/app/briefings.py`; `GET /api/briefings`, `POST /api/briefings/refresh`, `GET /api/briefing-proposals`, accept/reject-routes; `frontend/app/briefings/*`. | Output is schema-gevalideerd, feiten/voorstellen/unknowns gescheiden. Voorstellen raken precies één bestaand action- of routine-record, pas na expliciete acceptatie. |
| Agenda | `GET /api/calendar/schedule` in `backend/app/main.py`; `frontend/app/agenda/page.tsx`. | Google ICS is read-only. Respons bevat alleen `status`, `starts_at`, `summary`; geen eindtijd, gasten, attachments, video-link of write-actie. UTC-ICS wordt naar `Europe/Amsterdam` geconverteerd. |
| Projecten/status | `projects`, `status_cards`, `/api/projects`, `/api/status-cards`, `/api/projects/{slug}/status-cards`. | Projectmetadata heeft optionele Linear-velden, maar geen live Linear-sync, PR's, sprint- of issue-tellingen. |
| Homelab | `backend/app/pulse.py`, `GET /api/homelab`; `frontend/app/homelab/page.tsx`. | Pulse levert resource-status en beperkte Docker-hostsamenvatting (containers, uptime, CPU); geen GPU, storage-pool, k3s- of node-telemetrie in het huidige API-contract. |
| Taken en routines | `/api/actions` en `/api/routines`; forms in `frontend/app/actions/*` en `frontend/app/routines/page.tsx`. | Action CRUD bestaat. Routine-complete/uncomplete bestaat per routine en lokale occurrence-datum; geen scheduler die een vrij tekstcommando uitvoert. |
| Health | `/api/health/weights`, `/api/health/activities`, Android Health Connect-sync. | Actieve scope is gewicht en activiteit. Geen stappen, slaap, recovery/readiness, hartslag of fasting-bron. Android gebruikt HTTPS, device tokens worden gehasht opgeslagen en de app-formattering gebruikt `Europe/Amsterdam`. |
| Codex/Coprocessor | `CodexRuntime` in `backend/app/briefings.py`; `frontend/app/codex-runs/codex-run-form.tsx`. | Runtime dient alleen dagbriefing en retourneert geen modeltelemetrie. De form post naar `/api/codex-runs`, maar er bestaat geen overeenkomstige backendroute of tabel: dit is geen bruikbare inspector-functie. |

## Stitch-mapping

| Stitch-element / interactie | Gewenste functie | Huidige bron/API/model | Bruikbaar | Aanpassen | Additief | Nieuw backend/API | Unavailable nu |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `Workspace Root`, versie, AI-sync, latency, lokaal-modelbadge | Werkruimte-identiteit en actuele integratiestatus. | Alleen vaste product-shell in `frontend/app/layout.tsx`; geen versie-, runtime- of latency-contract. | — | — | — | Ja: alleen feitelijke service-statussen. | Ja voor modelnaam, latency en sync als geen meetbare bron is geconfigureerd. |
| `Daily Brief Ready` | Open recente briefing plus runstatus. | `GET /api/briefings`; `/briefings` leest laatste run. | Ja | Voeg link/status toe aan nieuw dashboard-read-model. | — | — | `Ready` alleen wanneer laatste run dat bewijst; anders echte status/`Unknown`. |
| `Idea Incubator 7` | Open ingediende ideeën met teller. | Navigatie wijst notities naar `/unavailable/notes`; geen notitie/idee-model. | — | — | — | Ja: intake/triage-model. | Ja, teller en ideeën bestaan niet. |
| `Linear & Projects 12` | Projectcontext met eventueel externe werkitems. | `GET /api/projects`; projectmodel bevat optionele Linear-metadata. | De lokale projectkaart. | Maak teller alleen uit lokale, bewezen records. | Read-model kan projecten + statuskaarten groeperen. | Alleen voor een expliciet geautoriseerde, read-only Linear-bron. | Live Linear-count, sprint en PR-status. Geen Linear-call in browser of via MCP. |
| `Homelab Infra 4/4` | Samengevatte Pulse-status. | `GET /api/homelab`: resources, docker_hosts, `last_updated_at`. | Resource-count/status en Docker CPU/uptime waar beschikbaar. | Frontend moet `available`, `last_updated_at` en onbekende velden tonen. | Optionele homelab-card DTO. | Alleen voor additionele Pulse-velden. | GPU, vrije storage-pool, k3s-gezondheid en node-count als Pulse ze niet feitelijk levert. |
| `Settings`, `API Keys` | Instellingen- en credentialbeheer. | `/unavailable/settings`; geen API-key UI/API. | — | — | — | Ja, maar alleen als afzonderlijk security-issue. | Ja. Secrets nooit via dashboard of browser tonen. |
| Header zoek-/promptveld, `⌘K` | Zoeken in lokale context of expliciete coprocessor-vraag. | Geen zoekindex, gesprekmodel of endpoint. | — | — | — | Ja: read-only search/query-contract met broncitaten. | Ja. Geen AI-actie of extern systeemcommando. |
| Notificatieknop | Toon echte lokale notificaties. | Geen notificatiemodel, pushservice of inbox. | — | — | — | Ja. | Ja. Niet als ongelezen aantal faken. |
| Autonome brief: samenvatting, directives, facts, unknowns | Recente feitelijke briefing als reviewbaar blok. | `BriefingOutput(summary, facts, proposals, unknowns)`; `GET /api/briefings`. | Ja | Projecteer briefing in dashboard; behoud exacte runstatus en `validation_error`. | Eén read-only `today/cortex` DTO kan briefing naast andere feiten laden. | — | Als geen geldige briefing bestaat: lege/`Unknown` toestand, geen synthesetekst. |
| `Execute Routine` | Start of completeer gekozen routine-occurrence. | `POST /api/routines/{routine_id}/complete`; due-routines bestaat. | Ja, na expliciete routinekeuze en bevestiging. | UI moet concrete routine, lokale occurrence-datum en uitkomst tonen. | Dashboard kan due-routines lezen. | Niet nodig voor een expliciete complete-actie. | Vrije "routine uitvoeren" zonder target; geen automatische follow-up acties. |
| `Ask AI Followup` | Vraag over briefingcontext, zonder mutatie. | Geen conversatie-/follow-up-contract. | — | — | — | Ja: proposal-only query/runs met bronselectie en status. | Ja tot prompt, runtime, retention en reviewcontract bestaan. |
| `Auto-Block` | Agenda-focusblok aanmaken. | Agenda-integratie is ICS read-only; geen kalender-write API. | — | — | — | Ja, maar alleen met nieuwe expliciete write-integratie en consent. | Ja. Disabled met "Agenda is read-only". |
| Projectkaart: naam, sprint, team, PR-count, urgent-count | Geprioriteerde projectcontext. | `projects` en open `status_cards`; geen sprint/PR/issue-feed. | Naam, lokale status en statuskaart-urgentie. | Gebruik bestaande statuswaarden, geen kunstmatige voortgang. | Aggregeer project + statuskaart + acties veilig per project. | Alleen voor nieuwe projectmetrics of externe read-only bron. | Sprint, PR's, "urgent"-teller zonder lokale definitie/brongegevens. |
| Homelabkaart: clusternaam, nodes, GPU, VRAM, storage | Operationele homelabcontext. | Pulse resources + docker-host CPU/uptime/containers. | Resource- en Docker-status. | Kaart moet bron/tijdstempel tonen. | DTO voor huidige Pulse-velden. | Alleen als Pulse-gecontracteerde metrics beschikbaar worden gemaakt. | GPU/VRAM, storage-pool en clusterclaims. |
| `Today's Chrono Stream`, eventblokken en `+` | Tijdlijn van agenda en optioneel lokale routines/taken. | Calendar response heeft alleen starttijd en samenvatting; due-routines en actions bestaan apart. | Agenda starttijd/titel en due-routines als afzonderlijke categorie. | Breid kalenderparser/respons uit met `ends_at` wanneer ICS dat feitelijk bevat. | Nieuwe chronologische read-model merge, met `source` en `availability`. | Ja voor lokale stream-records of veilige eventmetadata buiten ICS. | Attendees, meeting-link, attachment, focus-lock en AI-gegenereerde agenda-claims. |
| Chrono `Inspect` | Inspecteer bron, tijd, status en gerelateerde lokale context. | Geen event-id of detailroute; alleen calendar summary/start. | — | Kalenderobject moet stabiele id + bronmetadata krijgen. | Inspector kan bekende action/routine/project/statuskaart tonen. | Ja voor agenda-detail/normalisatie en cross-source linkmodel. | Inspectie van attachment/RFC/AI-output zonder opgeslagen bron. |
| Stream Dock tekstveld + `Ingest` | Sla expliciet ingevoerde tekst op als ongetriagde intake. | Geen intake-tabel of route. | — | — | — | Ja: `stream_entries` en `POST /api/stream-entries`. | Nee na invoering; vóór die tijd moet knop disabled zijn. |
| `Snippet` | Zelfde intake met type `snippet`; geen uitvoeren. | Geen model/route. | — | — | — | Ja, als variant van `stream_entries`. | Geen code-uitvoering, secret-extractie of automatische repo-actie. |
| `Quick Task` | Maak expliciete task of bewaar concept. | `POST /api/actions` bestaat. | Ja voor directe, bevestigde action met volledige verplichte velden. | Formulier vereist nu type/priority; dashboard moet die veilig vragen of als concept opslaan. | Intake kan na expliciete bevestiging een proposal voor `ActionInput` maken. | Alleen voor concept/triage-flow; directe action-route bestaat. | Automatische taakcreatie uit vrije tekst zonder bevestiging. |
| `Voice Dictate` / voice-reference | Bewaar gebruikersreferentie naar voice-item, niet stilzwijgend audio/transcript. | Browserbeleid zet `microphone=()` in `frontend/next.config.mjs`; geen audio-opslag of Android voice-contract. | — | Alleen een expliciet gekozen bestaande referentie kan later getoond worden. | Type `voice_reference` in intake, met label/URI-hash en toestemmingstatus. | Ja voor veilige referentievalidatie; audio-upload/transcript is aparte scope. | Browserdictatie en audio-opname. |
| `Recently Triaged Feed` | Toon intake-items met expliciete triagestatus/proposal. | Briefingproposals zijn alleen action/routine-mutatievoorstellen, geen intakefeed. | Briefingproposal-statuspatroon. | Houd briefing- en intake-proposals aparte domeinen. | `stream_entries` plus `triage_proposals` read-model. | Ja. | Vector-search, automatische classificatie en verzonnen tags/resultaten. |
| `Bio-Vitals & Recovery`: gewicht/body mass | Laatste gemeten gewicht en trend. | `GET /api/health/weights`, `health_weights`; dashboard heeft al trend. | Ja | Formatteer lokale meettijd; geen "synced N min" zonder sync-record. | Dashboard DTO mag 7-daagse trend berekenen. | — | Gewichtsdoel/baseline als niet door gebruiker opgeslagen. |
| `Bio-Vitals & Recovery`: activiteit | Laatste activiteit en duur. | `GET /api/health/activities`, `health_activities`. | Ja | Gebruik feitelijke activity-type, start en duur. | Dashboard DTO mag samenvatten zonder medische interpretatie. | — | Recovery-/HR-zone-doel als niet gesynchroniseerd. |
| Stappen, slaapscore/fasen, readiness, fasting/autophagy | Health-overzicht. | Geen velden of toegestane health-scope; huidige Android-sync beperkt zich tot gewicht en activiteit. | — | — | — | Alleen na apart scope-, permission- en datamodelbesluit. | Ja. Niet implementeren als nulwaarde of wellness-inferentie. |
| `Core Coprocessor`: model, tokens/s, VRAM, active state | Inspecteer aantoonbare lokale coprocessor-run of runtime. | Dagbriefing `CodexRuntime` heeft alleen request/resultaat; geen metriekroute. `codex-runs` frontend form heeft geen backendroute. | Briefing runstatus en validation error. | Verwijder/markeer ongekoppelde Codex-run form tot endpoint bestaat. | Read-only inspector DTO voor werkelijk gemeten runmetadata. | Ja voor runtime-adapter, meetwaarden en persisted run-records. | Model-instance, GPU/VRAM, tokens/s en "active" zonder lokale meetbron. |

## Benodigde contracten voor latere implementatie

### 1. Read-model voor Cortex

Geen UI-implementatie in HYD-195. HYD-197 kan een `GET /api/cortex/today` toevoegen die uitsluitend reeds beschikbare feiten normaliseert:

- `generated_at` als UTC ISO-8601 en presentatie in `Europe/Amsterdam`;
- `briefing`: laatste run of `null`, inclusief `status`, `finished_at`, `validation_error`, feiten, unknowns en voorstel-samenvattingen;
- `projects`: lokale projectvelden plus afleidbare tellingen van lokale statuskaarten/acties, telkens met bron;
- `homelab`: exact de bestaande Pulsevelden en `available`/`last_updated_at`;
- `chrono`: alleen agenda `starts_at`/`summary` en als aparte records due-routines/open acties totdat broncontracten rijker zijn;
- `health`: weight/activities, met ontbrekende categorieën expliciet `Unavailable` in plaats van numerieke placeholders;
- `capabilities`: server-berekende boolean en reden voor ingestie, routine-complete, calendar-write, voice-capture en coprocessor-inspector.

Dit endpoint mag geen Linear-, agenda-, Pulse-, health- of AI-mutatie uitvoeren. Het is een convenience-read-model: bestaande detailroutes blijven de bron van waarheid.

### 2. Stream Dock-inname

Dit is nieuw werk, niet een hernoeming van `actions`.

Voorgesteld minimaal persistent model `stream_entries`:

| Veld | Contract |
| --- | --- |
| `id`, `owner_id`, `created_at`, `updated_at` | Servergegenereerd. `owner_id` is verplicht, zodat toekomstig huishouden-eigenaarschap mogelijk blijft. |
| `kind` | Exact enum: `text`, `snippet`, `quick_task`, `voice_reference`. |
| `content` | Alleen voor text/snippet/quick_task; 1–4.000 tekens, UTF-8, geen getrimde lege waarde. |
| `voice_reference` | Alleen voor `voice_reference`; valideer schema/maximumlengte. Bewaar geen raw audio, transcript, bearer-token of externe credential. |
| `status` | `captured`, `triaged`, `archived`, `deleted`; server schrijft transities. |
| `source_metadata` | Kleine allowlisted JSON-map, maximaal 10 sleutel/waardeparen; geen authorization headers, secret-achtige keys of ongefilterde payloads. |

Benodigde routes: `POST /api/stream-entries`, `GET /api/stream-entries?status=...`, `POST /api/stream-entries/{id}/triage` (maakt alleen een voorstel), en een expliciete delete/archive-actie. Alle mutatiepayloads krijgen Pydantic `extra="forbid"`, parameterized SQL en transactionele auditregels.

Ownership, permissions en retention moeten vóór openbare write-UI expliciet vastliggen:

- Huidige normale browserroutes hebben geen aangetoonde interactieve eigenaar-authenticatie. Een write-route mag daarom niet als internetbrede ingestie worden blootgesteld. Vereist: geauthenticeerde primaire eigenaar, of een afzonderlijke lokale/paired-device trust-boundary.
- Alleen eigenaar kan eigen entries lezen, wijzigen, archiveren of verwijderen; server bepaalt `owner_id` en accepteert hem niet van de browser.
- Retentie is nog geen bestaande productpolicy. Kies en documenteer vóór implementatie een expliciete termijn voor `text`/`snippet`/`quick_task`; voice-references bewaren geen audio en worden bij delete direct verwijderd. Zonder besluit: geen onbeperkte persistentie invoeren.
- Fouten zijn feitelijk: `401/403` eigenaar ontbreekt, `404` onbekend/niet-eigen record, `409` ongeldige statusovergang, `413` payloadgrens, `422` validatie, `503` afhankelijke triage-runtime unavailable. UI bewaart invoer lokaal alleen met zichtbare toestemming en toont geen geslaagde triage bij fout.

### 3. Agenda en acties

- ICS-parser uitbreiden met `ends_at` alleen als `DTEND` aanwezig en parsebaar is; geen tijd invullen wanneer die ontbreekt.
- Houd `calendar_write_available: false` totdat een onafhankelijke write-integratie, consent en auditmodel bestaan.
- `Quick Task` kan bestaande `ActionInput` gebruiken na expliciete gebruikersbevestiging. Voor vrije tekst eerst intake/proposal; er is geen veilige default voor `type`, `priority`, project of due date.
- Routine-complete houdt de bestaande idempotente route en lokale occurrence-regels. Dashboard voert nooit meer dan één gekozen routine uit.

### 4. Coprocessor en inspector

- Een toekomstige inspector leest alleen lokale, geautoriseerde telemetry met timestamp en bronidentiteit. Het voert geen shell, agent, modelprompt of external tool uit.
- Voeg geen modelnaam, throughput, GPU/VRAM, Linear- of CI-status toe zonder adapter die die waarde kan bewijzen.
- Repareer eerst contractmismatch rond `frontend/app/codex-runs/codex-run-form.tsx`: huidige `POST /api/codex-runs` heeft geen backendimplementatie. Kies vervolgens óf een echte audited run-ledger met Pydantic-model/migratie/routes, óf verwijder de dode UI. Dit staat los van Cortex-UI.

## Test- en verificatie-eisen voor latere implementatie

- Backend: uitbreidingen aan `run_migrations()` zijn additief/idempotent; test behoud van bestaande records en alle `stream_entries` validatie-, ownership- en statusovergangen.
- Backend: test `Europe/Amsterdam` voor DST en daggrenzen in `chrono`/routines; behoud bestaande kalender- en routine-tests.
- Backend: test unavailable adapters voor Calendar, Pulse, health en coprocessor. Geen fallback-waarde mag op success of zero lijken.
- Frontend: test disabled CTA's en fouttoestanden; `voice-reference` is geen microfoonopname zolang Permissions-Policy dit blokkeert.
- Frontend: alle browsermutaties blijven relatieve `/api/...` requests; de bestaande Next rewrite is de enige browser-backendroute.
- Checks: `docker compose config`, backend unittest-discovery en `docker compose build frontend` na echte codewijzigingen.

## Afhankelijkheden

De repo en lokale gitgeschiedenis bevatten geen scopebeschrijving voor HYD-196, HYD-197 of HYD-199. Onderstaande zijn dus implementatiecontracten, geen toewijzing van verborgen issue-scope.

| Werkitem | Vereist uit deze mapping |
| --- | --- |
| HYD-196 | Bevestig broncontracten en consent voor eventuele nieuwe externe data: Linear alleen read-only en niet vanuit browser, Calendar-write apart van ICS, en exacte Pulse-metrics. Zonder die bevestiging blijven de corresponderende velden `Unavailable`. |
| HYD-197 | Implementeer eerst read-only `cortex/today` en daarna Stream Dock volgens ownership/validatie/retentie hierboven. Concreet: Pydantic input/outputmodellen, additieve migratie voor intake + audit, relatieve frontend mutations, capability/fouttoestanden, en tests. Bouw geen Cortex-UI op fictieve waarden. |
| HYD-199 | Lever security- en productbesluit voor browser-eigenaar-authenticatie, owner-id-uitgifte, retention en eventuele audio/voice-scope. Zonder dit geen publiek schrijfendpoint, audio-opslag of browsermicrofoonbeleid verruimen. |

## Expliciete statuslijst

Werkt al: lokale acties/routines, projecten/statuskaarten, read-only ICS-agenda, Pulse resource-/Docker-hoststatus, gewicht/activiteit, Android Health Connect-koppeling, dagbriefing met proposal-review en `Europe/Amsterdam`-formatering.

Aanpassen: dashboardplaatsing van briefing, project-/Pulse-/health-read-modellen, agenda eindtijd/id-details, capability/foutpresentatie, en de niet-geïmplementeerde Codex-run form.

Nieuw: Cortex aggregator, Stream Dock-persistency/triage/audit, veilige owner-boundary, agenda-eventdetail, en eventuele coprocessor-telemetry-adapter.

Unavailable: live Linear/PR/sprintdata, agenda-write/autoblock, notities/ideeën, browserdictatie, audio/transcript, stappen/slaap/readiness/fasting, GPU/VRAM/tokens-per-seconde en alle andere Stitch-demowaarden zonder bewijsbare bron.
