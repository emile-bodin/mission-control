import Link from "next/link";

type Routine = { id: string; title: string; active: boolean; frequency: string; reminder_time: string };

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const response = await fetch("http://backend:8000/api/routines", { cache: "no-store" });
  const routines: Routine[] = response.ok ? await response.json() : [];
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10"><Link className="cockpit-link" href="/">← Dashboard</Link><h1 className="mt-6 text-3xl font-semibold text-white">Routines</h1><section className="mt-8 space-y-3">{routines.map((routine) => <article className="cockpit-card rounded-2xl border p-5" key={routine.id}><h2 className="font-medium text-white">{routine.title}</h2><p className="mt-2 text-sm text-slate-400">{routine.active ? "Actief" : "Inactief"} · {routine.frequency} · {routine.reminder_time}</p></article>)}{!routines.length && <p className="cockpit-card rounded-2xl border p-5 text-slate-400">Geen routines bekend.</p>}</section></main>;
}
