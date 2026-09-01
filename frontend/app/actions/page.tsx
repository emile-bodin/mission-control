import Link from "next/link";
import type { Action } from "./action-form";

export const dynamic = "force-dynamic";

const domainLabels = {
  administratie: "Administratie",
  huis_gezin: "Huis / gezin",
  project: "Project",
};

export default async function ActionsPage({ searchParams }: { searchParams?: { domain?: string } }) {
  const domain = searchParams?.domain && searchParams.domain in domainLabels ? searchParams.domain : undefined;
  const response = await fetch(`http://backend:8000/api/actions${domain ? `?domain=${domain}` : ""}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Acties konden niet worden geladen.");
  const actions: Action[] = await response.json();

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12 sm:px-10">
      <header className="flex items-start justify-between gap-4"><div><Link className="text-cyan-300 underline" href="/">← Vandaag</Link><h1 className="mt-6 text-4xl font-semibold text-white">Acties</h1></div><Link className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/actions/new">Nieuwe actie</Link></header>
      <form className="mt-6 flex flex-wrap items-end gap-3" action="/actions">
        <label>Domein<select name="domain" defaultValue={domain ?? ""}><option value="">Alle domeinen</option>{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <button className="rounded border border-slate-700 px-4 py-2 text-slate-200" type="submit">Filter</button>
      </form>
      <section className="mt-8 grid gap-4" aria-label="Actielijst">
        {actions.map((action) => <Link className="rounded-2xl border border-slate-800 bg-slate-900 p-5" href={`/actions/${action.id}`} key={action.id}><p className="text-sm text-cyan-300">{action.status} · {action.priority}</p><h2 className="mt-1 text-xl font-semibold text-white">{action.title}</h2><p className="mt-2 text-sm text-slate-300">{action.type} · due: {action.due_date || "Unknown"}</p><p className="mt-2 text-sm text-slate-400">{domainLabels[action.domain] || "Project"} · Project: {action.project_id || "Unknown"} · kaart: {action.status_card_id || "Unknown"}</p></Link>)}
        {!actions.length && <p className="text-slate-300">Geen handmatige acties.</p>}
      </section>
    </main>
  );
}
