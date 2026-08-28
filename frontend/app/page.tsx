import Link from "next/link";

const unknownState = "Onbekend";
type StatusCard = { id: string; title: string; status: string; interpretation: string; resolved_at: string | null };

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const response = await fetch("http://backend:8000/api/status-cards", { cache: "no-store" });
  const cards: StatusCard[] = response.ok ? (await response.json()).filter((card: StatusCard) => !card.resolved_at) : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-12 sm:px-10">
      <header>
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Bodin Control Center</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Vandaag</h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-300">
          Persoonlijke cockpit voor feitelijke projectstatus en volgende stappen.
        </p>
        <Link className="mt-6 inline-block text-cyan-300 underline" href="/projects">
          Bekijk projecten
        </Link>
        <Link className="ml-4 inline-block text-cyan-300 underline" href="/status-cards">
          Bekijk statuskaarten
        </Link>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Overzicht">
        <StatusCard title="Projectstatus" value={unknownState} detail="Nog geen gegevensbron gekoppeld." />
        <StatusCard title="Homelabstatus" value={unknownState} detail="Nog geen gegevensbron gekoppeld." />
        <StatusCard title="Volgende stap" value={unknownState} detail="Nog niet afgeleid uit feiten." />
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6" aria-label="Open statuskaarten">
        <h2 className="text-xl font-semibold text-white">Open statuskaarten</h2>
        <div className="mt-4 grid gap-3">
          {cards.map((card) => <Link className="rounded border border-slate-800 p-4" href={`/status-cards/${card.id}`} key={card.id}><p className="text-sm text-cyan-300">{card.status}</p><h3 className="mt-1 font-semibold text-white">{card.title}</h3><p className="mt-2 text-sm text-slate-300">{card.interpretation}</p></Link>)}
          {!cards.length && <p className="text-slate-300">Geen open statuskaarten.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-white">Runlog</h2>
        <p className="mt-2 text-slate-300">Geen Codex-runs beschikbaar.</p>
      </section>
    </main>
  );
}

function StatusCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
      <h2 className="text-sm font-medium text-slate-400">{title}</h2>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-300">{detail}</p>
    </article>
  );
}
