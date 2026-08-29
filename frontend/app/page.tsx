import Link from "next/link";

type Project = { name: string; slug: string; display_name: string; product_key: string; status: string; personal_status: string };
type StatusCard = { id: string; project_id: string | null; title: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; interpretation: string; source_type: string; updated_at: string; resolved_at: string | null };
type Action = { id: string; title: string; status: "Open" | "Bezig" | "Klaar" | "Later" };

const pipeline = ["OK", "Let op", "Actie nodig", "Geblokkeerd", "Onbekend"] as const;

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const [projectsResponse, cardsResponse, actionsResponse] = await Promise.all([
    fetch("http://backend:8000/api/projects", { cache: "no-store" }),
    fetch("http://backend:8000/api/status-cards", { cache: "no-store" }),
    fetch("http://backend:8000/api/actions", { cache: "no-store" })
  ]);
  const projects: Project[] = projectsResponse.ok ? await projectsResponse.json() : [];
  const cards: StatusCard[] = cardsResponse.ok ? await cardsResponse.json() : [];
  const actions: Action[] = actionsResponse.ok ? await actionsResponse.json() : [];
  const visibleProjects = projects.filter((project) => !project.name.startsWith("ARCHIVE —"));
  const openCards = cards.filter((card) => !card.resolved_at);
  const activeProjects = visibleProjects.filter((project) => project.status === "Active");
  const needsAttention = openCards.filter((card) => card.status === "Actie nodig" || card.status === "Geblokkeerd");
  const openActions = actions.filter((action) => action.status !== "Klaar");
  const cardsByProject = new Map<string, number>();
  openCards.forEach((card) => { if (card.project_id) cardsByProject.set(card.project_id, (cardsByProject.get(card.project_id) || 0) + 1); });
  const recentCards = [...openCards].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const backendOk = projectsResponse.ok && cardsResponse.ok && actionsResponse.ok;

  return <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300">Mission control</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Today / local operating picture</h1></div><p className="max-w-md text-sm text-slate-400">Alleen lokale project-, statuskaart- en actierecords. Externe integraties: Disabled/Unknown.</p></header>
    <section className="mt-7 grid gap-px overflow-hidden border border-slate-800 bg-slate-800 sm:grid-cols-2 xl:grid-cols-5" aria-label="Mission summary"><Summary label="Active projects" value={String(activeProjects.length)} detail={`${visibleProjects.length} geregistreerd`} /><Summary label="Open status cards" value={String(openCards.length)} detail="handmatig beheerd" /><Summary label="Open actions" value={String(openActions.length)} detail="handmatig beheerd" /><Summary label="Need attention" value={String(needsAttention.length)} detail="actie nodig + geblokkeerd" /><Summary label="Backend" value={backendOk ? "OK" : "Unknown"} detail="local API" /></section>
    <section className="mt-7 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Project Fleet Status" detail="Lokale projectrecords"><div className="divide-y divide-slate-800">{visibleProjects.map((project) => <Link className="flex items-center gap-3 py-3 text-sm hover:bg-slate-800/40" href={`/projects/${project.slug}`} key={project.slug}><span className="grid h-8 w-8 place-items-center border border-slate-700 bg-slate-950 font-mono text-[10px] text-cyan-200">{project.product_key}</span><span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-200">{project.display_name}</span><span className="text-xs text-slate-500">{project.status} · personal: {project.personal_status}</span></span><span className="font-mono text-xs text-slate-400">{cardsByProject.get(project.slug) || 0} open</span></Link>)}{!visibleProjects.length && <p className="py-4 text-sm text-slate-500">Geen lokale projectrecords geladen.</p>}</div></Panel>
      <Panel title="Activity" detail="Recente lokale records"><div className="space-y-3">{recentCards.map((card) => <Link className="block border-l-2 border-cyan-400/50 bg-slate-950/50 px-3 py-2 hover:bg-slate-800" href={`/status-cards/${card.id}`} key={card.id}><p className="text-xs text-cyan-300">{card.status} · {card.source_type}</p><p className="mt-1 text-sm text-slate-200">{card.title}</p><p className="mt-1 text-xs text-slate-500">{card.interpretation}</p></Link>)}{!recentCards.length && <p className="text-sm text-slate-500">Geen open lokale statuskaarten.</p>}<div className="border-t border-slate-800 pt-3"><p className="text-xs uppercase tracking-[0.15em] text-slate-500">Open acties</p>{openActions.slice(0, 3).map((action) => <Link className="mt-2 block text-sm text-cyan-200 hover:underline" href={`/actions/${action.id}`} key={action.id}>{action.status} · {action.title}</Link>)}{!openActions.length && <p className="mt-2 text-sm text-slate-500">Geen open handmatige acties.</p>}</div></div></Panel>
    </section>
    <section className="mt-7 border border-slate-800 bg-[#0b111c] p-5" aria-label="Status pipeline"><div className="flex items-baseline justify-between gap-3"><h2 className="font-semibold text-white">Status pipeline</h2><p className="text-xs text-slate-500">Open statuskaarten</p></div><div className="mt-4 grid gap-2 sm:grid-cols-5">{pipeline.map((status) => <div className="border border-slate-800 bg-slate-950/60 p-3" key={status}><p className="text-xs text-slate-500">{status}</p><p className="mt-2 font-mono text-2xl text-slate-100">{openCards.filter((card) => card.status === status).length}</p></div>)}</div></section>
  </main>;
}

function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <article className="bg-[#0b111c] p-5"><p className="text-xs uppercase tracking-[0.15em] text-slate-500">{label}</p><p className="mt-3 font-mono text-3xl text-white">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></article>; }
function Panel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) { return <section className="border border-slate-800 bg-[#0b111c] p-5"><div className="flex items-baseline justify-between gap-3"><h2 className="font-semibold text-white">{title}</h2><p className="text-xs text-slate-500">{detail}</p></div><div className="mt-4">{children}</div></section>; }
