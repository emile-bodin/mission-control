import Link from "next/link";
import type { Asset } from "./asset-form";

export const dynamic = "force-dynamic";

export default async function HomelabPage() {
  const response = await fetch("http://backend:8000/api/assets", { cache: "no-store" });
  if (!response.ok) throw new Error("Assets konden niet worden geladen.");
  const assets: Asset[] = await response.json();

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
    <header className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Homelab</p><h1 className="mt-3 text-4xl font-semibold text-white">Asset registry</h1><p className="mt-3 max-w-xl text-sm text-slate-400">Handmatig beheerde assets. Geen externe checks of acties.</p></div><Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/homelab/new">Nieuwe asset</Link></header>
    <section className="mt-8 grid gap-4" aria-label="Homelab-assets">{assets.map((asset) => <Link className="rounded-2xl border border-slate-800 bg-slate-900 p-5" href={`/homelab/${asset.id}`} key={asset.id}><p className="text-sm text-cyan-300">{asset.status} · {asset.environment}</p><h2 className="mt-1 text-xl font-semibold text-white">{asset.name}</h2><p className="mt-2 text-sm text-slate-300">{asset.type} · {asset.host}</p><p className="mt-2 text-sm text-slate-400">{asset.address}</p></Link>)}{!assets.length && <p className="text-slate-300">Geen handmatige assets.</p>}</section>
  </main>;
}
