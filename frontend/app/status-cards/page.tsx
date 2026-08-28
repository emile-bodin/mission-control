import Link from "next/link";
import type { StatusCard } from "./status-card-form";

export const dynamic = "force-dynamic";

export default async function StatusCardsPage() {
  const response = await fetch("http://backend:8000/api/status-cards", { cache: "no-store" });
  if (!response.ok) throw new Error("Statuskaarten konden niet worden geladen.");
  const cards: StatusCard[] = await response.json();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
      <header className="flex items-start justify-between gap-4">
        <div><Link className="text-cyan-300 underline" href="/">← Vandaag</Link><h1 className="mt-6 text-4xl font-semibold text-white">Statuskaarten</h1></div>
        <Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/status-cards/new">Nieuwe statuskaart</Link>
      </header>
      <section className="mt-8 grid gap-4" aria-label="Statuskaarten">
        {cards.map((card) => <Link className="rounded-2xl border border-slate-800 bg-slate-900 p-5" href={`/status-cards/${card.id}`} key={card.id}>
          <p className="text-sm text-cyan-300">{card.status}{card.resolved_at ? " · opgelost" : ""}</p>
          <h2 className="mt-1 text-xl font-semibold text-white">{card.title}</h2>
          <p className="mt-2 text-sm text-slate-300">{card.interpretation}</p>
          <p className="mt-2 text-sm text-slate-400">Bron: {card.source_type} · {card.source_reference}</p>
        </Link>)}
      </section>
    </main>
  );
}
