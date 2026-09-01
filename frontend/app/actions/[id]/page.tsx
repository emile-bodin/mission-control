"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Action, ActionForm } from "../action-form";

export default function ActionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [action, setAction] = useState<Action>();
  const [error, setError] = useState("");

  useEffect(() => { fetch(`/api/actions/${id}`).then((response) => response.ok ? response.json() : Promise.reject()).then(setAction).catch(() => setError("Actie kon niet worden geladen.")); }, [id]);
  if (error) return <main className="p-12 text-red-300">{error}</main>;
  if (!action) return <main className="p-12 text-slate-300">Actie laden…</main>;

  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-10"><Link className="text-cyan-300 underline" href="/actions">← Acties</Link><h1 className="mt-6 text-4xl font-semibold text-white">{action.title}</h1><dl className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6"><div><dt className="text-sm text-slate-400">Status</dt><dd>{action.status}</dd></div><div><dt className="text-sm text-slate-400">Type / prioriteit</dt><dd>{action.type} · {action.priority}</dd></div><div><dt className="text-sm text-slate-400">Domein</dt><dd>{{ administratie: "Administratie", huis_gezin: "Huis / gezin", project: "Project" }[action.domain] || "Project"}</dd></div><div><dt className="text-sm text-slate-400">Bron</dt><dd>Project: {action.project_id || "Unknown"} · kaart: {action.status_card_id || "Unknown"}</dd></div><div><dt className="text-sm text-slate-400">Due date</dt><dd>{action.due_date || "Unknown"}</dd></div></dl><section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold text-white">Bewerk actie</h2><div className="mt-6"><ActionForm action={action} /></div></section></main>;
}
