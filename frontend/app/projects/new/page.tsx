import Link from "next/link";
import { ProjectForm } from "../project-form";

export default function NewProjectPage() {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-10">
      <Link className="text-cyan-300 underline" href="/projects">← Projecten</Link>
      <h1 className="mt-6 text-4xl font-semibold text-white">Nieuw project</h1>
      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><ProjectForm /></div>
    </main>
  );
}
