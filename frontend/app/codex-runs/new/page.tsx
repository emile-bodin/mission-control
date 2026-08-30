import Link from "next/link";
import { CodexRunForm } from "../codex-run-form";

export default function NewCodexRunPage({ searchParams }: { searchParams: { project_id?: string } }) {
  const projectId = searchParams.project_id;
  return <main className="bcc-shell mx-auto min-h-screen">
    <Link className="text-cyan-300 underline" href={projectId ? `/projects/${projectId}` : "/projects"}>← Projecten</Link>
    <h1 className="mt-6 text-4xl font-semibold text-white">Nieuwe Codex-run</h1>
    <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><CodexRunForm projectId={projectId} /></div>
  </main>;
}
