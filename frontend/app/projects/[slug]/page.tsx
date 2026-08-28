"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Project, ProjectForm } from "../project-form";

const labels: Record<keyof Project, string> = {
  name: "Name", slug: "Slug", display_name: "Display name", product_key: "Product key", source_type: "Source type",
  linear_project_name: "Linear project name", linear_project_url: "Linear project URL", linear_team_key: "Linear team key",
  product_label: "Product label", visible_issue_prefix: "Visible issue prefix", technical_issue_prefix: "Technical issue prefix",
  status: "Status", personal_status: "Personal status", activity_source: "Activity source", notes: "Notes"
};

export default function ProjectDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [project, setProject] = useState<Project>();
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${slug}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setProject)
      .catch(() => setError("Project kon niet worden geladen."));
  }, [slug]);

  if (error) return <main className="p-12 text-red-300">{error}</main>;
  if (!project) return <main className="p-12 text-slate-300">Project laden…</main>;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
      <Link className="text-cyan-300 underline" href="/projects">← Projecten</Link>
      <h1 className="mt-6 text-4xl font-semibold text-white">{project.display_name}</h1>
      <dl className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:grid-cols-2">
        {(Object.keys(labels) as (keyof Project)[]).map((key) => <div key={key}><dt className="text-sm text-slate-400">{labels[key]}</dt><dd className="text-slate-100">{project[key] || "Unknown"}</dd></div>)}
      </dl>
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-2xl font-semibold text-white">Bewerk project</h2>
        <div className="mt-6"><ProjectForm project={project} /></div>
      </section>
    </main>
  );
}
