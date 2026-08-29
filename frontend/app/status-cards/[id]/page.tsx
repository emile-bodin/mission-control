"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusCard, StatusCardForm } from "../status-card-form";

export default function StatusCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [card, setCard] = useState<StatusCard>();
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/status-cards/${id}`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setCard)
      .catch(() => setError("Statuskaart kon niet worden geladen."));
  }, [id]);

  if (error) return <main className="p-12 text-red-300">{error}</main>;
  if (!card) return <main className="p-12 text-slate-300">Statuskaart laden…</main>;

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:px-10">
      <Link className="text-cyan-300 underline" href="/status-cards">← Statuskaarten</Link>
      <div className="mt-6 flex items-start justify-between gap-4"><h1 className="text-4xl font-semibold text-white">{card.title}</h1><Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href={`/actions/new?project_id=${card.project_id || ""}&status_card_id=${card.id}`}>Maak actie</Link></div>
      <dl className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div><dt className="text-sm text-slate-400">Status</dt><dd>{card.status}</dd></div>
        <div><dt className="text-sm text-slate-400">Feiten</dt><dd>{card.facts}</dd></div>
        <div><dt className="text-sm text-slate-400">Interpretatie</dt><dd>{card.interpretation}</dd></div>
        <div><dt className="text-sm text-slate-400">Volgende veilige stap</dt><dd>{card.next_safe_step}</dd></div>
        <div><dt className="text-sm text-slate-400">Bron</dt><dd>{card.source_type} · {card.source_reference}</dd></div>
      </dl>
      <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold text-white">Bewerk statuskaart</h2><div className="mt-6"><StatusCardForm card={card} /></div></section>
    </main>
  );
}
