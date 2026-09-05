import Link from "next/link";

import { StitchPanel, StitchSectionTitle, StitchUnavailable } from "../stitch-primitives";
import { BriefingRefresh } from "./briefing-refresh";
import { ProposalReview, type Proposal } from "./proposal-review";

type Briefing = { id: string; status: string; briefing: { summary: string; facts: string[]; proposals: Proposal[]; unknowns: string[] } | null; validation_error: string | null; finished_at: string | null };

export const dynamic = "force-dynamic";

export default async function BriefingsPage() {
  const response = await fetch("http://backend:8000/api/briefings", { cache: "no-store" });
  const latest: Briefing | undefined = response.ok ? (await response.json())[0] : undefined;
  const briefing = latest?.briefing;
  const proposals: Proposal[] = latest ? await fetch(`http://backend:8000/api/briefing-proposals?briefing_id=${latest.id}`, { cache: "no-store" }).then((result) => result.ok ? result.json() : []) : [];
  const directives = [briefing?.facts[0], briefing?.facts[1], briefing?.unknowns[0]].filter((item): item is string => Boolean(item));

  return <main className="mx-auto max-w-[1600px] px-margin-mobile py-space-lg md:px-margin-desktop" aria-label="Executive daily briefing">
    <section className="relative overflow-hidden rounded-md border border-surface-container-highest bg-surface-container p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"><div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(ellipse_at_top_left,rgba(76,215,246,0.16),transparent_60%)]" /><div className="relative grid gap-5 xl:grid-cols-12"><div className="xl:col-span-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded bg-primary/10 px-2 py-1 font-label-caps text-label-caps text-primary">AUTONOMOUS BRIEF</span><span className="font-mono text-mono-data-sm text-outline">{latest?.finished_at ? formatTime(latest.finished_at) : "NOT RUN"}</span></div><h1 className="mt-4 font-headline text-headline-xl text-on-surface">Dagbriefing</h1><p className="mt-2 max-w-3xl text-body-lg text-on-surface-variant">{briefing?.summary ?? "Geen geldige briefing beschikbaar. Alleen feitelijke bronnen en onbekenden worden getoond."}</p><div className="mt-5 grid gap-3 md:grid-cols-3">{directives.map((directive, index) => <DirectiveCard key={directive} index={index + 1} detail={directive} />)}{!directives.length && <DirectiveCard index={1} detail="Geen briefingfeit beschikbaar." />}</div></div><div className="flex gap-3 xl:col-span-4 xl:flex-col xl:justify-center"><div className="flex-1"><BriefingRefresh /></div><Link className="cortex-focus flex flex-1 items-center justify-center rounded bg-surface-container-high px-4 py-3 text-body-sm text-on-surface" href="/actions"><span className="material-symbols-outlined mr-2 text-primary" aria-hidden="true">checklist</span>Bekijk work-items</Link></div></div></section>

    <section className="mt-4 grid gap-3 md:grid-cols-2" aria-label="Briefing context strips"><Link className="cortex-focus cortex-stitch-panel flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container-high" href="/projects"><span><span className="block font-label-caps text-label-caps text-outline">LINEAR WORKSPACE</span><span className="mt-1 block font-headline text-headline-sm text-on-surface">Lokale projectcontext</span></span><span className="font-mono text-mono-data-sm text-outline">UNAVAILABLE BY SOURCE</span></Link><Link className="cortex-focus cortex-stitch-panel flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-container-high" href="/homelab"><span><span className="block font-label-caps text-label-caps text-outline">CLUSTER TELEMETRY</span><span className="mt-1 block font-headline text-headline-sm text-on-surface">Pulse read-only context</span></span><span className="font-mono text-mono-data-sm text-outline">OPEN HOMELAB</span></Link></section>

    <section className="mt-6 grid gap-4 xl:grid-cols-12" aria-label="Briefing details"><div className="space-y-4 xl:col-span-7"><StitchPanel className="p-4"><StitchSectionTitle eyebrow="VALIDATED FACTS" title="Facts & signals" detail={latest?.status.toUpperCase() ?? "UNKNOWN"} /><ul className="mt-4 space-y-3">{briefing?.facts.map((fact) => <li className="border-l-2 border-primary pl-3 text-body-sm text-on-surface-variant" key={fact}>{fact}</li>)}{!briefing?.facts.length && <li className="text-body-sm text-on-surface-variant">Geen gevalideerde briefingfeiten.</li>}</ul></StitchPanel><StitchPanel className="p-4"><StitchSectionTitle eyebrow="BRIEFING RUN" title="Status & timestamp" detail={latest?.status.toUpperCase() ?? "UNKNOWN"} /><p className="mt-4 text-body-sm text-on-surface-variant">{latest?.validation_error || "Geen validatiefout bekend."}</p><p className="mt-3 font-mono text-mono-data-sm text-outline">{latest?.finished_at ? `Laatst afgerond: ${formatTime(latest.finished_at)}` : "Nog niet afgerond"}</p></StitchPanel></div><aside className="space-y-4 xl:col-span-5"><StitchPanel className="p-4"><StitchSectionTitle eyebrow="PROPOSALS" title="Review vereist" detail={`${proposals.length} ITEMS`} /><div className="mt-4 space-y-3">{proposals.map((proposal) => <ProposalReview key={proposal.id} proposal={proposal} />)}{!proposals.length && <p className="text-body-sm text-on-surface-variant">Geen toepasbare voorstellen.</p>}</div></StitchPanel><StitchUnavailable title="Coprocessor inspector" detail="Briefingvoorstellen blijven proposal-only. Er wordt niets uitgevoerd zonder expliciete bevestiging." /></aside></section>

    <section className="mt-6" aria-label="Unknowns"><StitchPanel className="p-4"><StitchSectionTitle eyebrow="UNKNOWN / UNAVAILABLE" title="Open vragen en ontbrekende bronnen" /><p className="mt-4 text-body-sm text-on-surface-variant">{briefing?.unknowns.join(" · ") || "Geen onbekenden gemeld."}</p></StitchPanel></section>
  </main>;
}

interface DirectiveCardProps { readonly index: number; readonly detail: string; }

function DirectiveCard({ index, detail }: DirectiveCardProps) {
  return <article className="rounded bg-surface-container-low p-3"><span className="rounded bg-primary/10 px-2 py-1 font-mono text-mono-data-sm text-primary">{String(index).padStart(2, "0")}</span><p className="mt-3 line-clamp-4 text-body-sm text-on-surface-variant">{detail}</p></article>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
