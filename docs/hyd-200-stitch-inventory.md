# HYD-200 — Stitch inventory

Bron: Stitch-project `Personal Life OS Dashboard` (`projects/12179133354896504656`), gesynchroniseerd op 2026-09-05. Alle zeven Stitch-items zijn opgehaald. Zes beschikbare screenshots zijn visueel gecontroleerd; vijf HTML-bronnen en de logo-SVG zijn geïnspecteerd. `Cortex Command Dashboard` heeft geen screenshot in Stitch; de HTML-bron is wel opgehaald. Het portret heeft geen HTML-bron. De portret- en logo-items zijn assets, geen pagina's.

## Stitch-bronnen

| Stitch screen | Screen-id | Bedoelde functie | Mission Control-route/component | API/databron | Status | Frontend-aanpassing | Backend/datamodel | Vervolgissue |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cortex Command Dashboard | `fa736b2bc0c64b8ca89e8f7e7505421d` | Primary Today/Cortex-overzicht | `/` — `frontend/app/page.tsx` | `/api/cortex/today` | matched | Geen; HYD-197 implementeerde deze shell en read-model. | Geen | — |
| Executive Daily Briefing | `ac094dab28a6466098350becb0572507` | Dagbrief met feiten, voorstellen en status | `/briefings` — `frontend/app/briefings/page.tsx` | `/api/briefings`, `/api/briefing-proposals` | matched | Dichte Stitch-panel-layout geïmplementeerd; feiten/voorstellen blijven gescheiden. | Geen; bestaande read API volstaat. | — |
| Idea Incubator & Second Brain | `bb4c8d68c24c4d18b8ff19dd274a7a3b` | Capture, triage en knowledge-workflow | Nog geen werkende browserroute; huidige `/unavailable/notes` is placeholder | Stream-entry API bestaat, maar vereist paired-device owner-auth | missing in Mission Control | Geen fictieve capture/AI-acties bouwen. | Browser-auth/paired-device session plus veilige read-model voor entries nodig. | Nieuw BCC-Second-Brain issue |
| Homelab & Infra Telemetry | `67701329476240429af185a0d31d6a38` | Read-only homelab-status en handmatige assets | `/homelab` — `frontend/app/homelab/page.tsx` | `/api/homelab`, `/api/assets` | matched | Stitch-panelgrid, statusbadges en responsive resource/asset-cards geïmplementeerd. | Geen; detailtelemetrie blijft expliciet onbekend. | — |
| Linear & Projects Tracker | `fcabbedcf2874d47af933f92740f7b4b` | Projectoverzicht en werkstatus | `/projects` — `frontend/app/projects/page.tsx` | `/api/projects` | matched | Dicht projectboard met bestaande projectdata geïmplementeerd; geen verzonnen issues/PR's. | Geen voor basisoverzicht. Volledige Linear-workitems ontbreken. | Nieuw Linear read-model issue |
| Cortex Command AI Logo | `c72282ad7c2f4b799bcbba52200e17e4` | Shell-brand asset | `frontend/app/layout.tsx` | Statische Stitch SVG | matched | Stitch-logo in bestaande Cortex-shell gebruikt. | Geen | — |
| Professional studio headshot portrait… | `43eec5bc8d934f6b8f434658e568f302` | Voorbeeldprofielasset | Geen | Statische gegenereerde afbeelding | obsolete/retire | Niet als gebruikersidentiteit gebruiken zonder expliciete keuze/asset. Niet verwijderen. | Geen | — |

## Huidige Mission Control-routes

Dit zijn alle 19 actuele `page.tsx`-routepatronen. Dynamische detail-, form- en unavailable-subflows staan afzonderlijk in de lijst.

| Route | Huidige component/page | API/databron | Stitch-koppeling | Status | Nodige actie |
| --- | --- | --- | --- | --- | --- |
| `/` | `frontend/app/page.tsx` | `/api/cortex/today` | Cortex Command Dashboard | matched | Behouden; HYD-197 niet opnieuw openen. |
| `/actions` | `frontend/app/actions/page.tsx` | `/api/actions` | — | no Stitch design | Functionaliteit behouden. |
| `/actions/new` | `frontend/app/actions/new/page.tsx` | `POST /api/actions` via `ActionForm` | — | no Stitch design | Functionaliteit behouden. |
| `/actions/[id]` | `frontend/app/actions/[id]/page.tsx` | `/api/actions/{id}`, `PATCH /api/actions/{id}` | — | no Stitch design | Functionaliteit behouden. |
| `/agenda` | `frontend/app/agenda/page.tsx` | `/api/calendar/schedule` | — | no Stitch design | Functionaliteit behouden; ICS blijft read-only. |
| `/briefings` | `frontend/app/briefings/page.tsx` | `/api/briefings`, `/api/briefing-proposals` | Executive Daily Briefing | matched | Stitch-layout toegepast zonder HYD-199 proposal-scope uit te breiden. |
| `/codex-runs/new` | `frontend/app/codex-runs/new/page.tsx` | `POST /api/codex-runs` via bestaande form | — | no Stitch design | Functionaliteit behouden; geen nieuwe Codex bridge. |
| `/health` | `frontend/app/health/page.tsx` | `/api/health/weights`, `/api/health/activities` | — | no Stitch design | Functionaliteit behouden; geen verzonnen vitals. |
| `/homelab` | `frontend/app/homelab/page.tsx` | `/api/homelab`, `/api/assets` | Homelab & Infra Telemetry | matched | Stitch-layout met feitelijke resource- en assetdata. |
| `/homelab/new` | `frontend/app/homelab/new/page.tsx` | `POST /api/assets` via `AssetForm` | — | no Stitch design | Functionaliteit behouden. |
| `/homelab/[id]` | `frontend/app/homelab/[id]/page.tsx` | `/api/assets/{id}`, `PATCH /api/assets/{id}` | — | no Stitch design | Functionaliteit behouden. |
| `/projects` | `frontend/app/projects/page.tsx` | `/api/projects` | Linear & Projects Tracker | matched | Stitch-projectboard met lokale projects; Linear items blijven onbekend. |
| `/projects/new` | `frontend/app/projects/new/page.tsx` | `POST /api/projects` via `ProjectForm` | — | no Stitch design | Functionaliteit behouden. |
| `/projects/[slug]` | `frontend/app/projects/[slug]/page.tsx` | project-, status-card- en Codex-run APIs | — | no Stitch design | Functionaliteit behouden. |
| `/routines` | `frontend/app/routines/page.tsx` | `/api/routines` en completion APIs | — | no Stitch design | Functionaliteit behouden. |
| `/status-cards` | `frontend/app/status-cards/page.tsx` | `/api/status-cards` | — | no Stitch design | Functionaliteit behouden. |
| `/status-cards/new` | `frontend/app/status-cards/new/page.tsx` | `POST /api/status-cards` via `StatusCardForm` | — | no Stitch design | Functionaliteit behouden. |
| `/status-cards/[id]` | `frontend/app/status-cards/[id]/page.tsx` | `/api/status-cards/{id}`, action creation | — | no Stitch design | Functionaliteit behouden. |
| `/unavailable/[area]` | `frontend/app/unavailable/[area]/page.tsx` | Geen | Idea Incubator voor `notes`; settings heeft geen Stitch-bron | missing in Mission Control | Placeholder voor notes pas vervangen na veilige browser capability; `settings` blijft bestaande no-Stitch subflow. |

## Scope en compatibiliteit

Eindmapping: Stitch-items: `matched` 5, `needs implementation` 0, `missing in Mission Control` 1, `no Stitch design` 0, `obsolete/retire` 1. Routepatronen: `matched` 4, `needs implementation` 0, `missing in Mission Control` 1, `no Stitch design` 14, `obsolete/retire` 0.

- Geen legacy-route/component wordt verwijderd. Vervanging wordt pas een retire-actie onder HYD-198.
- Stitch vermeldt fictieve model-, telemetry-, issue- en healthwaarden. Deze worden niet overgenomen. Ontbrekende data krijgt een expliciete `Unknown`/onbeschikbaarstaat.
- De bestaande briefing-proposal endpoints blijven ongewijzigd. HYD-199 krijgt geen nieuwe bridge of mutatiepad.
- Voor de volledige Linear tracker ontbreken actuele issue-, PR-, cycle- en activity-read-models. HYD-200 toont uitsluitend bestaande lokale projectgegevens.
- Geen bestaande route wordt nu `obsolete/retire`: de drie ontworpen routes zijn in-place vervangen. Het Stitch-portret is wel een retire-candidate als asset, omdat het geen geverifieerde gebruikersidentiteit is.
- `.stitch/` is lokale Stitch-downloadcache en wordt niet gecommit; hij kan private download-URL's en auteursrechtelijk bronmateriaal bevatten. `scripts/fetch-stitch.sh` is een generieke, gedownloade licentie-helper en geen noodzakelijke Mission Control-tool; hij blijft daarom ontracked.
