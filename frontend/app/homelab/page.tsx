import Link from "next/link";
import { CortexPanel } from "../cortex-panel";
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
  const online = pulse.resources.filter((resource) => resource.status.toLowerCase() === "online").length;

  return <main className="mx-auto min-h-screen max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop md:pt-24">
    <header className="flex flex-wrap items-start justify-between gap-space-base"><div><p className="font-label-caps text-label-caps text-primary">HOMELAB // READ-ONLY PULSE</p><h1 className="mt-space-xs font-headline text-headline-xl text-on-surface">Infra telemetry</h1><p className="mt-space-xs max-w-2xl text-body-sm text-on-surface-variant">Pulse-status is read-only. Alleen feitelijk beschikbare resources en handmatige assets staan hieronder.</p></div><Link className="cortex-focus rounded bg-primary px-space-base py-space-sm font-headline text-headline-sm text-on-primary shadow-[0_0_15px_rgba(76,215,246,0.35)]" href="/homelab/new">Nieuwe asset</Link></header>
    <section className="mt-space-lg grid gap-space-base sm:grid-cols-2 xl:grid-cols-4" aria-label="Pulse-overzicht"><Metric label="PULSE" value={pulse.available ? "BESCHIKBAAR" : "UNKNOWN"} detail="Read-only integratie" /><Metric label="RESOURCES" value={String(pulse.resources.length)} detail={`${online} online`} /><Metric label="ASSETS" value={String(assets.length)} detail="Handmatig beheerd" /><Metric label="DETAILTELEMETRIE" value="UNKNOWN" detail="Geen metrics- of historiekbron" /></section>
    <section className="mt-space-lg" aria-label="Pulse-modules"><div className="flex items-center justify-between gap-space-sm border-b border-surface-container-highest pb-space-sm"><div><p className="font-label-caps text-label-caps text-outline">MISSION-CRITICAL RESOURCES</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Pulse modules</h2></div><span className="font-mono text-mono-data-sm text-tertiary">{online}/{pulse.resources.length} ONLINE</span></div><div className="mt-space-base grid gap-space-base md:grid-cols-2 xl:grid-cols-4">{pulse.resources.map((resource) => <CortexPanel className="p-space-base" key={resource.id}><div className="flex items-center justify-between gap-space-sm"><p className="font-label-caps text-label-caps text-outline">{resource.type}</p><span className={`rounded px-space-sm py-space-2xs font-mono text-mono-data-sm ${tone(resource.status)}`}>{resource.status}</span></div><h3 className="mt-space-base font-headline text-headline-md text-on-surface">{resource.name}</h3><p className="mt-space-xs text-body-sm text-on-surface-variant">{resource.parent_name === "Unknown" ? "Bovenliggende resource: Unknown." : resource.parent_name}</p><p className="mt-space-base border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline">Detailtelemetrie: Unknown</p></CortexPanel>)}{!pulse.resources.length && <CortexPanel className="p-space-base md:col-span-2 xl:col-span-4"><p className="text-body-sm text-on-surface-variant">{pulse.available ? "Geen Pulse-modules beschikbaar." : "Pulse status: Unknown."}</p></CortexPanel>}</div></section>
    <section className="mt-space-xl" aria-label="Homelab-assets"><div className="border-b border-surface-container-highest pb-space-sm"><p className="font-label-caps text-label-caps text-outline">ASSET REGISTRY</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Handmatige assets</h2></div><div className="mt-space-base grid gap-space-base md:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <Link className="cortex-focus block rounded-xl border border-surface-container-highest bg-surface-container p-space-base transition-colors hover:bg-surface-container-high" href={`/homelab/${asset.id}`} key={asset.id}><div className="flex items-center justify-between gap-space-sm"><span className="font-mono text-mono-data-sm text-primary">{asset.environment}</span><span className={`rounded px-space-sm py-space-2xs font-mono text-mono-data-sm ${tone(asset.status)}`}>{asset.status}</span></div><h3 className="mt-space-base font-headline text-headline-md text-on-surface">{asset.name}</h3><p className="mt-space-xs text-body-sm text-on-surface-variant">{asset.type} · {asset.host}</p><p className="mt-space-base border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline">{asset.address}</p></Link>)}{!assets.length && <CortexPanel className="p-space-base md:col-span-2 xl:col-span-3"><p className="text-body-sm text-on-surface-variant">Geen handmatige assets.</p></CortexPanel>}</div></section>
  </main>;
}

function Metric({ label, value, detail }: Readonly<{ label: string; value: string; detail: string }>) {
  return <CortexPanel className="p-space-base"><p className="font-label-caps text-label-caps text-outline">{label}</p><p className="mt-space-sm font-mono text-mono-metric-lg text-on-surface">{value}</p><p className="mt-space-xs text-body-sm text-on-surface-variant">{detail}</p></CortexPanel>;
}

function tone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "online" || normalized === "ok") return "bg-tertiary/10 text-tertiary";
  if (normalized === "fout" || normalized === "offline") return "bg-error/10 text-error";
  return "bg-surface-container-high text-on-surface-variant";
}
