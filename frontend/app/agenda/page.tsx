import Link from "next/link";

type CalendarEvent = { starts_at: string; summary: string };
type Schedule = { events: CalendarEvent[] };

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const response = await fetch("http://backend:8000/api/calendar/schedule", { cache: "no-store" });
  const schedule: Schedule = response.ok ? await response.json() : { events: [] };
  const events = schedule.events.filter((event) => new Date(event.starts_at) >= new Date()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8 lg:px-10">
    <header><Link className="text-sm text-indigo-300 hover:text-indigo-200" href="/">← Vandaag</Link><h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Agenda</h1><p className="mt-1 text-sm text-slate-400">Komende afspraken.</p></header>
    <section className="mt-8 rounded-lg border border-slate-800 bg-[#0c121c]/80 p-5" aria-label="Komende afspraken">
      <div className="divide-y divide-slate-800">{events.map((event) => <article className="grid grid-cols-[6rem_1fr] gap-4 py-4 first:pt-0 last:pb-0" key={`${event.starts_at}-${event.summary}`}><time className="text-sm text-slate-400">{formatDateTime(event.starts_at)}</time><h2 className="font-medium text-slate-100">{event.summary}</h2></article>)}{!events.length && <p className="text-sm text-slate-400">Geen komende afspraken bekend.</p>}</div>
    </section>
  </main>;
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value)); }
