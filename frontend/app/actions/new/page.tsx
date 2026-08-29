"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionForm } from "../action-form";

export default function NewActionPage() {
  const [source, setSource] = useState({ projectId: null as string | null, statusCardId: null as string | null });

  useEffect(() => setSource({ projectId: new URLSearchParams(window.location.search).get("project_id"), statusCardId: new URLSearchParams(window.location.search).get("status_card_id") }), []);

  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-10"><Link className="text-cyan-300 underline" href="/actions">← Acties</Link><h1 className="mt-6 text-4xl font-semibold text-white">Nieuwe actie</h1><div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><ActionForm key={`${source.projectId}-${source.statusCardId}`} projectId={source.projectId} statusCardId={source.statusCardId} /></div></main>;
}
