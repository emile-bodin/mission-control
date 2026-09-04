import Link from "next/link";

type Weight = { id: string; measured_at: string; normalized_kg: number; source: string };
type Activity = { id: string; activity_type: string; started_at: string; duration_seconds: number | null; source: string };

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const [weightsResponse, activitiesResponse] = await Promise.all([fetch("http://backend:8000/api/health/weights", { cache: "no-store" }), fetch("http://backend:8000/api/health/activities", { cache: "no-store" })]);
  const weights: Weight[] = weightsResponse.ok ? await weightsResponse.json() : [];
  const activities: Activity[] = activitiesResponse.ok ? await activitiesResponse.json() : [];
  return <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10"><Link className="cockpit-link" href="/">← Dashboard</Link><h1 className="mt-6 text-3xl font-semibold text-white">Health</h1><section className="mt-8 grid gap-5 md:grid-cols-2"><article className="cockpit-card rounded-2xl border p-5"><h2 className="font-semibold text-white">Gewicht</h2>{weights.length ? <ul className="mt-4 space-y-3 text-sm text-slate-300">{weights.map((weight) => <li key={weight.id}>{weight.normalized_kg.toFixed(1)} kg <span className="text-slate-500">· {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeZone: "Europe/Amsterdam" }).format(new Date(weight.measured_at))}</span></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">Unknown — geen syncdata.</p>}</article><article className="cockpit-card rounded-2xl border p-5"><h2 className="font-semibold text-white">Activiteit</h2>{activities.length ? <ul className="mt-4 space-y-3 text-sm text-slate-300">{activities.map((activity) => <li key={activity.id}>{activity.activity_type} <span className="text-slate-500">· {activity.duration_seconds === null ? "Unknown" : `${Math.round(activity.duration_seconds / 60)} min`}</span></li>)}</ul> : <p className="mt-4 text-sm text-slate-500">Unknown — geen syncdata.</p>}</article></section></main>;
}
