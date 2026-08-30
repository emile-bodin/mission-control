"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type InboxItem = { id: string; content: string; created_at: string };

export function Inbox({ items, limit }: { items: InboxItem[]; limit?: number }) {
  const router = useRouter();
  const [promoting, setPromoting] = useState<string>();
  const [error, setError] = useState("");

  async function promote(itemId: string) {
    setPromoting(itemId);
    setError("");
    const response = await fetch(`/api/inbox/${itemId}/promote`, { method: "POST" });
    setPromoting(undefined);
    if (!response.ok) {
      setError("Actie kon niet worden voorgesteld.");
      return;
    }
    router.refresh();
  }

  return <div className="divide-y divide-slate-800">
    {items.slice(0, limit ?? 5).map((item) => <div className="py-3 first:pt-0 last:pb-0" key={item.id}>
      <p className="whitespace-pre-wrap text-sm text-slate-200">{item.content}</p>
      <div className="mt-2 flex items-center justify-between gap-3"><time className="text-xs text-slate-500">{new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</time><button className="rounded border border-slate-700 px-2.5 py-1 text-xs text-indigo-300 hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-50" disabled={promoting === item.id} onClick={() => promote(item.id)}>{promoting === item.id ? "Toevoegen…" : "Naar Today"}</button></div>
    </div>)}
    {!items.length && <p className="text-sm text-slate-500">Inbox is leeg.</p>}
    {error && <p className="pt-3 text-xs text-red-300">{error}</p>}
  </div>;
}
