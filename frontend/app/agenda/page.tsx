import Link from "next/link";

type Event = { starts_at: string; summary: string };
type Schedule = { status: string; events: Event[] };

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const response = await fetch("http://backend:8000/api/calendar/schedule", { cache: "no-store" });
  const schedule: Schedule = response.ok ? await response.json() : { status: "Onbekend", events: [] };
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10"><Link className="cockpit-link" href="/">← Dashboard</Link><h1 className="mt-6 text-3xl font-semibold text-white">Agenda</h1><p className="mt-2 text-sm text-slate-400">Kalenderstatus: {schedule.status}.</p><section className="mt-8 space-y-3">{schedule.events.map((event) => <article className="cockpit-card rounded-2xl border p-5" key={`${event.starts_at}-${event.summary}`}><time className="text-sm text-indigo-300">{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(event.starts_at))}</time><h2 className="mt-2 font-medium text-white">{event.summary}</h2></article>)}{!schedule.events.length && <p className="cockpit-card rounded-2xl border p-5 text-slate-400">Geen agenda-items beschikbaar. Calendar-status blijft Unknown zolang geen bron gekoppeld is.</p>}</section></main>;
}
