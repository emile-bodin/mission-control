import Link from "next/link";
import type { Asset } from "./asset-form";

type PulseResource = { id: string; name: string; type: string; status: string; parent_name: string };
type Homelab = { available: boolean; resources: PulseResource[] };

export const dynamic = "force-dynamic";

export default async function HomelabPage() {
  const [assetsResponse, pulseResponse] = await Promise.all([
    fetch("http://backend:8000/api/assets", { cache: "no-store" }),
    fetch("http://backend:8000/api/homelab", { cache: "no-store" }),
  ]);
  if (!assetsResponse.ok) throw new Error("Assets konden niet worden geladen.");
  const assets: Asset[] = await assetsResponse.json();
  const pulse: Homelab = pulseResponse.ok ? await pulseResponse.json() : { available: false, resources: [] };

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
    <header className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Homelab</p><h1 className="mt-3 text-4xl font-semibold text-white">Pulse & assets</h1><p className="mt-3 max-w-xl text-sm text-slate-400">Pulse-status is read-only. Handmatige assets blijven apart beheerd.</p></div><Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/homelab/new">Nieuwe asset</Link></header>
    <section className="mt-8" aria-label="Pulse-modules"><h2 className="text-xl font-semibold text-white">Pulse modules</h2><div className="mt-4 grid gap-4">{pulse.resources.map((resource) => <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5" key={resource.id}><p className="text-sm text-cyan-300">{resource.status} · {resource.type}</p><h3 className="mt-1 text-xl font-semibold text-white">{resource.name}</h3>{resource.parent_name !== "Unknown" && <p className="mt-2 text-sm text-slate-400">{resource.parent_name}</p>}</article>)}{!pulse.resources.length && <p className="text-slate-300">{pulse.available ? "Geen Pulse-modules beschikbaar." : "Pulse status: Unknown."}</p>}</div></section>
    <section className="mt-10" aria-label="Homelab-assets"><h2 className="text-xl font-semibold text-white">Handmatige assets</h2><div className="mt-4 grid gap-4">{assets.map((asset) => <Link className="rounded-2xl border border-slate-800 bg-slate-900 p-5" href={`/homelab/${asset.id}`} key={asset.id}><p className="text-sm text-cyan-300">{asset.status} · {asset.environment}</p><h3 className="mt-1 text-xl font-semibold text-white">{asset.name}</h3><p className="mt-2 text-sm text-slate-300">{asset.type} · {asset.host}</p><p className="mt-2 text-sm text-slate-400">{asset.address}</p></Link>)}{!assets.length && <p className="text-slate-300">Geen handmatige assets.</p>}</div></section>
  </main>;
}
