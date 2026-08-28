import Link from "next/link";
import type { Project } from "./project-form";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const response = await fetch("http://backend:8000/api/projects", { cache: "no-store" });
  if (!response.ok) throw new Error("Projecten konden niet worden geladen.");
  const projects: Project[] = await response.json();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
      <header className="flex items-start justify-between gap-4">
        <div><p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Bodin Control Center</p><h1 className="mt-3 text-4xl font-semibold text-white">Projecten</h1></div>
        <Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/projects/new">Nieuw project</Link>
      </header>
      <section className="mt-8 grid gap-4" aria-label="Projectenlijst">
        {projects.map((project) => (
          <Link className="rounded-2xl border border-slate-800 bg-slate-900 p-5" href={`/projects/${project.slug}`} key={project.slug}>
            <p className="text-sm text-cyan-300">{project.product_key} · {project.status}</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{project.display_name}</h2>
            <p className="mt-2 text-sm text-slate-300">{project.product_label || "Unknown"} · zichtbaar: {project.visible_issue_prefix || "Unknown"} · technisch: {project.technical_issue_prefix || "Unknown"}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
