"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FocusItem } from "./focus";

export function FocusActions({ items }: { items: FocusItem[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string>();
  const [error, setError] = useState("");
  async function updateStatus(id: string, status: "Klaar" | "Later") {
    setSaving(id); setError("");
    const response = await fetch(`/api/actions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setSaving(undefined);
    if (!response.ok) { setError("Actie kon niet worden bijgewerkt."); return; }
    router.refresh();
  }
  return <div className="space-y-3">{items.map((item) => <article className="rounded-md border border-slate-800 bg-slate-950/40 p-3" key={item.id}><Link className="block hover:text-indigo-300" href={`/actions/${item.id}`}><h3 className="font-medium text-slate-100">{item.title}</h3><p className="mt-1 text-xs text-indigo-200">{item.reason}</p><p className="mt-1 text-xs text-slate-500">{item.status} · {item.priority}{item.due_date ? ` · ${item.due_date}` : ""}</p></Link><div className="mt-3 flex gap-2"><button className="rounded border border-emerald-400/40 px-2.5 py-1 text-xs text-emerald-200 disabled:opacity-50" disabled={saving === item.id} onClick={() => updateStatus(item.id, "Klaar")}>Klaar</button><button className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 disabled:opacity-50" disabled={saving === item.id} onClick={() => updateStatus(item.id, "Later")}>Later</button></div></article>)}{!items.length && <p className="text-sm text-slate-500">Geen acties voor je focus. Goed moment voor een rustige inbox-check.</p>}{error && <p className="text-xs text-red-300">{error}</p>}</div>;
}
