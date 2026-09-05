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
    <section className="mt-space-lg rounded-xl border border-surface-container-highest bg-surface-container p-space-base" aria-label="Global system health"><div className="flex flex-wrap items-center justify-between gap-space-base"><div><p className="font-label-caps text-label-caps text-outline">GLOBAL SYSTEM HEALTH</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">{pulse.available ? "Pulse facts beschikbaar" : "Pulse status: Unknown"}</h2><p className="mt-space-xs text-body-sm text-on-surface-variant">Geen globale nominal- of healthy-claim zonder onderliggende feiten.</p></div><span className={`rounded px-space-sm py-space-2xs font-mono text-mono-data-sm ${pulse.available ? "bg-tertiary/10 text-tertiary" : "bg-surface-container-high text-outline"}`}>{pulse.available ? `${online}/${pulse.resources.length} ONLINE` : "UNKNOWN"}</span></div></section>
    <section className="mt-space-base grid gap-space-base sm:grid-cols-2 xl:grid-cols-4" aria-label="Compute system inference and storage summary"><Metric label="COMPUTE ARRAY" value="Unavailable" detail="Geen CPU-bron" /><Metric label="SYSTEM MEMORY" value="Unavailable" detail="Geen RAM-bron" /><Metric label="INFERENCE GPU" value="Unavailable" detail="Geen GPU-bron" /><Metric label="ZFS POOL" value="Unavailable" detail="Geen storage-metriekbron" /></section>
    <section className="mt-space-lg" aria-label="Infrastructure nodes"><SectionHeader eyebrow="INFRASTRUCTURE NODES" title="Pulse resources" detail={`${online}/${pulse.resources.length} ONLINE`} /><div className="mt-space-base grid gap-space-base md:grid-cols-2 xl:grid-cols-4">{pulse.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} />)}{!pulse.resources.length && <UnavailablePanel className="md:col-span-2 xl:col-span-4" title={pulse.available ? "Geen Pulse-resources beschikbaar." : "Pulse status: Unknown."} detail="Er zijn geen feitelijke nodes om te classificeren." />}</div></section>
    <section className="mt-space-lg grid gap-space-base xl:grid-cols-12" aria-label="Unavailable telemetry panels"><UnavailablePanel className="xl:col-span-7" title="Network / throughput telemetry" detail="Unavailable by source — geen throughput- of tijdreeksbron. Daarom geen grafiek." /><div className="grid gap-space-base sm:grid-cols-2 xl:col-span-5"><UnavailablePanel title="Local LLM velocity" detail="Unavailable by source — Codex proposal-service is geen lokale inference-telemetrie." /><UnavailablePanel title="Storage / drive health matrix" detail="Unavailable by source — geen SMART- of drive-healthbron." /></div></section>
    <section className="mt-space-xl" aria-label="Mission-critical self-hosted services"><SectionHeader eyebrow="MISSION-CRITICAL SELF-HOSTED SERVICES" title="Feitelijke Pulse services" detail={pulse.available ? "READ-ONLY" : "UNKNOWN"} /><div className="mt-space-base grid gap-space-base md:grid-cols-2 xl:grid-cols-3">{pulse.resources.map((resource) => <ResourceCard key={`service-${resource.id}`} resource={resource} compact />)}{!pulse.resources.length && <UnavailablePanel className="md:col-span-2 xl:col-span-3" title="Geen feitelijke services beschikbaar." detail="Pulse levert geen resource-identiteiten." />}</div></section>
    <section className="mt-space-xl" aria-label="Homelab-assets"><SectionHeader eyebrow="ASSET REGISTRY" title="Handmatige assets" detail="LOS VAN PULSE" /><div className="mt-space-base grid gap-space-base md:grid-cols-2 xl:grid-cols-3">{assets.map((asset) => <Link className="cortex-focus block rounded-xl border border-surface-container-highest bg-surface-container p-space-base transition-colors hover:bg-surface-container-high" href={`/homelab/${asset.id}`} key={asset.id}><div className="flex items-center justify-between gap-space-sm"><span className="font-mono text-mono-data-sm text-primary">{asset.environment}</span><span className={`rounded px-space-sm py-space-2xs font-mono text-mono-data-sm ${tone(asset.status)}`}>{asset.status}</span></div><h3 className="mt-space-base font-headline text-headline-md text-on-surface">{asset.name}</h3><p className="mt-space-xs text-body-sm text-on-surface-variant">{asset.type} · {asset.host}</p><p className="mt-space-base border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline">{asset.address}</p></Link>)}{!assets.length && <UnavailablePanel className="md:col-span-2 xl:col-span-3" title="Geen handmatige assets." detail="Maak een asset om de bestaande detail- en edit-flow te gebruiken." />}</div></section>
  </main>;
}

function Metric({ label, value, detail }: Readonly<{ label: string; value: string; detail: string }>) {
  return <CortexPanel className="p-space-base"><p className="font-label-caps text-label-caps text-outline">{label}</p><p className="mt-space-sm font-mono text-mono-metric-lg text-on-surface">{value}</p><p className="mt-space-xs text-body-sm text-on-surface-variant">{detail}</p></CortexPanel>;
}

function SectionHeader({ eyebrow, title, detail }: Readonly<{ eyebrow: string; title: string; detail: string }>) {
  return <div className="flex items-center justify-between gap-space-sm border-b border-surface-container-highest pb-space-sm"><div><p className="font-label-caps text-label-caps text-outline">{eyebrow}</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">{title}</h2></div><span className="font-mono text-mono-data-sm text-outline">{detail}</span></div>;
}

function ResourceCard({ resource, compact = false }: Readonly<{ resource: PulseResource; compact?: boolean }>) {
  return <CortexPanel className="p-space-base"><div className="flex items-center justify-between gap-space-sm"><p className="font-label-caps text-label-caps text-outline">{resource.type || "Unknown type"}</p><span className={`rounded px-space-sm py-space-2xs font-mono text-mono-data-sm ${tone(resource.status)}`}>{resource.status || "Unknown"}</span></div><h3 className="mt-space-base font-headline text-headline-md text-on-surface">{resource.name}</h3><p className="mt-space-xs text-body-sm text-on-surface-variant">{resource.parent_name === "Unknown" ? "Bovenliggende resource: Unknown." : resource.parent_name}</p>{!compact && <p className="mt-space-base border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline">Detailtelemetrie: Unavailable by source</p>}</CortexPanel>;
}

function UnavailablePanel({ className = "", title, detail }: Readonly<{ className?: string; title: string; detail: string }>) {
  return <CortexPanel className={`p-space-base ${className}`}><p className="font-label-caps text-label-caps text-outline">UNAVAILABLE BY SOURCE</p><h3 className="mt-space-xs font-headline text-headline-md text-on-surface">{title}</h3><p className="mt-space-sm text-body-sm text-on-surface-variant">{detail}</p></CortexPanel>;
}

function tone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "online" || normalized === "ok") return "bg-tertiary/10 text-tertiary";
  if (normalized === "fout" || normalized === "offline") return "bg-error/10 text-error";
  return "bg-surface-container-high text-on-surface-variant";
}
