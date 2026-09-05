import Link from "next/link";

import { StitchMetric, StitchPanel, StitchSectionTitle, StitchUnavailable } from "../stitch-primitives";
import type { Project } from "./project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const response = await fetch("http://backend:8000/api/projects", { cache: "no-store" });
  if (!response.ok) throw new Error("Projecten konden niet worden geladen.");
  const projects: Project[] = await response.json();
  const active = projects.filter((project) => project.status === "Active" || project.personal_status === "Active");

  return <main className="mx-auto max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop" aria-label="Linear and projects tracker">
    <header className="cortex-stitch-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="flex flex-wrap items-center gap-3"><span className="rounded bg-primary/10 px-2 py-1 font-label-caps text-label-caps text-primary">SPRINT DIRECTIVES</span><span className="font-mono text-mono-data-sm text-primary">CYCLE: UNAVAILABLE</span><span className="h-1.5 w-1.5 rounded-full bg-outline" /><span className="text-body-sm text-on-surface-variant">Geen cycle-read-model beschikbaar</span></div><div className="flex items-center gap-2"><span className="rounded bg-surface-container-high px-3 py-2 font-mono text-mono-data-sm text-outline">View options unavailable</span><Link className="cortex-focus rounded bg-primary px-3 py-2 font-headline text-headline-sm text-on-primary" href="/projects/new">+ Nieuw project</Link></div></header>

    <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Project summary metrics"><StitchMetric label="ACTIVE PROJECTS" value={String(active.length)} detail={active.length ? active.map((project) => project.product_key).join(" · ") : "Geen actieve lokale projecten"} tone="tertiary" /><StitchMetric label="SPRINT VELOCITY" value="Unavailable" detail="HYD-160 cycle-data ontbreekt" /><StitchMetric label="AVG BURN RATE" value="Unavailable" detail="Geen issue-tijdreeksbron" /><StitchMetric label="ACTIVE PRS" value="Unavailable" detail="Geen PR read-model" /></section>

    <section className="mt-6 grid gap-4 xl:grid-cols-12" aria-label="Active cycle board"><div className="xl:col-span-8"><StitchSectionTitle eyebrow="ACTIVE CYCLE BOARD" title="Werkstroom" detail="SORT: UNAVAILABLE" /><div className="mt-3 grid gap-3 md:grid-cols-3"><CycleColumn title="In progress" detail="HYD-160 issue-data ontbreekt." /><CycleColumn title="In review" detail="HYD-160 issue- en PR-data ontbreekt." /><CycleColumn title="Next cycle" detail="HYD-160 cycle-data ontbreekt." /></div></div><aside className="space-y-3 xl:col-span-4"><StitchUnavailable title="Activity stream" detail="Geen Linear-, GitHub- of PR-activity read-model beschikbaar." /><StitchUnavailable title="Repository state" detail="Geen repository-, branch- of CI-telemetriebron." /><StitchUnavailable title="Cortex Sprint Copilot" detail="Geen HYD-160 context. Geen fictief voorstel of mutatiepad." /></aside></section>

    <section className="mt-6" aria-label="Local project milestones"><StitchSectionTitle eyebrow="LOCAL PROJECT MILESTONES" title="Project roadmap" detail="DETAILROUTES BESCHIKBAAR" /><div className="mt-3 space-y-3">{projects.map((project) => <Link className="cortex-focus cortex-stitch-panel block px-4 py-3 transition-colors hover:bg-surface-container-high" href={`/projects/${project.slug}`} key={project.slug}><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="material-symbols-outlined text-primary" aria-hidden="true">view_timeline</span><div><h2 className="font-headline text-headline-md text-on-surface">{project.display_name}</h2><p className="mt-1 text-body-sm text-on-surface-variant">{project.notes || project.product_label || "Geen aanvullende projectcontext bekend."}</p></div></div><div className="flex items-center gap-2 font-mono text-mono-data-sm"><span className="rounded bg-surface-container-high px-2 py-1 text-on-surface-variant">{project.status}</span><span className="text-outline">{project.personal_status}</span></div></div></Link>)}{!projects.length && <StitchUnavailable title="Geen lokale projecten" detail="Maak een project om de roadmap te vullen." />}</div></section>
  </main>;
}

interface CycleColumnProps { readonly title: string; readonly detail: string; }

function CycleColumn({ title, detail }: CycleColumnProps) {
  return <StitchPanel className="min-h-64 p-3"><div className="flex items-center justify-between gap-2"><h3 className="font-headline text-headline-sm text-on-surface">{title}</h3><span className="material-symbols-outlined text-outline" aria-hidden="true">add</span></div><div className="mt-4 rounded bg-surface-container-low p-3"><p className="font-label-caps text-label-caps text-outline">UNAVAILABLE BY SOURCE</p><p className="mt-2 text-body-sm text-on-surface-variant">{detail}</p></div></StitchPanel>;
}
