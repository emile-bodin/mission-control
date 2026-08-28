"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusCardForm } from "../status-card-form";

export default function NewStatusCardPage() {
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => setProjectId(new URLSearchParams(window.location.search).get("project_id")), []);
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-10">
      <Link className="text-cyan-300 underline" href="/status-cards">← Statuskaarten</Link>
      <h1 className="mt-6 text-4xl font-semibold text-white">Nieuwe statuskaart</h1>
      <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><StatusCardForm key={projectId ?? "new"} projectId={projectId} /></div>
    </main>
  );
}
