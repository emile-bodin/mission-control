"use client";

import { FormEvent, useState } from "react";
import type { Action } from "../actions/action-form";

type Domain = "administratie" | "huis_gezin";

type Values = {
  title: string;
  type: string;
  status: Action["status"];
  priority: string;
  due_date: string;
  project_id: string;
  status_card_id: string;
};

const statuses: Action["status"][] = ["Open", "Bezig", "Klaar", "Later"];
const blank: Values = { title: "", type: "Unknown", status: "Open", priority: "Unknown", due_date: "", project_id: "", status_card_id: "" };

function valuesFor(action?: Action): Values {
  if (!action) return blank;
  return { title: action.title, type: action.type, status: action.status, priority: action.priority, due_date: action.due_date ?? "", project_id: action.project_id ?? "", status_card_id: action.status_card_id ?? "" };
}

function errorMessage(body: unknown, fallback: string) {
  if (typeof body === "object" && body && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((item) => typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item)).join(" ");
  }
  return fallback;
}

export function ActionDomainPage({ title, domain, initialActions, loadError }: { title: string; domain: Domain; initialActions: Action[]; loadError?: string | null }) {
  const [actions, setActions] = useState(initialActions);
  const [editing, setEditing] = useState<Action | null>(null);
  const [values, setValues] = useState<Values>(blank);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function start(action?: Action) { setEditing(action ?? null); setValues(valuesFor(action)); setError(""); }
  function change(name: keyof Values, value: string) { setValues((current) => ({ ...current, [name]: value })); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError("");
    const response = await fetch(editing ? `/api/actions/${editing.id}` : "/api/actions", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, due_date: values.due_date || null, project_id: values.project_id || null, status_card_id: values.status_card_id || null, domain })
    });
    if (!response.ok) { setError(errorMessage(await response.json().catch(() => null), "Actie kon niet worden bewaard.")); setSaving(false); return; }
    const saved: Action = await response.json();
    setActions((current) => editing ? current.map((action) => action.id === saved.id ? saved : action) : [saved, ...current]);
    start(); setSaving(false);
  }

  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-6 sm:px-8 sm:py-10">
    <a className="text-cyan-300 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300" href="/">← Terug naar Vandaag</a>
    <header className="mt-5 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold text-white sm:text-4xl">{title}</h1><p className="mt-1 text-slate-400">Handmatige acties voor dit domein.</p></div><button className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="button" onClick={() => start()}>Nieuwe actie</button></header>
    {loadError && <p className="mt-6 text-sm text-red-300" role="alert">{loadError}</p>}
    <section className="mt-8 grid gap-4" aria-label={`${title} actielijst`}>
      {actions.map((action) => <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5" key={action.id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-cyan-300">{action.status} · {action.priority}</p><h2 className="mt-1 text-xl font-semibold text-white">{action.title}</h2><p className="mt-2 text-sm text-slate-300">{action.type} · deadline: {action.due_date || "geen"}</p></div><button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-100" type="button" onClick={() => start(action)}>Bekijken / bewerken</button></div></article>)}
      {!actions.length && <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-slate-300"><p>Nog geen acties voor {title.toLowerCase()}.</p><button className="mt-3 rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="button" onClick={() => start()}>Nieuwe actie</button></div>}
    </section>
    <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5" aria-labelledby="action-form-title"><h2 id="action-form-title" className="text-xl font-semibold text-white">{editing ? "Actie bewerken" : "Nieuwe actie"}</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="grid gap-1 text-sm text-slate-200">Titel<input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="title" required value={values.title} onChange={(event) => change("title", event.target.value)} /></label>
        <label className="grid gap-1 text-sm text-slate-200">Type<input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="type" required value={values.type} onChange={(event) => change("type", event.target.value)} /></label>
        <label className="grid gap-1 text-sm text-slate-200">Status<select className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="status" value={values.status} onChange={(event) => change("status", event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="grid gap-1 text-sm text-slate-200">Prioriteit<input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="priority" required value={values.priority} onChange={(event) => change("priority", event.target.value)} /></label>
        <label className="grid gap-1 text-sm text-slate-200">Deadline (optioneel)<input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="due_date" type="date" value={values.due_date} onChange={(event) => change("due_date", event.target.value)} /></label>
        <label className="grid gap-1 text-sm text-slate-200">Project slug (optioneel)<input className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="project_id" value={values.project_id} onChange={(event) => change("project_id", event.target.value)} /></label>
        <label className="grid gap-1 text-sm text-slate-200 sm:col-span-2">Statuskaart-ID (optioneel)<input className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white" name="status_card_id" value={values.status_card_id} onChange={(event) => change("status_card_id", event.target.value)} /></label>
        {error && <p className="sm:col-span-2 text-sm text-red-300" role="alert">{error}</p>}
        <div className="flex flex-wrap gap-3 sm:col-span-2"><button className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950 disabled:opacity-60" disabled={saving} type="submit">{saving ? "Bezig…" : editing ? "Bewaar wijzigingen" : "Maak actie"}</button>{editing && <button className="rounded border border-slate-700 px-4 py-2 text-slate-100" type="button" onClick={() => start()}>Annuleer</button>}</div>
      </form>
    </section>
  </main>;
}
