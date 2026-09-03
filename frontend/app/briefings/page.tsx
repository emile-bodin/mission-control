import Link from "next/link";

import { BriefingRefresh } from "./briefing-refresh";

type Proposal = { title: string; rationale: string };
type Briefing = {
  id: string;
  status: string;
  briefing: { summary: string; facts: string[]; proposals: Proposal[]; unknowns: string[] } | null;
  validation_error: string | null;
  finished_at: string | null;
};

export const dynamic = "force-dynamic";

export default async function BriefingsPage() {
  const response = await fetch("http://backend:8000/api/briefings", { cache: "no-store" });
  const latest: Briefing | undefined = response.ok ? (await response.json())[0] : undefined;
  const briefing = latest?.briefing;

  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-10 sm:px-10">
    <Link className="text-cyan-300 underline" href="/">← Vandaag</Link>
    <header className="mt-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold text-white">Dagbriefing</h1><p className="mt-1 text-sm text-slate-400">Feiten en voorstellen blijven gescheiden.</p></div><BriefingRefresh /></header>
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      {!latest && <p className="text-slate-400">Nog geen briefing. Handmatig verversen start een nieuwe run.</p>}
      {latest && !briefing && <p className="text-slate-400">Runstatus: {latest.status}. {latest.validation_error || "Resultaat nog niet beschikbaar."}</p>}
      {briefing && <div className="space-y-6"><p className="text-slate-100">{briefing.summary}</p><section><h2 className="font-semibold text-white">Feiten</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">{briefing.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul></section><section><h2 className="font-semibold text-white">Voorstellen</h2><div className="mt-2 space-y-3">{briefing.proposals.map((proposal) => <article className="rounded border border-slate-800 p-3" key={proposal.title}><h3 className="font-medium text-slate-100">{proposal.title}</h3><p className="mt-1 text-sm text-slate-400">{proposal.rationale}</p></article>)}</div></section><section><h2 className="font-semibold text-white">Unknown</h2><p className="mt-2 text-sm text-slate-400">{briefing.unknowns.join(", ") || "Geen."}</p></section></div>}
    </section>
  </main>;
}
