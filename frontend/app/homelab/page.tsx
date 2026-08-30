import Link from "next/link";

export const dynamic = "force-dynamic";

type Resource = { id: string; name: string; type: string; status: string; parent_name: string; last_seen: string; updated_at: string; runtime: string; runtime_version: string };
type DockerHost = { name: string; containers: number | string; uptime_seconds: number | string; cpu_usage_percent: number | string };
type Homelab = { available: boolean; status: string; resources: Resource[]; docker_hosts: DockerHost[]; last_updated_at: string };

export default async function HomelabPage() {
  const response = await fetch("http://backend:8000/api/homelab", { cache: "no-store" });
  const homelab: Homelab = response.ok ? await response.json() : { available: false, status: "Unknown", resources: [], docker_hosts: [], last_updated_at: "Unknown" };

  return <main className="bcc-shell mx-auto min-h-screen">
    <header><Link className="text-cyan-300 underline" href="/">← Vandaag</Link><p className="mt-3 text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Homelab</p><h1 className="mt-3 text-4xl font-semibold text-white">Pulse inventory</h1><p className="mt-3 max-w-xl text-sm text-slate-400">Read-only actuele status uit Pulse. Bron-update: {homelab.last_updated_at}.</p></header>
    {!homelab.available && <p className="mt-8 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-amber-100">Pulse unavailable — status Unknown.</p>}
    <section className="mt-8 grid gap-4" aria-label="Pulse homelab inventory">{homelab.resources.map((resource) => <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5" key={resource.id}><p className="text-sm text-cyan-300">{resource.status} · {resource.type}</p><h2 className="mt-1 text-xl font-semibold text-white">{resource.name}</h2><p className="mt-2 text-sm text-slate-300">Host: {resource.parent_name} · Runtime: {resource.runtime} {resource.runtime_version}</p><p className="mt-2 text-xs text-slate-400">Laatst gezien: {resource.last_seen} · Bron bijgewerkt: {resource.updated_at}</p></article>)}{homelab.available && !homelab.resources.length && <p className="text-slate-300">Geen Pulse-systemen of services gevonden.</p>}</section>
    {homelab.docker_hosts.length > 0 && <section className="mt-8"><h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Beschikbare telemetry</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{homelab.docker_hosts.map((host) => <article className="rounded-xl border border-slate-800 bg-slate-950/50 p-4" key={host.name}><h3 className="text-sm text-slate-100">{host.name}</h3><p className="mt-2 text-xs text-slate-400">CPU: {host.cpu_usage_percent}% · Uptime: {host.uptime_seconds}s · Containers: {host.containers}</p></article>)}</div></section>}
  </main>;
}
