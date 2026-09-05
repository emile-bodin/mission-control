import Link from "next/link";

import { CortexPanel } from "../cortex-panel";
import { BriefingRefresh } from "./briefing-refresh";
import { ProposalReview, type Proposal } from "./proposal-review";

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
  const proposals: Proposal[] = latest
    ? await fetch(`http://backend:8000/api/briefing-proposals?briefing_id=${latest.id}`, { cache: "no-store" }).then((result) => result.ok ? result.json() : [])
    : [];

  return <main className="mx-auto min-h-screen max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop md:pt-24">
    <header className="flex flex-wrap items-start justify-between gap-space-base">
      <div><Link className="cortex-focus font-mono text-mono-data-sm text-primary" href="/">← Vandaag</Link><p className="mt-space-lg font-label-caps text-label-caps text-primary">AUTONOME BRIEF // FEITELIJK OVERZICHT</p><h1 className="mt-space-xs font-headline text-headline-xl text-on-surface">Dagbriefing</h1><p className="mt-space-xs max-w-2xl text-body-sm text-on-surface-variant">Feiten, onbekenden en voorstellen blijven apart. Een voorstel wijzigt niets zonder bevestiging.</p></div>
      <BriefingRefresh />
    </header>
    <section className="mt-space-lg grid gap-space-base xl:grid-cols-12">
      <CortexPanel className="p-space-base xl:col-span-8 xl:p-space-lg"><div className="flex items-center justify-between gap-space-sm border-b border-surface-container-highest pb-space-sm"><div><p className="font-label-caps text-label-caps text-outline">DAGELIJKSE DIRECTIVE</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Samenvatting</h2></div><span className="rounded bg-primary/10 px-space-sm py-space-2xs font-mono text-mono-data-sm text-primary">{latest?.status ?? "UNKNOWN"}</span></div>{!latest && <p className="mt-space-lg text-body-sm text-on-surface-variant">Nog geen briefing. Handmatig verversen start een nieuwe run.</p>}{latest && !briefing && <p className="mt-space-lg text-body-sm text-on-surface-variant">Runstatus: {latest.status}. {latest.validation_error || "Resultaat nog niet beschikbaar."}</p>}{briefing && <p className="mt-space-lg max-w-3xl text-body-lg text-on-surface">{briefing.summary}</p>}{latest?.finished_at && <p className="mt-space-lg font-mono text-mono-data-sm text-outline">Laatst afgerond: {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(latest.finished_at))}</p>}</CortexPanel>
      <CortexPanel className="p-space-base xl:col-span-4 xl:p-space-lg"><p className="font-label-caps text-label-caps text-outline">RUN STATUS</p><p className="mt-space-sm font-mono text-mono-metric-lg text-on-surface">{latest?.status ?? "Unknown"}</p><p className="mt-space-sm text-body-sm text-on-surface-variant">{latest?.validation_error || "Geen validatiefout bekend."}</p></CortexPanel>
      <CortexPanel className="p-space-base xl:col-span-5 xl:p-space-lg"><div className="border-b border-surface-container-highest pb-space-sm"><p className="font-label-caps text-label-caps text-outline">GEVALIDEERDE FEITEN</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Bronnen en signalen</h2></div>{briefing?.facts.length ? <ul className="mt-space-base space-y-space-sm">{briefing.facts.map((fact) => <li className="border-l-2 border-primary pl-space-sm text-body-sm text-on-surface-variant" key={fact}>{fact}</li>)}</ul> : <p className="mt-space-base text-body-sm text-on-surface-variant">Geen gevalideerde briefingfeiten.</p>}</CortexPanel>
      <CortexPanel className="p-space-base xl:col-span-7 xl:p-space-lg"><div className="border-b border-surface-container-highest pb-space-sm"><p className="font-label-caps text-label-caps text-outline">VOORSTELLEN</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Review vereist</h2></div><div className="mt-space-base space-y-space-sm">{proposals.map((proposal) => <ProposalReview key={proposal.id} proposal={proposal} />)}{!proposals.length && <p className="text-body-sm text-on-surface-variant">Geen toepasbare voorstellen.</p>}</div></CortexPanel>
      <CortexPanel className="p-space-base xl:col-span-12 xl:p-space-lg"><div className="flex flex-wrap items-start justify-between gap-space-base"><div><p className="font-label-caps text-label-caps text-outline">DIRECTIVE CONTEXT</p><h2 className="mt-space-xs font-headline text-headline-md text-on-surface">Prioriteiten en grenzen</h2></div><span className="rounded bg-surface-container-high px-space-sm py-space-2xs font-mono text-mono-data-sm text-outline">{proposals.length} REVIEW ITEMS</span></div><p className="mt-space-base text-body-sm text-on-surface-variant">{briefing?.facts[0] || "Geen prioriteitsfeit beschikbaar."} Voorstellen blijven los van feiten en vereisen bevestiging per item.</p></CortexPanel>
      <CortexPanel className="p-space-base xl:col-span-12 xl:p-space-lg"><p className="font-label-caps text-label-caps text-outline">ONBEKEND / ONBESCHIKBAAR</p><p className="mt-space-sm text-body-sm text-on-surface-variant">{briefing?.unknowns.join(" · ") || "Geen onbekenden gemeld."}</p></CortexPanel>
    </section>
  </main>;
}
