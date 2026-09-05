import Link from "next/link";

import { StitchMetric, StitchPanel, StitchSectionTitle, StitchUnavailable } from "../stitch-primitives";
import type { Asset } from "./asset-form";

type PulseResource = { id: string; name: string; type: string; status: string; parent_name: string };
type Homelab = { available: boolean; resources: PulseResource[] };

export const dynamic = "force-dynamic";

export default async function HomelabPage() {
  const [assetsResponse, pulseResponse] = await Promise.all([fetch("http://backend:8000/api/assets", { cache: "no-store" }), fetch("http://backend:8000/api/homelab", { cache: "no-store" })]);
  if (!assetsResponse.ok) throw new Error("Assets konden niet worden geladen.");
  const assets: Asset[] = await assetsResponse.json();
  const pulse: Homelab = pulseResponse.ok ? await pulseResponse.json() : { available: false, resources: [] };
  const online = pulse.resources.filter((resource) => resource.status.toLowerCase() === "online").length;

  return <main className="mx-auto max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop" aria-label="Homelab infrastructure telemetry">
    <header className="cortex-stitch-panel flex flex-wrap items-center justify-between gap-4 p-4"><div className="flex min-w-0 items-center gap-3"><span className={`grid h-11 w-11 place-items-center rounded ${pulse.available ? "bg-tertiary/15 text-tertiary" : "bg-surface-container-high text-outline"}`}><span className="material-symbols-outlined">memory</span></span><div><p className="font-label-caps text-label-caps text-outline">GLOBAL SYSTEM HEALTH</p><h1 className="mt-1 font-headline text-headline-lg text-on-surface">{pulse.available ? "Pulse facts beschikbaar" : "Pulse status: Unknown"}</h1><p className="mt-1 font-mono text-mono-data-sm text-outline">Geen nominal-claim zonder onderliggende facts</p></div></div><div className="flex items-center gap-2"><span className="rounded bg-surface-container-high px-3 py-2 font-mono text-mono-data-sm text-outline">Read-only Pulse</span><Link className="cortex-focus rounded bg-primary px-3 py-2 font-headline text-headline-sm text-on-primary" href="/homelab/new">+ Nieuwe asset</Link></div></header>

    <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Compute system inference storage"><StitchMetric label="COMPUTE ARRAY" value="Unavailable" detail="Geen CPU-bron" /><StitchMetric label="SYSTEM MEMORY" value="Unavailable" detail="Geen RAM-bron" /><StitchMetric label="INFERENCE GPU" value="Unavailable" detail="Geen GPU-bron" /><StitchMetric label="ZFS POOL" value="Unavailable" detail="Geen storage-metriekbron" /></section>

    <section className="mt-6" aria-label="Infrastructure nodes"><StitchSectionTitle eyebrow="INFRASTRUCTURE NODES" title="Pulse resource matrix" detail={pulse.available ? `${online}/${pulse.resources.length} ONLINE` : "UNKNOWN"} /><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{pulse.resources.map((resource, index) => <NodeCard key={resource.id} resource={resource} index={index} />)}{!pulse.resources.length && <StitchUnavailable className="md:col-span-2 xl:col-span-4" title="Geen Pulse resources" detail="Er zijn geen feitelijke nodes om te classificeren." />}</div></section>

    <section className="mt-6 grid gap-3 xl:grid-cols-12" aria-label="Throughput inference storage panels"><StitchUnavailable className="min-h-72 xl:col-span-7" title="WAN Throughput & Gateway Flux" detail="Unavailable by source — geen throughput- of tijdreeksbron. Daarom geen grafiek." /><div className="space-y-3 xl:col-span-5"><StitchUnavailable title="Local LLM Velocity" detail="Unavailable by source — Codex proposal-service is geen lokale inference-telemetrie." /><StitchUnavailable title="Drive health matrix" detail="Unavailable by source — geen SMART- of drive-healthbron." /></div></section>

    <section className="mt-6" aria-label="Mission critical services"><StitchSectionTitle eyebrow="MISSION-CRITICAL SELF-HOSTED SERVICES" title="Feitelijke Pulse services" detail={pulse.available ? "READ-ONLY" : "UNKNOWN"} /><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pulse.resources.map((resource) => <ServiceCard key={`service-${resource.id}`} resource={resource} />)}{!pulse.resources.length && <StitchUnavailable className="md:col-span-2 xl:col-span-3" title="Geen feitelijke services" detail="Pulse levert geen resource-identiteiten." />}</div></section>

    <section className="mt-6" aria-label="Manual assets"><StitchSectionTitle eyebrow="MANUAL ASSETS" title="Asset registry" detail="LOS VAN PULSE" /><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <Link className="cortex-focus cortex-stitch-panel block p-3 transition-colors hover:bg-surface-container-high" href={`/homelab/${asset.id}`} key={asset.id}><div className="flex items-center justify-between gap-2"><span className="font-mono text-mono-data-sm text-primary">{asset.environment}</span><span className={`rounded px-2 py-1 font-mono text-mono-data-sm ${tone(asset.status)}`}>{asset.status}</span></div><h2 className="mt-4 font-headline text-headline-md text-on-surface">{asset.name}</h2><p className="mt-1 text-body-sm text-on-surface-variant">{asset.type} · {asset.host}</p><p className="mt-4 border-t border-surface-container-highest pt-2 font-mono text-mono-data-sm text-outline">{asset.address}</p></Link>)}{!assets.length && <StitchUnavailable className="md:col-span-2 xl:col-span-3" title="Geen handmatige assets" detail="Maak een asset om de bestaande detail- en edit-flow te gebruiken." />}</div></section>
  </main>;
}

interface NodeCardProps { readonly resource: PulseResource; readonly index: number; }

function NodeCard({ resource, index }: NodeCardProps) {
  return <StitchPanel className="min-h-64 p-4"><div className="flex items-center justify-between gap-2"><p className="font-label-caps text-label-caps text-outline">NODE {String(index + 1).padStart(2, "0")} // {resource.type || "UNKNOWN"}</p><span className={`rounded px-2 py-1 font-mono text-mono-data-sm ${tone(resource.status)}`}>{resource.status || "Unknown"}</span></div><h2 className="mt-5 font-headline text-headline-lg text-on-surface">{resource.name}</h2><p className="mt-1 text-body-sm text-on-surface-variant">{resource.parent_name === "Unknown" ? "Bovenliggende resource: Unknown." : resource.parent_name}</p><div className="mt-6 space-y-3 border-t border-surface-container-highest pt-3"><MetricRow label="DETAILTELEMETRIE" value="Unavailable" /><MetricRow label="SOURCE" value="Pulse read-only" /></div></StitchPanel>;
}

interface ServiceCardProps { readonly resource: PulseResource; }

function ServiceCard({ resource }: ServiceCardProps) {
  return <StitchPanel className="p-3"><div className="flex items-center justify-between gap-2"><span className="material-symbols-outlined text-primary" aria-hidden="true">dns</span><span className={`h-2 w-2 rounded-full ${resource.status.toLowerCase() === "online" ? "bg-tertiary" : "bg-outline"}`} /></div><h3 className="mt-3 font-headline text-headline-md text-on-surface">{resource.name}</h3><p className="mt-1 font-mono text-mono-data-sm text-on-surface-variant">{resource.type} · {resource.parent_name}</p></StitchPanel>;
}

interface MetricRowProps { readonly label: string; readonly value: string; }

function MetricRow({ label, value }: MetricRowProps) {
  return <div className="flex items-center justify-between gap-3"><span className="font-label-caps text-label-caps text-outline">{label}</span><span className="font-mono text-mono-data-sm text-on-surface-variant">{value}</span></div>;
}

function tone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "online" || normalized === "ok") return "bg-tertiary/10 text-tertiary";
  if (normalized === "fout" || normalized === "offline") return "bg-error/10 text-error";
  return "bg-surface-container-high text-on-surface-variant";
}
