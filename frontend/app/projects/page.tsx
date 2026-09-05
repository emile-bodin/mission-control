import Link from "next/link";
import { CortexPanel } from "../cortex-panel";
import type { Project } from "./project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const response = await fetch("http://backend:8000/api/projects", { cache: "no-store" });
  if (!response.ok) throw new Error("Projecten konden niet worden geladen.");
  const projects: Project[] = await response.json();
  const active = projects.filter((project) => project.status === "Active" || project.personal_status === "Active");

  return (
    <main className="mx-auto min-h-screen max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop md:pt-24">
      <header className="flex flex-wrap items-start justify-between gap-space-base">
        <div><p className="font-label-caps text-label-caps text-primary">PROJECTEN // LOKALE CONTEXT</p><h1 className="mt-space-xs font-headline text-headline-xl text-on-surface">Project tracker</h1><p className="mt-space-xs text-body-sm text-on-surface-variant">Lokale projectgegevens. Linear-workitems zijn alleen beschikbaar wanneer een read-model bestaat.</p></div>
        <Link className="cortex-focus rounded bg-primary px-space-base py-space-sm font-headline text-headline-sm text-on-primary shadow-[0_0_15px_rgba(76,215,246,0.35)]" href="/projects/new">Nieuw project</Link>
      </header>
      <section className="mt-space-lg grid gap-space-base lg:grid-cols-3" aria-label="Projectsamenvatting">
        <Metric label="PROJECTEN" value={String(projects.length)} detail="Lokale registry" />
        <Metric label="ACTIEF" value={String(active.length)} detail="Status of persoonlijke status" />
        <Metric label="LINEAR READ-MODEL" value="Unknown" detail="Geen actuele issue- of PR-feed beschikbaar" />
      </section>
      <section className="mt-space-lg grid gap-space-base lg:grid-cols-3" aria-label="Projectenlijst">{projects.map((project) => <Link className="cortex-focus block rounded-xl border border-surface-container-highest bg-surface-container p-space-base transition-colors hover:bg-surface-container-high" href={`/projects/${project.slug}`} key={project.slug}><div className="flex items-center justify-between gap-space-sm"><span className="font-mono text-mono-data-sm text-primary">{project.product_key}</span><span className="rounded bg-surface-container-high px-space-sm py-space-2xs font-mono text-mono-data-sm text-on-surface-variant">{project.status}</span></div><h2 className="mt-space-base font-headline text-headline-md text-on-surface">{project.display_name}</h2><p className="mt-space-xs line-clamp-3 text-body-sm text-on-surface-variant">{project.notes || project.product_label || "Geen aanvullende projectcontext bekend."}</p><div className="mt-space-base flex items-center justify-between border-t border-surface-container-highest pt-space-sm font-mono text-mono-data-sm text-outline"><span>{project.personal_status}</span><span>{project.activity_source}</span></div></Link>)}{!projects.length && <CortexPanel className="p-space-base lg:col-span-3"><p className="text-body-sm text-on-surface-variant">Geen projecten beschikbaar.</p></CortexPanel>}</section>
    </main>
  );
}

function Metric({ label, value, detail }: Readonly<{ label: string; value: string; detail: string }>) {
  return <CortexPanel className="p-space-base"><p className="font-label-caps text-label-caps text-outline">{label}</p><p className="mt-space-sm font-mono text-mono-metric-lg text-on-surface">{value}</p><p className="mt-space-xs text-body-sm text-on-surface-variant">{detail}</p></CortexPanel>;
}
