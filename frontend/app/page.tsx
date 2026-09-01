import Link from "next/link";
import { LocalClock } from "./local-clock";

type Project = { name: string; slug: string; display_name: string; product_key: string; status: string; personal_status: string };
type StatusCard = { id: string; project_id: string | null; title: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; facts: string; interpretation: string; next_safe_step: string; source_type: string; updated_at: string; resolved_at: string | null };
type Action = { id: string; title: string; status: "Open" | "Bezig" | "Klaar" | "Later"; priority: string; due_date: string | null; updated_at: string };
type Asset = { id: string; name: string; type: string; status: string; notes: string };
type CalendarEvent = { starts_at: string; summary: string };
type Schedule = { status: string; events: CalendarEvent[] };
type CodexRun = { id: string; project_id: string; linear_issue: string; model: string; profile: string; reasoning_level: string; session_type: string; status: string; created_at: string };

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [projectsResponse, cardsResponse, actionsResponse, assetsResponse, scheduleResponse, runsResponse] = await Promise.all([
    fetch("http://backend:8000/api/projects", { cache: "no-store" }),
    fetch("http://backend:8000/api/status-cards", { cache: "no-store" }),
    fetch("http://backend:8000/api/actions", { cache: "no-store" }),
    fetch("http://backend:8000/api/assets", { cache: "no-store" }),
    fetch("http://backend:8000/api/calendar/schedule", { cache: "no-store" }),
    fetch("http://backend:8000/api/codex-runs", { cache: "no-store" })
  ]);
  const projects: Project[] = projectsResponse.ok ? await projectsResponse.json() : [];
  const cards: StatusCard[] = cardsResponse.ok ? await cardsResponse.json() : [];
  const actions: Action[] = actionsResponse.ok ? await actionsResponse.json() : [];
  const assets: Asset[] = assetsResponse.ok ? await assetsResponse.json() : [];
  const schedule: Schedule = scheduleResponse.ok ? await scheduleResponse.json() : { status: "Onbekend", events: [] };
  const runs: CodexRun[] = runsResponse.ok ? await runsResponse.json() : [];
  const openCards = cards.filter((card) => !card.resolved_at);
  const needsAttention = openCards.filter((card) => card.status === "Actie nodig" || card.status === "Geblokkeerd");
  const openActions = actions.filter((action) => action.status !== "Klaar");
  const recentActivity = [
    ...cards.map((card) => ({ id: `card-${card.id}`, href: `/status-cards/${card.id}`, title: card.title, detail: `Statuskaart · ${card.status}`, updatedAt: card.updated_at })),
    ...actions.map((action) => ({ id: `action-${action.id}`, href: `/actions/${action.id}`, title: action.title, detail: `Actie · ${action.status}`, updatedAt: action.updated_at }))
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);

  return <main className="mx-auto max-w-7xl px-5 py-5 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Goedendag.</h1><p className="mt-1 text-sm text-slate-400">Dit is wat vandaag aandacht vraagt.</p></div>
      <div className="flex items-center gap-3"><span className="rounded-md border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-300">Local</span><LocalClock /></div>
    </header>

    <section className="mt-4 grid gap-4 xl:grid-cols-[1.06fr_0.96fr_1.08fr]">
      <Panel eyebrow="Quick Capture"><div className="space-y-3"><textarea aria-label="Quick Capture" className="min-h-24 resize-none border-slate-700 bg-slate-950/60 text-slate-500" placeholder="Inbox-opslag Unknown — capture is nog niet beschikbaar." readOnly /><div className="flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Nieuwe captures horen in Inbox. Lokale Inbox-opslag ontbreekt.</p><button className="shrink-0 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-600" disabled>Opslaan</button></div></div></Panel>
      <Panel eyebrow="Today / Focus"><div className="space-y-3">{openActions.slice(0, 4).map((action) => <Link className="flex gap-3 text-sm text-slate-200 hover:text-indigo-300" href={`/actions/${action.id}`} key={action.id}><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-indigo-400" /><span>{action.title}<span className="block text-xs text-slate-500">{action.status} · {action.priority}</span></span></Link>)}{!openActions.length && <p className="text-sm text-slate-500">Geen open lokale acties.</p>}<Link className="inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/actions">Alle acties →</Link></div></Panel>
      <Panel eyebrow="Schedule" detail={schedule.status === "Beschikbaar" ? "Private ICS · read-only" : "Unknown/onbekend"}><div className="space-y-3">{schedule.events.slice(0, 4).map((event) => <div className="flex gap-4 text-sm" key={`${event.starts_at}-${event.summary}`}><time className="w-12 shrink-0 font-medium text-slate-300">{formatTime(event.starts_at)}</time><p className="text-slate-200">{event.summary}</p></div>)}{!schedule.events.length && <p className="text-sm text-slate-500">Agenda niet beschikbaar. Geen aannames gemaakt.</p>}</div></Panel>
    </section>

    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1.38fr_1fr]">
      <Panel className="min-h-[220px]" eyebrow="Needs Attention" count={needsAttention.length}><div className="divide-y divide-slate-800">{needsAttention.map((card) => <Link className="block py-4 first:pt-0 last:pb-0 hover:bg-slate-900/40" href={`/status-cards/${card.id}`} key={card.id}><div className="flex items-start gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${card.status === "Geblokkeerd" ? "bg-red-400" : "bg-amber-400"}`} /><div className="min-w-0"><h3 className="font-medium text-slate-100">{card.title}</h3><p className="mt-2 text-sm text-slate-300"><span className="text-slate-500">Feit:</span> {card.facts}</p><p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Interpretatie:</span> {card.interpretation}</p><p className="mt-1 text-sm text-slate-300"><span className="text-slate-500">Volgende veilige stap:</span> {card.next_safe_step}</p></div></div></Link>)}{!needsAttention.length && <p className="text-sm text-slate-500">Geen lokale kaarten met Actie nodig of Geblokkeerd.</p>}</div></Panel>
      <Panel className="min-h-[220px]" eyebrow="Inbox" count="Unknown"><p className="text-sm text-slate-500">Inbox-opslag is niet aanwezig in bestaande BCC-data. Nieuwe captures kunnen daarom niet veilig worden bewaard.</p></Panel>
    </section>

    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1.38fr_1fr]">
      <Panel eyebrow="Projects"><div className="divide-y divide-slate-800">{projects.slice(0, 5).map((project) => <Link className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-4 py-1 text-sm first:pt-0 last:pb-0 hover:text-indigo-300" href={`/projects/${project.slug}`} key={project.slug}><span className="flex min-w-0 items-center gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded border border-slate-700 text-[9px] text-indigo-200">{project.product_key}</span><span className="truncate text-slate-200">{project.display_name}</span></span><span className="truncate text-xs text-slate-500">{project.status} · {project.personal_status}</span></Link>)}{!projects.length && <p className="text-sm text-slate-500">Geen lokale projectrecords.</p>}</div><Link className="mt-2 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/projects">Alle projecten →</Link></Panel>
      <Panel eyebrow="Recent Activity"><div className="divide-y divide-slate-800">{recentActivity.map((item) => <Link className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-1 first:pt-0 last:pb-0 hover:text-indigo-300" href={item.href} key={item.id}><span className="truncate text-sm text-slate-200">{item.title}</span><time className="text-xs text-slate-500">{formatActivityTime(item.updatedAt)}</time></Link>)}{!recentActivity.length && <p className="text-sm text-slate-500">Geen lokale activiteit beschikbaar.</p>}</div></Panel>
    </section>

    <section className="mt-4 grid items-stretch gap-4 xl:grid-cols-[1.08fr_1fr]">
      <Panel className="min-h-[180px]" eyebrow="Homelab Status" detail="Ondersteunend"><div className="grid gap-2 sm:grid-cols-3">{assets.slice(0, 6).map((asset) => <Link className="rounded-md border border-slate-800 bg-slate-950/40 p-3 hover:border-slate-700" href={`/homelab/${asset.id}`} key={asset.id}><p className="truncate text-sm text-slate-200">{asset.name}</p><p className="mt-1 text-xs text-slate-500">{asset.status} · {asset.type}</p></Link>)}{!assets.length && <p className="text-sm text-slate-500">Geen lokale assets.</p>}</div><Link className="mt-4 inline-block text-sm text-indigo-300 hover:text-indigo-200" href="/homelab">Homelab bekijken →</Link></Panel>
      <Panel className="min-h-[180px]" eyebrow="Codex Runs"><div className="divide-y divide-slate-800">{runs.slice(0, 5).map((run) => <Link className="block py-3 first:pt-0 last:pb-0 hover:text-indigo-300" href={`/projects/${run.project_id}`} key={run.id}><p className="text-sm text-slate-200">{run.linear_issue || "Unknown"} · {run.status || "Unknown"}</p><p className="mt-1 text-xs text-slate-500">{run.model || "Unknown"} · {run.profile || "Unknown"} · {run.reasoning_level || "Unknown"} · {run.session_type || "Unknown"}</p></Link>)}{!runs.length && <p className="text-sm text-slate-500">Geen lokale Codex-runs.</p>}</div></Panel>
    </section>
  </main>;
}

function formatTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatActivityTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

function Panel({ eyebrow, detail, count, className = "", children }: { eyebrow: string; detail?: string; count?: number | string; className?: string; children: React.ReactNode }) {
  return <section className={`h-full rounded-lg border border-slate-800 bg-[#0c121c]/80 p-4 ${className}`}><header className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-100">{eyebrow}</h2>{count !== undefined && <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-200">{count}</span>}{detail && <span className="text-xs text-slate-500">{detail}</span>}</header><div className="mt-4">{children}</div></section>;
}
