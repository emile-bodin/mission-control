import Link from "next/link";
import { CortexCoprocessor, type CoprocessorAvailability } from "./cortex-coprocessor";
import { CortexPanel } from "./cortex-panel";

type StatusCard = { id: string; title: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; next_safe_step: string; resolved_at: string | null };
type Action = { id: string; title: string; status: "Open" | "Bezig" | "Klaar" | "Later"; priority: string; due_date: string | null; updated_at: string };
type CalendarEvent = { starts_at: string; summary: string };
type Schedule = { status: string; events: CalendarEvent[] };
type Project = { slug: string; display_name: string; status: string; personal_status: string };
type PulseResource = { id: string; name: string; type: string; status: string };
type Homelab = { available: boolean; resources: PulseResource[] };
type Weight = { id: string; measured_at: string; normalized_kg: number };
type Activity = { id: string; activity_type: string; started_at: string; duration_seconds: number | null };
type Briefing = { status: string; briefing: { summary: string; facts: string[]; unknowns: string[] } | null; validation_error: string | null };
type CortexToday = {
  briefing: Briefing | null;
  projects: Project[];
  status_cards: StatusCard[];
  actions: Action[];
  homelab: Homelab;
  chrono: { calendar_status: string; items: Array<{ kind: string; starts_at?: string; summary?: string }> };
  health: { weights: Weight[]; activities: Activity[] };
  capabilities: Record<string, { state: string; reason: string }>;
};

export const dynamic = "force-dynamic";

const backend = "http://backend:8000";

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(`${backend}${path}`, { cache: "no-store" });
    return response.ok ? await response.json() : fallback;
  } catch {
    return fallback;
  }
}

export default async function TodayPage() {
  const cortex = await getJson<CortexToday | null>("/api/cortex/today", null);
  const coprocessor = await getJson<CoprocessorAvailability>("/api/cortex/coprocessor", { state: "unavailable", reason: "Codex proposal-service is niet beschikbaar." });
  const cards = cortex?.status_cards ?? [];
  const actions = cortex?.actions ?? [];
  const schedule: Schedule = {
    status: cortex?.chrono.calendar_status ?? "Onbekend",
    events: cortex?.chrono.items.flatMap((item) => item.kind === "calendar" && item.starts_at && item.summary ? [{ starts_at: item.starts_at, summary: item.summary }] : []) ?? []
  };
  const projects = cortex?.projects ?? [];
  const homelab = cortex?.homelab ?? { available: false, resources: [] };
  const weights = cortex?.health.weights ?? [];
  const activities = cortex?.health.activities ?? [];
  const briefing = cortex?.briefing?.briefing;
  const streamDock = cortex?.capabilities.stream_dock;

  const openActions = actions.filter((action) => action.status !== "Klaar").sort(compareActions);
  const nextEvents = schedule.events.filter((event) => new Date(event.starts_at) >= new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4);
  const openCards = cards.filter((card) => !card.resolved_at);
  const activeProjects = projects.filter((project) => isActive(project.status) || isActive(project.personal_status)).slice(0, 3);
  const latestWeight = weights[0];
  const latestActivity = activities[0];
  const pulseOnline = homelab.resources.filter((resource) => resource.status.toLowerCase() === "online").length;
  const dataAvailable = schedule.status === "Beschikbaar" || homelab.available || Boolean(latestWeight || latestActivity);

  return (
    <main className="mx-auto max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop md:pb-space-3xl" aria-label="Vandaag">
        <section className="relative overflow-hidden rounded-xl border border-surface-container-high bg-surface-container p-space-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] xl:p-space-lg" aria-labelledby="daily-brief-title">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top_left,rgba(76,215,246,0.16),transparent_55%)]" aria-hidden="true" />
          <div className="relative flex flex-col gap-space-lg xl:flex-row xl:items-stretch">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-space-xs font-mono text-mono-data-sm text-primary"><span className="material-symbols-outlined text-[16px]" aria-hidden="true">auto_awesome</span>VANDAAGSE BRIEF</div>
              <h1 className="mt-space-sm font-headline text-headline-xl text-on-surface" id="daily-brief-title">Vandaag, Emile.</h1>
              <p className="mt-space-xs text-sm text-on-surface-variant">{briefing?.summary ?? "Geen geldige dagbriefing beschikbaar. Overzicht toont alleen beschikbare bronnen."}</p>
              <section className="mt-space-lg grid gap-space-sm lg:grid-cols-3" aria-label="Autonome directives">
                <BriefItem icon="auto_awesome" title={briefing ? "Briefing beschikbaar" : "Briefing: Unknown"} detail={briefing?.facts[0] ?? "Geen gevalideerde briefingfeiten."} tone="primary" />
                <BriefItem icon="calendar_today" title={nextEvents.length ? `${nextEvents.length} komende afspraken` : "Agenda: geen afspraken"} detail={nextEvents[0] ? `${formatClock(nextEvents[0].starts_at)} · ${nextEvents[0].summary}` : calendarLabel(schedule.status)} tone="secondary" />
                <BriefItem icon="checklist" title={openActions.length ? `${openActions.length} open work-items` : "Geen open work-items"} detail={openActions[0]?.title ?? openCards[0]?.next_safe_step ?? "Geen open actie of statuskaart bekend."} tone="tertiary" />
              </section>
            </div>
            <div className="flex flex-row gap-space-sm xl:w-60 xl:flex-col">
              <Link className="cortex-focus flex flex-1 items-center justify-center gap-space-xs rounded bg-primary px-space-base py-space-sm font-headline text-headline-sm text-on-primary shadow-[0_0_15px_rgba(76,215,246,0.35)]" href="/actions/new"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>Nieuwe taak</Link>
              <Link className="cortex-focus flex flex-1 items-center justify-center gap-space-xs rounded bg-surface-container-high px-space-base py-space-sm text-body-sm text-on-surface" href="/routines"><span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">play_arrow</span>Routines</Link>
            </div>
          </div>
        </section>

        <section className="mt-space-base grid gap-space-base md:grid-cols-2" aria-label="Workspace en clustercontext">
          <GlanceBar href="/projects" icon="layers" title="Linear workspace" detail={activeProjects.length ? activeProjects.map((project) => project.display_name).join(" · ") : "Lokale projecten: Unknown."} badge={activeProjects.length ? `${activeProjects.length} actief` : "Unavailable by source"} />
          <GlanceBar href="/homelab" icon="dns" title="Cluster telemetry" detail={homelab.available ? `${pulseOnline}/${homelab.resources.length} resources online` : "Pulse status: Unknown."} badge={homelab.available ? "Beschikbaar" : "Unknown"} />
        </section>

        <section className="mt-space-lg grid grid-cols-1 items-start gap-space-lg lg:grid-cols-12">
          <div className="flex flex-col gap-space-base lg:col-span-7">
            <CortexPanel className="p-space-base xl:p-space-lg">
              <PanelHeader icon="calendar_today" title="Chronologische agenda" detail={`${nextEvents.length} BLOKKEN`} action={<Link className="cortex-focus rounded bg-surface-container-high px-space-xs py-space-2xs text-body-sm text-on-surface" href="/agenda">Agenda</Link>} />
              {nextEvents.length ? <div className="relative ml-2 mt-space-base flex flex-col gap-space-md border-l border-surface-container-highest pl-4">{nextEvents.map((event, index) => <AgendaNode active={index === 0} event={event} key={`${event.starts_at}-${event.summary}`} />)}</div> : <EmptyTimeline calendarStatus={schedule.status} />}
              <div className="mt-space-base border-t border-surface-container-highest pt-space-sm">
                <div className="flex items-center justify-between gap-space-sm"><p className="font-label-caps text-label-caps text-outline">Werk-items</p><Link className="cortex-focus text-body-sm text-primary" href="/actions">Alle acties</Link></div>
                {openActions.length ? <ul className="mt-space-sm space-y-space-xs">{openActions.slice(0, 3).map((action) => <li key={action.id}><Link className="cortex-focus flex items-center justify-between gap-space-sm rounded bg-surface-container-low px-space-sm py-space-xs text-body-sm text-on-surface hover:bg-surface-container-high" href={`/actions/${action.id}`}><span className="truncate">{action.title}</span><span className="shrink-0 font-mono text-mono-data-sm text-outline">{action.status}</span></Link></li>)}</ul> : <p className="mt-space-sm text-body-sm text-on-surface-variant">Geen open work-items.</p>}
              </div>
            </CortexPanel>

            <CortexPanel className="p-space-base xl:p-space-lg">
              <PanelHeader icon="psychology" title="Stream Dock & Inname" detail={streamDock?.state.toUpperCase() ?? "UNKNOWN"} />
              <div className="mt-space-base rounded-lg bg-surface-container-low p-space-sm">
                <p className="font-label-caps text-label-caps text-outline">Snelle capture</p>
                <div className="mt-space-xs flex gap-space-sm"><p className="min-w-0 flex-1 py-space-xs text-body-sm text-on-surface-variant">Open Second Brain voor capture met gekoppelde browser-session.</p><Link className="cortex-focus flex shrink-0 items-center rounded bg-primary px-space-sm font-mono text-mono-data-sm text-on-primary" href="/ideas">Open dock</Link></div>
              </div>
              <div className="mt-space-base border-t border-surface-container-highest pt-space-sm"><p className="font-label-caps text-label-caps text-outline">Stream status</p><p className="mt-space-xs text-body-sm text-on-surface-variant">{streamDock?.reason ?? "Unknown: Cortex-data niet beschikbaar."}</p></div>
            </CortexPanel>
          </div>

          <aside className="flex flex-col gap-space-base lg:col-span-5" aria-label="Inspector">
            <CortexPanel className="p-space-base xl:p-space-lg">
              <PanelHeader icon="monitor_heart" title="Health & herstel" detail={latestWeight || latestActivity ? "BESCHIKBAAR" : "UNKNOWN"} />
              <div className="mt-space-base grid gap-space-sm sm:grid-cols-2">
                <MetricCard label="Stappen" value="Unknown" detail="Geen stappenbron" ring />
                <MetricCard label="Activiteit & herstel" value={latestActivity ? formatDuration(latestActivity.duration_seconds) : "Unknown"} detail={latestActivity?.activity_type ?? "Geen activity- of herstelbron"} icon="directions_run" />
                <MetricCard label="Gewicht" value={latestWeight ? `${latestWeight.normalized_kg.toFixed(1)} kg` : "Unknown"} detail={latestWeight ? `Gemeten ${formatShortDate(latestWeight.measured_at)}` : "Geen syncdata"} icon="scale" />
                <MetricCard label="Fasting" value="Unknown" detail="Geen fastingbron" icon="timer" />
              </div>
              <WeightTrend weights={weights.slice(0, 14).reverse()} />
            </CortexPanel>

            <CortexPanel className="p-space-base xl:p-space-lg">
              <CortexCoprocessor availability={coprocessor} />
            </CortexPanel>

            <CortexPanel className="overflow-hidden">
              <div className="border-b border-surface-container-highest px-space-base py-space-sm"><p className="font-label-caps text-label-caps text-outline">Data inspector</p><div className="mt-space-xs flex items-center justify-between"><p className="font-headline text-headline-md text-on-surface">Beschikbare bronnen</p><span className={`flex items-center gap-space-xs font-mono text-mono-data-sm ${dataAvailable ? "text-tertiary" : "text-outline"}`}><span className={`h-1.5 w-1.5 rounded-full ${dataAvailable ? "bg-tertiary" : "bg-outline"}`} />{dataAvailable ? "BESCHIKBAAR" : "UNKNOWN"}</span></div></div>
              <dl className="divide-y divide-surface-container-highest px-space-base"><SourceRow label="Agenda" value={calendarLabel(schedule.status)} /><SourceRow label="Pulse" value={homelab.available ? `${pulseOnline}/${homelab.resources.length} online` : "Unknown"} /><SourceRow label="Health" value={latestWeight || latestActivity ? "Beschikbaar" : "Unknown"} /></dl>
            </CortexPanel>
          </aside>
        </section>
    </main>
  );
}

function PanelHeader({ icon, title, detail, action }: Readonly<{ icon: string; title: string; detail?: string; action?: React.ReactNode }>) {
  return <header className="flex items-center justify-between gap-space-sm"><div className="flex min-w-0 items-center gap-space-sm"><span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">{icon}</span><h2 className="truncate font-headline text-headline-md text-on-surface">{title}</h2>{detail && <span className="hidden rounded bg-surface-container-high px-space-xs py-space-2xs font-mono text-mono-data-sm text-outline sm:inline">{detail}</span>}</div>{action}</header>;
}

function BriefItem({ icon, title, detail, tone }: Readonly<{ icon: string; title: string; detail: string; tone: "primary" | "secondary" | "tertiary" }>) {
  const toneClass = tone === "primary" ? "text-primary" : tone === "secondary" ? "text-secondary-fixed-dim" : "text-tertiary";
  return <article className="rounded-lg bg-surface-container-low p-space-sm"><div className={`flex items-center gap-space-xs font-mono text-mono-data-sm ${toneClass}`}><span className="material-symbols-outlined text-[16px]" aria-hidden="true">{icon}</span>{title}</div><p className="mt-space-xs line-clamp-2 text-body-sm text-on-surface-variant">{detail}</p></article>;
}

function GlanceBar({ href, icon, title, detail, badge }: Readonly<{ href: string; icon: string; title: string; detail: string; badge: string }>) {
  return <Link className="cortex-focus cortex-panel flex items-center justify-between gap-space-base rounded-xl px-space-base py-space-sm hover:bg-surface-container-high" href={href}><div className="flex min-w-0 items-center gap-space-sm"><span className="material-symbols-outlined text-primary" aria-hidden="true">{icon}</span><span className="min-w-0"><span className="block font-headline text-headline-sm text-on-surface">{title}</span><span className="block truncate text-body-sm text-on-surface-variant">{detail}</span></span></div><span className="shrink-0 rounded bg-surface-container-high px-space-xs py-space-2xs font-mono text-mono-data-sm text-outline">{badge}</span></Link>;
}

function AgendaNode({ event, active }: Readonly<{ event: CalendarEvent; active: boolean }>) {
  return <article className={`relative rounded-lg p-space-sm ${active ? "bg-surface-container-high shadow-[inset_2px_0_0_0_#4cd7f6]" : "bg-surface-container-low"}`}><span className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-surface-container ${active ? "bg-primary shadow-[0_0_8px_rgba(76,215,246,0.8)]" : "bg-outline"}`} aria-hidden="true" /><div className="flex items-center justify-between gap-space-sm"><time className={`font-mono text-mono-data-sm ${active ? "text-primary" : "text-on-surface-variant"}`}>{formatClock(event.starts_at)}</time><span className="rounded bg-surface-container-highest px-space-xs py-space-2xs font-mono text-mono-data-sm text-outline">Agenda</span></div><h3 className="mt-space-xs font-headline text-headline-sm text-on-surface">{event.summary}</h3><p className="mt-space-2xs text-body-sm text-on-surface-variant">{formatDate(event.starts_at)}</p></article>;
}

function EmptyTimeline({ calendarStatus }: Readonly<{ calendarStatus: string }>) {
  return <div className="mt-space-base rounded-lg border border-dashed border-surface-container-highest p-space-base text-body-sm text-on-surface-variant"><p className="font-headline text-headline-sm text-on-surface">Geen komende afspraken</p><p className="mt-space-xs">{calendarLabel(calendarStatus)}</p></div>;
}

function MetricCard({ label, value, detail, icon, ring = false }: Readonly<{ label: string; value: string; detail: string; icon?: string; ring?: boolean }>) {
  return <article className="flex min-h-36 flex-col justify-between rounded-lg bg-surface-container-low p-space-sm"><div className="flex items-center justify-between gap-space-sm"><span className="font-label-caps text-label-caps text-outline">{label}</span>{icon && <span className="material-symbols-outlined text-[18px] text-primary" aria-hidden="true">{icon}</span>}</div><div className="flex items-end justify-between gap-space-sm"><div><p className="font-mono text-mono-metric-lg text-on-surface">{value}</p><p className="mt-space-2xs font-mono text-mono-data-sm text-outline">{detail}</p></div>{ring && <EmptyRing />}</div></article>;
}

function EmptyRing() {
  return <div className="relative h-16 w-16 shrink-0"><svg className="h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true"><path className="text-surface-container-highest" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3.5" /></svg><span className="absolute inset-0 grid place-items-center font-mono text-mono-data-sm text-outline">—</span></div>;
}

function WeightTrend({ weights }: Readonly<{ weights: Weight[] }>) {
  if (weights.length < 2) return <div className="mt-space-base border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline">Gewichtstrend: Unknown — minimaal twee metingen nodig.</div>;
  const values = weights.map((weight) => weight.normalized_kg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${90 - ((value - min) / range) * 65}`).join(" ");
  return <figure className="mt-space-base border-t border-surface-container-highest pt-space-sm"><figcaption className="flex justify-between font-mono text-mono-data-sm text-outline"><span>GEWICHTSTREND</span><span>{min.toFixed(1)}–{max.toFixed(1)} kg</span></figcaption><svg className="mt-space-sm h-16 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gewichtstrend van beschikbare metingen"><path d="M0 90H100" stroke="currentColor" className="text-surface-container-highest" strokeWidth="1" vectorEffect="non-scaling-stroke" /><polyline points={points} fill="none" stroke="currentColor" className="text-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></figure>;
}

function SourceRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return <div className="flex items-center justify-between gap-space-base py-space-sm"><dt className="font-mono text-mono-data-sm text-outline">{label}</dt><dd className="text-right font-mono text-mono-data-sm text-on-surface-variant">{value}</dd></div>;
}

function compareActions(a: Action, b: Action) { return (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31") || a.updated_at.localeCompare(b.updated_at); }
function isActive(value: string) { return value.toLowerCase() === "active"; }
function calendarLabel(status: string) { return status === "Beschikbaar" ? "Agenda beschikbaar" : "Agenda: Unknown"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatClock(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatDuration(value: number | null) { return value === null ? "Unknown" : `${Math.max(0, Math.round(value / 60))} min`; }
