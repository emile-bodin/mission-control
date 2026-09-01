import Link from "next/link";
import { LocalClock } from "./local-clock";

type TodayStatus = "available" | "empty" | "partial" | "error" | "not_configured" | "stale" | "unavailable";

type TodayItem = {
  id: string;
  kind: string;
  source: string;
  title: string;
  domain: string | null;
  status: string | null;
  due_date: string | null;
  reminder_time: string | null;
  details: Record<string, unknown>;
};

type TodaySection = {
  status: TodayStatus;
  items: TodayItem[];
  source_status: Record<string, TodayStatus>;
  error: string | null;
};

type TodayView = {
  generated_at: string;
  timezone: string;
  local_date: string;
  sources: Record<string, { status: TodayStatus; item_count: number; error: string | null }>;
  sections: { overdue: TodaySection; today: TodaySection; routines: TodaySection; upcoming: TodaySection; context: TodaySection };
};

const sourceLabels: Record<string, string> = {
  actions: "Acties", calendar: "Agenda", routines: "Routines", health: "Gezondheid", projects: "Projecten", status_cards: "Statuskaarten", homelab: "Homelab"
};

const stateStyles: Record<TodayStatus, string> = {
  available: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  empty: "border-slate-600 bg-slate-800/70 text-slate-300",
  partial: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  error: "border-red-400/35 bg-red-400/10 text-red-200",
  not_configured: "border-violet-400/35 bg-violet-400/10 text-violet-200",
  stale: "border-cyan-400/35 bg-cyan-400/10 text-cyan-200",
  unavailable: "border-orange-400/35 bg-orange-400/10 text-orange-200"
};

const stateLabels: Record<TodayStatus, string> = {
  available: "Beschikbaar", empty: "Leeg", partial: "Gedeeltelijk", error: "Mislukt", not_configured: "Niet ingesteld", stale: "Verouderd", unavailable: "Niet beschikbaar"
};

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  let today: TodayView | null = null;
  let loadError: string | null = null;

  try {
    const response = await fetch("http://backend:8000/api/today", { cache: "no-store" });
    if (!response.ok) loadError = `Today-bron antwoordde met HTTP ${response.status}.`;
    else today = await response.json();
  } catch {
    loadError = "Today-bron is niet bereikbaar.";
  }

  if (!today) return <TodayUnavailable error={loadError ?? "Today-bron gaf geen bruikbare response."} />;

  const administration = today.sections.context.items.filter((item) => item.kind === "action" && item.domain === "administratie");
  const household = today.sections.context.items.filter((item) => item.kind === "action" && item.domain === "huis_gezin");
  const health = today.sections.context.items.filter((item) => item.source === "health");
  const workSignals = today.sections.context.items.filter((item) => item.domain === "project" || ["projects", "homelab"].includes(item.source));

  return <main className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Vandaag</h1><p className="mt-1 text-sm text-slate-400">{formatDate(today.local_date)} · persoonlijke briefing</p></div>
      <div className="text-right"><LocalClock /><p className="mt-1 text-xs text-slate-500">Gegenereerd {formatDateTime(today.generated_at, today.timezone)} · {today.timezone}</p><p className="mt-1 text-xs text-slate-500">Actualiteit volgt bronstatussen; geen lokale stale-beoordeling.</p></div>
    </header>

    <section className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]" aria-label="Dagcontext">
      <Panel title="Briefing" description="Belangrijkste aandachtspunten voor nu." status={today.sections.overdue.status}>
        <ItemList items={today.sections.overdue.items} emptyMessage="Geen urgente aandachtspunten." />
        <SourceStates sourceNames={["actions", "status_cards"]} sources={today.sources} />
      </Panel>
      <Panel title="Agenda en focus" description="Vandaag eerst, daarna komende afspraken en acties." status={today.sections.today.status}>
        <SectionItems label="Vandaag" section={today.sections.today} emptyMessage="Geen agenda- of focusitems voor vandaag." />
        <SectionItems label="Hierna" section={today.sections.upcoming} emptyMessage="Geen komende agenda- of focusitems." />
        <SourceStates sourceNames={["actions", "calendar"]} sources={today.sources} />
      </Panel>
    </section>

    <section className="mt-4" aria-label="Routines">
      <Panel title="Routines" description="Gepland voor vandaag." status={today.sections.routines.status}>
        <ItemList items={today.sections.routines.items} emptyMessage="Geen routines gepland voor vandaag." />
        <SourceStates sourceNames={["routines"]} sources={today.sources} />
      </Panel>
    </section>

    <section className="mt-4 grid gap-4 lg:grid-cols-2" aria-label="Persoonlijke domeinen">
      <Panel title="Administratie" description="Open administratieve context zonder datum." status={today.sources.actions.status}>
        <ItemList items={administration} emptyMessage="Geen administratiesignalen in huidige context." />
        <SourceStates sourceNames={["actions"]} sources={today.sources} />
      </Panel>
      <Panel title="Huis en gezin" description="Open context voor thuis." status={today.sources.actions.status}>
        <ItemList items={household} emptyMessage="Geen huis- of gezinssignalen in huidige context." />
        <SourceStates sourceNames={["actions"]} sources={today.sources} />
      </Panel>
      <Panel title="Gezondheid" description="Recente metingen en activiteiten; geen medische interpretatie." status={today.sources.health.status}>
        <ItemList items={health} emptyMessage="Geen recente gezondheidsgegevens." />
        <SourceStates sourceNames={["health"]} sources={today.sources} />
      </Panel>
      <Panel title="Werk en projectsignalen" description="Projectcontext en expliciete homelab-uitzonderingen." status={today.sections.context.status}>
        <ItemList items={workSignals} emptyMessage="Geen werk- of projectsignalen in huidige context." />
        <SourceStates sourceNames={["actions", "projects", "homelab"]} sources={today.sources} />
      </Panel>
    </section>

    <section className="mt-4" aria-labelledby="bronstatus-title">
      <h2 id="bronstatus-title" className="text-sm font-semibold uppercase tracking-wide text-slate-100">Bronstatussen</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(today.sources).map(([name, source]) => <SourceState key={name} name={name} source={source} />)}</div>
    </section>
  </main>;
}

function TodayUnavailable({ error }: { error: string }) {
  return <main className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-start justify-between gap-5"><div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Vandaag</h1><p className="mt-1 text-sm text-slate-400">Persoonlijke briefing niet beschikbaar.</p></div><LocalClock /></header>
    <section className="mt-5 rounded-lg border border-red-400/35 bg-red-400/10 p-5" aria-labelledby="today-fout-title"><h2 id="today-fout-title" className="text-lg font-semibold text-red-100">Today-bron mislukt</h2><p className="mt-2 text-sm text-red-100">{error}</p><p className="mt-2 text-sm text-slate-300">Geen oude of lege data getoond.</p></section>
  </main>;
}

function Panel({ title, description, status, children }: { title: string; description: string; status: TodayStatus; children: React.ReactNode }) {
  return <section className="h-full rounded-lg border border-slate-800 bg-[#0c121c]/80 p-4">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></div><StateBadge status={status} /></header>
    <div className="mt-4">{children}</div>
  </section>;
}

function SectionItems({ label, section, emptyMessage }: { label: string; section: TodaySection; emptyMessage: string }) {
  return <div className="mt-4 first:mt-0"><div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-slate-200">{label}</h3><StateBadge status={section.status} /></div><div className="mt-2"><ItemList items={section.items} emptyMessage={emptyMessage} /></div></div>;
}

function ItemList({ items, emptyMessage }: { items: TodayItem[]; emptyMessage: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  return <ul className="divide-y divide-slate-800">{items.map((item) => <li key={`${item.source}:${item.id}`} className="py-3 first:pt-0 last:pb-0"><TodayItemRow item={item} /></li>)}</ul>;
}

function TodayItemRow({ item }: { item: TodayItem }) {
  const href = hrefForItem(item);
  const body = <><h3 className="font-medium text-slate-100">{item.title}</h3><p className="mt-1 text-xs text-slate-400">{itemDetail(item)}</p></>;
  if (!href) return <div>{body}</div>;
  return <Link className="block rounded-md outline-none transition hover:bg-slate-900/50 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c121c]" href={href}>{body}</Link>;
}

function SourceStates({ sourceNames, sources }: { sourceNames: string[]; sources: TodayView["sources"] }) {
  return <div className="mt-4 flex flex-wrap gap-2">{sourceNames.map((name) => sources[name] && <SourceState compact key={name} name={name} source={sources[name]} />)}</div>;
}

function SourceState({ name, source, compact = false }: { name: string; source: TodayView["sources"][string]; compact?: boolean }) {
  const statusMessage = source.status === "empty" ? "Bron reageerde, zonder resultaten." : source.status === "not_configured" ? "Bron is niet ingesteld; dit is geen lege uitkomst." : source.status === "stale" ? "Bron leverde verouderde data." : source.status === "unavailable" ? source.error ?? "Bron is tijdelijk niet bereikbaar." : source.status === "error" ? source.error ?? "Bronverwerking is mislukt." : source.status === "partial" ? "Bron leverde gedeeltelijke data." : `${source.item_count} item${source.item_count === 1 ? "" : "s"}.`;
  return <div className={`rounded-md border px-3 py-2 ${stateStyles[source.status]}`} data-source-state={source.status}><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium">{sourceLabels[name] ?? name}</p><StateBadge status={source.status} /></div>{!compact && <p className="mt-1 text-xs opacity-80">{statusMessage}</p>}</div>;
}

function StateBadge({ status }: { status: TodayStatus }) { return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${stateStyles[status]}`}>{stateLabels[status]}</span>; }

function hrefForItem(item: TodayItem) {
  if (item.kind === "action") return `/actions/${item.id}`;
  if (item.kind === "status_card") return `/status-cards/${item.id}`;
  if (item.kind === "project") return `/projects/${item.id}`;
  if (item.kind === "homelab_exception") return "/homelab";
  return null;
}

function itemDetail(item: TodayItem) {
  if (item.kind === "calendar_event") return formatTime(stringValue(item.details.starts_at)) ?? "Agenda-afspraak";
  if (item.kind === "routine") return item.reminder_time ? `Herinnering ${item.reminder_time.slice(0, 5)}` : "Vandaag";
  if (item.kind === "health_weight") return typeof item.details.normalized_kg === "number" ? `${item.details.normalized_kg.toLocaleString("nl-NL")} kg` : "Gewichtsmeting";
  if (item.kind === "health_activity") return activityDetail(item.details);
  if (item.kind === "project") return [item.status, stringValue(item.details.personal_status)].filter(Boolean).join(" · ") || "Project";
  if (item.kind === "homelab_exception") return [item.status, stringValue(item.details.type)].filter(Boolean).join(" · ") || "Homelab-uitzondering";
  return [item.domain, item.status, stringValue(item.details.priority)].filter(Boolean).join(" · ") || "Actie";
}

function activityDetail(details: Record<string, unknown>) {
  const duration = typeof details.duration_seconds === "number" ? `${Math.round(details.duration_seconds / 60)} min` : null;
  const distance = typeof details.distance_meters === "number" ? `${(details.distance_meters / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} km` : null;
  return [duration, distance].filter(Boolean).join(" · ") || "Activiteit";
}

function stringValue(value: unknown) { return typeof value === "string" && value ? value : null; }

function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(new Date(`${value}T12:00:00Z`)); }

function formatDateTime(value: string, timeZone: string) { return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(value)); }

function formatTime(value: string | null) { return value ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value)) : null; }
