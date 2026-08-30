import Link from "next/link";
import { FocusActions } from "./focus-actions";
import { buildFocus } from "./focus";
import { Inbox } from "./inbox";
import { LocalClock } from "./local-clock";
import { QuickCapture } from "./quick-capture";

type Project = { slug: string; display_name: string; status: string; personal_status: string };
type StatusCard = { id: string; title: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; next_safe_step: string; updated_at: string; resolved_at: string | null };
type Action = { id: string; title: string; status: "Open" | "Bezig" | "Klaar" | "Later"; priority: string; due_date: string | null; status_card_id: string | null; updated_at: string };
type InboxItem = { id: string; content: string; created_at: string };
type HomelabResource = { id: string; name: string; type: string; status: string };
type Homelab = { available: boolean; resources: HomelabResource[]; last_updated_at: string };
type CalendarEvent = { starts_at: string; ends_at?: string; summary: string; all_day: boolean };
type Schedule = { status: string; events: CalendarEvent[] };

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [projectsResponse, cardsResponse, actionsResponse, inboxResponse, homelabResponse, scheduleResponse] = await Promise.all([
    fetch("http://backend:8000/api/projects", { cache: "no-store" }), fetch("http://backend:8000/api/status-cards", { cache: "no-store" }), fetch("http://backend:8000/api/actions", { cache: "no-store" }), fetch("http://backend:8000/api/inbox", { cache: "no-store" }), fetch("http://backend:8000/api/homelab", { cache: "no-store" }), fetch("http://backend:8000/api/calendar/schedule", { cache: "no-store" })
  ]);
  const projects: Project[] = projectsResponse.ok ? await projectsResponse.json() : [];
  const cards: StatusCard[] = cardsResponse.ok ? await cardsResponse.json() : [];
  const actions: Action[] = actionsResponse.ok ? await actionsResponse.json() : [];
  const inbox: InboxItem[] = inboxResponse.ok ? await inboxResponse.json() : [];
  const homelab: Homelab = homelabResponse.ok ? await homelabResponse.json() : { available: false, resources: [], last_updated_at: "Onbekend" };
  const schedule: Schedule = scheduleResponse.ok ? await scheduleResponse.json() : { status: "Onbekend", events: [] };
  const today = localDateKey(new Date());
  const tomorrow = addDays(today, 1);
  const focus = buildFocus(actions, cards, today);
  const attention = cards.filter((card) => !card.resolved_at && (card.status === "Actie nodig" || card.status === "Geblokkeerd"));
  const agenda = schedule.events.filter((event) => [today, tomorrow].includes(event.starts_at.slice(0, 10)));
  const infrastructureIssues = homelab.resources.filter((resource) => !["ok", "online", "healthy", "running", "up", "available"].includes(resource.status.toLowerCase()));
  const recentActivity = [...cards.map((card) => ({ id: `card-${card.id}`, href: `/status-cards/${card.id}`, title: card.title, updatedAt: card.updated_at })), ...actions.map((action) => ({ id: `action-${action.id}`, href: `/actions/${action.id}`, title: action.title, updatedAt: action.updated_at }))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return <main className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-5"><div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Goedendag.</h1><p className="mt-1 text-sm text-slate-400">Kies je volgende stap. Rest kan wachten.</p></div><div className="flex items-center gap-3"><span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">Local</span><LocalClock /></div></header>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]"><Panel eyebrow="Jouw focus" detail="Automatisch geordend"><FocusActions items={focus} /><Link className="mt-4 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/actions">Alle acties →</Link></Panel><Panel eyebrow="Agenda" detail={schedule.status === "Beschikbaar" ? "Vandaag + morgen" : "Onbekend"}><div className="space-y-3">{agenda.map((event) => <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 text-sm" key={`${event.starts_at}-${event.summary}`}><time className="font-medium text-slate-300">{event.starts_at.slice(0, 10) === today ? "Vandaag" : "Morgen"}<span className="block text-xs font-normal text-slate-500">{formatEventTime(event)}</span></time><p className="text-slate-200">{event.summary}</p></div>)}{!agenda.length && <p className="text-sm text-slate-500">Geen afspraken voor vandaag of morgen.</p>}</div></Panel></section>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_1fr]"><Panel eyebrow="Vraagt aandacht" count={attention.length}><div className="divide-y divide-slate-800">{attention.map((card) => <Link className="block py-3 first:pt-0 last:pb-0 hover:text-indigo-300" href={`/status-cards/${card.id}`} key={card.id}><p className="text-xs text-amber-300">{card.status}</p><h3 className="mt-1 font-medium text-slate-100">{card.title}</h3><p className="mt-1 text-sm text-slate-400">{card.next_safe_step}</p></Link>)}{!attention.length && <p className="text-sm text-slate-500">Geen statuskaarten die directe aandacht vragen.</p>}</div></Panel><Panel eyebrow="Quick capture"><QuickCapture /></Panel></section>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]"><Panel eyebrow="Inbox" count={inbox.length}><Inbox items={inbox} /><Link className="mt-4 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/inbox">Volledige inbox →</Link></Panel><Panel eyebrow="Projecten"><div className="divide-y divide-slate-800">{projects.slice(0, 5).map((project) => <Link className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 first:pt-0 last:pb-0 text-sm hover:text-indigo-300" href={`/projects/${project.slug}`} key={project.slug}><span className="truncate text-slate-200">{project.display_name}</span><span className="text-xs text-slate-500">{project.status} · {project.personal_status}</span></Link>)}{!projects.length && <p className="text-sm text-slate-500">Geen lokale projectrecords.</p>}</div><Link className="mt-4 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/projects">Alle projecten →</Link></Panel></section>
    <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.3fr]"><Panel eyebrow="Infrastructuur" detail={homelab.available ? `Pulse · ${homelab.last_updated_at}` : "Pulse niet beschikbaar"}>{!homelab.available ? <p className="text-sm text-amber-200">Pulse is niet beschikbaar. Status onbekend.</p> : infrastructureIssues.length ? <div className="space-y-2">{infrastructureIssues.map((resource) => <Link className="block rounded-md border border-amber-400/25 bg-amber-400/5 p-3 text-sm" href="/homelab" key={resource.id}><span className="text-slate-100">{resource.name}</span><span className="ml-2 text-amber-200">{resource.status} · {resource.type}</span></Link>)}</div> : <p className="text-sm text-slate-500">Geen infrastructuur-uitzonderingen.</p>}<Link className="mt-4 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/homelab">Homelab bekijken →</Link></Panel><Panel eyebrow="Recente activiteit"><div className="divide-y divide-slate-800">{recentActivity.map((item) => <Link className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2 first:pt-0 last:pb-0 text-sm hover:text-indigo-300" href={item.href} key={item.id}><span className="truncate text-slate-200">{item.title}</span><time className="text-xs text-slate-500">{formatTime(item.updatedAt)}</time></Link>)}{!recentActivity.length && <p className="text-sm text-slate-500">Geen activiteit beschikbaar.</p>}</div></Panel></section>
  </main>;
}

function localDateKey(value: Date) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value); const part = (type: string) => parts.find((item) => item.type === type)?.value; return `${part("year")}-${part("month")}-${part("day")}`; }
function addDays(value: string, days: number) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function formatEventTime(event: CalendarEvent) { return event.all_day ? "Hele dag" : new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.starts_at)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function Panel({ eyebrow, detail, count, children }: { eyebrow: string; detail?: string; count?: number; children: React.ReactNode }) { return <section className="rounded-lg border border-slate-800 bg-[#0c121c]/80 p-4"><header className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{eyebrow}</h2>{count !== undefined && <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">{count}</span>}{detail && <span className="text-xs text-slate-500">{detail}</span>}</header><div className="mt-4">{children}</div></section>; }
