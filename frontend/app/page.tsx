import Link from "next/link";
import { LocalClock } from "./local-clock";

type StatusCard = { id: string; title: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; next_safe_step: string; resolved_at: string | null };
type Action = { id: string; title: string; status: "Open" | "Bezig" | "Klaar" | "Later"; priority: string; due_date: string | null; updated_at: string };
type CalendarEvent = { starts_at: string; summary: string };
type Schedule = { status: string; events: CalendarEvent[] };
type Project = { slug: string; display_name: string; status: string; personal_status: string };
type Asset = { id: string; name: string; status: "Onbekend" | "OK" | "Let op" | "Fout" };
type Weight = { id: string; measured_at: string; normalized_kg: number };
type Activity = { id: string; activity_type: string; started_at: string; duration_seconds: number | null };

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
  const [cards, actions, schedule, projects, assets, weights, activities] = await Promise.all([
    getJson<StatusCard[]>("/api/status-cards", []),
    getJson<Action[]>("/api/actions", []),
    getJson<Schedule>("/api/calendar/schedule", { status: "Onbekend", events: [] }),
    getJson<Project[]>("/api/projects", []),
    getJson<Asset[]>("/api/assets", []),
    getJson<Weight[]>("/api/health/weights", []),
    getJson<Activity[]>("/api/health/activities", [])
  ]);

  const openActions = actions.filter((action) => action.status !== "Klaar").sort(compareActions);
  const nextEvents = schedule.events.filter((event) => new Date(event.starts_at) >= new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 4);
  const openCards = cards.filter((card) => !card.resolved_at);
  const activeProjects = projects.filter((project) => isActive(project.status) || isActive(project.personal_status)).slice(0, 3);
  const latestWeight = weights[0];
  const latestActivity = activities[0];
  const attentionCount = openCards.filter((card) => card.status === "Actie nodig" || card.status === "Geblokkeerd").length;
  const pulseOk = assets.filter((asset) => asset.status === "OK").length;
  const calendarConnected = schedule.status === "Beschikbaar";

  return <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-9">
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div><p className="text-sm font-medium text-indigo-300">Vandaag</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Goedenavond, Emile <span aria-hidden="true">👋</span></h1><p className="mt-2 text-sm text-slate-400">Hier is je overzicht voor vandaag.</p></div>
      <LocalClock />
    </header>

    <div className="mt-8 grid items-stretch gap-5 xl:grid-cols-2">
      <Panel title="AI Brief" icon="✦" className="min-h-[20rem]">
        <span className="inline-flex rounded-lg bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">✦ Top inzichten</span>
        <ul className="mt-5 space-y-3 text-sm text-slate-300">
          <Insight>{openActions.length ? `${openActions.length} open taak${openActions.length === 1 ? "" : "en"}${attentionCount ? ` · ${attentionCount} vraagt aandacht` : ""}.` : "Open taken: geen bekend."}</Insight>
          <Insight>{latestWeight ? `Laatste gewicht: ${latestWeight.normalized_kg.toFixed(1)} kg.` : "Health sync: Unknown."}</Insight>
          <Insight>{activeProjects.length ? `${activeProjects.length} actief project${activeProjects.length === 1 ? "" : "en"} bekend.` : "Projectstatus: Unknown."}</Insight>
          <Insight>{assets.length ? `Pulse: ${pulseOk} van ${assets.length} assets met status OK.` : "Pulse status: Unknown."}</Insight>
        </ul>
        <p className="mt-auto pt-10 text-xs text-slate-500">Statische samenvatting op basis van beschikbare dashboarddata.</p>
      </Panel>

      <Panel title="Agenda" icon="□" action={<Link className="cockpit-link" href="/agenda">Volledige agenda</Link>}>
        {calendarConnected && nextEvents.length ? <div className="space-y-2">{nextEvents.map((event) => <article className="cockpit-inset grid grid-cols-[5.4rem_1fr] gap-4 rounded-xl px-3 py-3" key={`${event.starts_at}-${event.summary}`}><time className="text-xs font-medium leading-5 text-slate-300"><span className="block">{formatDate(event.starts_at)}</span><span className="block text-sm text-white">{formatClock(event.starts_at)}</span></time><div><h3 className="font-medium text-slate-100">{event.summary}</h3><p className="mt-1 text-xs text-slate-500">Agenda-item</p></div></article>)}</div> : <CalendarPlaceholder connected={calendarConnected} />}
      </Panel>

      <Panel title="Health & History" icon="♡" id="health" action={<span className="text-xs text-slate-500">Historie: Unknown</span>}>
        <div className="mb-4 flex gap-5 border-b border-slate-800 text-sm"><span className="border-b-2 border-indigo-400 pb-2 text-indigo-300">Overzicht</span><span className="pb-2 text-slate-500">Historie</span></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Gewicht" value={latestWeight ? `${latestWeight.normalized_kg.toFixed(1)} kg` : "Unknown"} detail={latestWeight ? `Gemeten ${formatShortDate(latestWeight.measured_at)}` : "Geen syncdata"} />
          <Metric label="Stappen" value="Unknown" detail="Geen stappenbron" />
          <Metric label="Activiteit" value={latestActivity ? formatDuration(latestActivity.duration_seconds) : "Unknown"} detail={latestActivity ? latestActivity.activity_type : "Geen syncdata"} />
        </div>
        <WeightTrend weights={weights.slice(0, 7).reverse()} />
      </Panel>

      <Panel title="Open taken" icon="☑" action={<Link className="cockpit-link" href="/actions">Alle taken</Link>}>
        <div className="space-y-2">{openActions.slice(0, 5).map((action) => <Link className="cockpit-inset grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-3 py-3 transition" href={`/actions/${action.id}`} key={action.id}><span className="h-4 w-4 rounded border border-slate-600" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-100">{action.title}</span><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${priorityClass(action.priority)}`}>{action.priority || "Unknown"}</span></span><span className="whitespace-nowrap text-xs text-slate-500">{action.due_date ? dueLabel(action.due_date) : "Geen datum"}</span></Link>)}{!openActions.length && <p className="rounded-xl border border-dashed border-slate-700 px-4 py-6 text-sm text-slate-500">Geen open taken bekend.</p>}</div>
        <Link className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-300 hover:text-indigo-200" href="/actions/new">＋ Nieuwe taak</Link>
      </Panel>
    </div>

    <section className="mt-5 grid gap-5 lg:grid-cols-[1.12fr_0.9fr_0.9fr]">
      <Panel title="Quick Access" className="min-h-[10rem]"><div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><QuickAccess href="/actions/new" icon="＋" label="Nieuwe taak" /><QuickAccess icon="♡" label="Health loggen" /><QuickAccess icon="▤" label="Nieuwe notitie" /><QuickAccess icon="◎" label="Focus starten" /></div></Panel>
      <Panel title="Actieve projecten" icon="⌘" action={<Link className="cockpit-link" href="/projects">Alle projecten</Link>}><div className="space-y-4">{activeProjects.length ? activeProjects.map((project) => <Link className="block" href={`/projects/${project.slug}`} key={project.slug}><div className="flex justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-200">{project.display_name}</span><span className="text-xs text-slate-500">Voortgang: Unknown</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-800" /></Link>) : <UnknownProjects />}</div></Panel>
      <Panel title="Pulse Overview" action={<Link className="cockpit-link" href="/homelab">Pulse bekijken</Link>}><div className="space-y-3">{["Proxmox", "PBS Backup", "Home Network"].map((name) => <PulseItem asset={assets.find((item) => item.name.toLowerCase().includes(name.toLowerCase().split(" ")[0].toLowerCase()))} name={name} key={name} />)}</div></Panel>
    </section>
  </main>;
}

function Panel({ title, icon, action, children, className = "", id }: { title: string; icon?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return <section className={`cockpit-card flex h-full flex-col rounded-2xl border p-5 ${className}`} id={id}><header className="mb-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-3 text-base font-semibold text-white"><span className="text-lg text-slate-300" aria-hidden="true">{icon}</span>{title}</h2>{action}</header>{children}</section>;
}

function Insight({ children }: { children: React.ReactNode }) { return <li className="flex gap-3"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />{children}</li>; }
function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="cockpit-metric rounded-xl p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight text-white">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>; }
function QuickAccess({ href, icon, label }: { href?: string; icon: string; label: string }) { const content = <><span className="grid h-8 w-8 place-items-center rounded-full bg-blue-500/20 text-lg text-blue-300">{icon}</span><span className="text-xs font-medium text-slate-200">{label}</span>{!href && <span className="text-[10px] text-slate-500">Unknown</span>}</>; const className = "cockpit-quick-access flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl px-2 text-center transition"; return href ? <Link className={className} href={href}>{content}</Link> : <span className={`${className} cursor-not-allowed opacity-75`} aria-disabled="true">{content}</span>; }
function CalendarPlaceholder({ connected }: { connected: boolean }) { return <div className="cockpit-inset rounded-xl border-dashed p-4"><p className="text-sm font-medium text-slate-300">{connected ? "Geen komende afspraken" : "Agenda niet gekoppeld"}</p><p className="mt-1 text-xs text-slate-500">{connected ? "Geen afspraken in huidige kalenderfeed." : "Google Calendar-status: Unknown."}</p><div className="mt-4 space-y-2 opacity-40" aria-hidden="true"><div className="h-12 rounded-lg bg-slate-800" /><div className="h-12 rounded-lg bg-slate-800" /><div className="h-12 rounded-lg bg-slate-800" /></div></div>; }
function WeightTrend({ weights }: { weights: Weight[] }) { if (weights.length < 2) return <div className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-xs text-slate-500">Gewichtstrend: Unknown — minimaal twee metingen nodig.</div>; const values = weights.map((weight) => weight.normalized_kg); const min = Math.min(...values); const max = Math.max(...values); const range = max - min || 1; const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${90 - ((value - min) / range) * 65}`).join(" "); return <figure className="mt-5"><figcaption className="mb-2 flex justify-between text-xs text-slate-500"><span>Gewichtstrend</span><span>{min.toFixed(1)}–{max.toFixed(1)} kg</span></figcaption><svg className="h-24 w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gewichtstrend van beschikbare metingen"><path d="M0 90H100" stroke="currentColor" className="text-slate-700" strokeWidth="1" vectorEffect="non-scaling-stroke" /><polyline points={points} fill="none" stroke="currentColor" className="text-indigo-400" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg><div className="flex justify-between text-[11px] text-slate-600"><span>{formatShortDate(weights[0].measured_at)}</span><span>{formatShortDate(weights[weights.length - 1].measured_at)}</span></div></figure>; }
function UnknownProjects() { return <>{["Project 1", "Project 2", "Project 3"].map((name) => <div key={name}><div className="flex justify-between text-sm"><span className="text-slate-500">{name}</span><span className="text-xs text-slate-600">Unknown</span></div><div className="mt-2 h-1.5 rounded-full bg-slate-800" /></div>)}</>; }
function PulseItem({ name, asset }: { name: string; asset?: Asset }) { const label = asset ? pulseLabel(asset.status) : "Unknown"; return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-300">{name}</span><span className={`inline-flex items-center gap-1.5 text-xs ${label === "Online" ? "text-emerald-400" : "text-slate-500"}`}><span className={`h-2 w-2 rounded-full ${label === "Online" ? "bg-emerald-400" : "bg-slate-600"}`} />{label}</span></div>; }
function compareActions(a: Action, b: Action) { return (a.due_date || "9999-12-31").localeCompare(b.due_date || "9999-12-31") || a.updated_at.localeCompare(b.updated_at); }
function isActive(value: string) { return value.toLowerCase() === "active"; }
function pulseLabel(status: Asset["status"]) { return status === "OK" ? "Online" : status === "Onbekend" ? "Unknown" : status; }
function priorityClass(priority: string) { const value = priority.toLowerCase(); return value.includes("high") || value.includes("hoog") ? "bg-red-500/15 text-red-300" : value.includes("medium") || value.includes("middel") ? "bg-amber-500/15 text-amber-300" : value.includes("low") || value.includes("laag") ? "bg-blue-500/15 text-blue-300" : "bg-slate-700 text-slate-300"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatClock(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function formatShortDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
function dueLabel(value: string) { return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", timeZone: "Europe/Amsterdam" }).format(new Date(`${value}T12:00:00Z`)); }
function formatDuration(value: number | null) { return value === null ? "Unknown" : `${Math.max(0, Math.round(value / 60))} min`; }
