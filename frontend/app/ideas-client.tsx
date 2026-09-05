"use client";

import { FormEvent, useEffect, useState } from "react";

type Kind = "text" | "snippet" | "quick_task" | "voice_reference";
type Status = "captured" | "triaged" | "archived" | "deleted";
type Entry = { id: string; kind: Kind; status: Status; title: string; summary: string | null; created_at: string; updated_at: string; archived: boolean; deleted: boolean };
type EntriesResponse = { entries: Entry[]; page: number; limit: number; has_more: boolean };

const kindLabel: Record<Kind, string> = { text: "Tekst", snippet: "Snippet", quick_task: "Snelle taak", voice_reference: "Spraakreferentie" };
const statusLabel: Record<Status, string> = { captured: "Inbox", triaged: "Getrieerd", archived: "Archief", deleted: "Verwijderd" };

export function IdeasClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [kind, setKind] = useState<Kind | "">("");
  const [status, setStatus] = useState<Status | "">("");
  const [view, setView] = useState<"inbox" | "archive" | "all">("inbox");
  const [capture, setCapture] = useState("");
  const [captureKind, setCaptureKind] = useState<Exclude<Kind, "voice_reference">>("text");
  const [pairingCode, setPairingCode] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "pairing" | "error">("loading");
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setState("loading");
    const params = new URLSearchParams({ view, limit: "25" });
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/browser/stream-entries?${params}`, { cache: "no-store" });
      if (response.status === 401) { setState("pairing"); return; }
      if (!response.ok) throw new Error("unavailable");
      const body: EntriesResponse = await response.json();
      setEntries(body.entries);
      setState("ready");
    } catch {
      setState("error");
    }
  }

  useEffect(() => { void load(); }, [kind, status, view]);

  async function pair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const response = await fetch("/api/browser-sessions/pair", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairing_code: pairingCode }) });
    setPairingCode("");
    if (!response.ok) { setNotice("Koppelen mislukt of code is verlopen."); return; }
    await load();
  }

  async function mutate(path: string, method: "POST" | "DELETE", body?: unknown) {
    setNotice(null);
    const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (response.status === 401) { setState("pairing"); return; }
    if (!response.ok) { setNotice("Actie niet beschikbaar voor dit item."); return; }
    await load();
  }

  async function submitCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capture.trim()) return;
    await mutate("/api/stream-entries", "POST", { kind: captureKind, content: capture });
    setCapture("");
  }

  async function logout() {
    await fetch("/api/browser-sessions/current", { method: "DELETE" });
    setEntries([]);
    setState("pairing");
  }

  return <main className="mx-auto min-h-screen max-w-5xl px-6 py-10 sm:px-10">
    <p className="text-label-caps uppercase text-primary">Cortex / Second Brain</p>
    <h1 className="mt-2 font-headline text-headline-xl text-on-surface">Idea Incubator</h1>
    <p className="mt-2 max-w-2xl text-body-sm text-on-surface-variant">Captures en handmatige workflow. Geen AI-classificatie, verrijking of zoekindex beschikbaar.</p>

    {state === "pairing" && <section className="cockpit-card mt-8 rounded-xl border p-5"><h2 className="font-headline text-headline-md text-on-surface">Browser koppelen</h2><p className="mt-2 text-body-sm text-on-surface-variant">Gebruik een eenmalige pairing-code. Deze wordt niet in je browser opgeslagen.</p><form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={pair}><label className="sr-only" htmlFor="pairing-code">Pairing-code</label><input className="min-w-0 flex-1 rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-on-surface" id="pairing-code" required value={pairingCode} onChange={(event) => setPairingCode(event.target.value)} /><button className="rounded bg-primary px-4 py-2 font-medium text-on-primary" type="submit">Koppelen</button></form>{notice && <p className="mt-3 text-body-sm text-error">{notice}</p>}</section>}

    {state === "error" && <section className="cockpit-card mt-8 rounded-xl border p-5"><p className="text-on-surface">Second Brain is nu niet beschikbaar.</p><button className="cockpit-link mt-3" onClick={() => void load()} type="button">Opnieuw proberen</button></section>}

    {state === "ready" && <><div className="mt-8 flex justify-end"><button className="text-body-sm text-on-surface-variant underline" onClick={() => void logout()} type="button">Uitloggen</button></div><section className="cockpit-card mt-3 rounded-xl border p-5"><form className="flex flex-col gap-3" onSubmit={submitCapture}><label className="text-headline-sm text-on-surface" htmlFor="capture">Nieuwe capture</label><textarea className="min-h-24 rounded border border-outline-variant bg-surface-container-low p-3 text-on-surface" id="capture" maxLength={4000} placeholder="Leg een gedachte of taak vast" value={capture} onChange={(event) => setCapture(event.target.value)} /><div className="flex flex-wrap gap-3"><label className="text-body-sm text-on-surface-variant" htmlFor="capture-kind">Type</label><select className="rounded border border-outline-variant bg-surface-container-low px-2 text-on-surface" id="capture-kind" value={captureKind} onChange={(event) => setCaptureKind(event.target.value as Exclude<Kind, "voice_reference">)}>{(["text", "snippet", "quick_task"] as const).map((item) => <option key={item} value={item}>{kindLabel[item]}</option>)}</select><button className="rounded bg-primary px-4 py-2 font-medium text-on-primary" type="submit">Vastleggen</button></div></form></section>
      <section className="mt-8"><div className="flex flex-wrap items-end gap-3"><label className="text-body-sm text-on-surface-variant">Weergave<select className="ml-2 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-on-surface" value={view} onChange={(event) => setView(event.target.value as typeof view)}><option value="inbox">Inbox</option><option value="archive">Archief</option><option value="all">Alles</option></select></label><label className="text-body-sm text-on-surface-variant">Type<select className="ml-2 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-on-surface" value={kind} onChange={(event) => setKind(event.target.value as Kind | "")}><option value="">Alle</option>{(Object.keys(kindLabel) as Kind[]).map((item) => <option key={item} value={item}>{kindLabel[item]}</option>)}</select></label><label className="text-body-sm text-on-surface-variant">Status<select className="ml-2 rounded border border-outline-variant bg-surface-container-low px-2 py-1 text-on-surface" value={status} onChange={(event) => setStatus(event.target.value as Status | "")}><option value="">Alle</option>{(Object.keys(statusLabel) as Status[]).map((item) => <option key={item} value={item}>{statusLabel[item]}</option>)}</select></label></div>
        {notice && <p className="mt-4 text-body-sm text-error">{notice}</p>}
        <div className="mt-4 space-y-3">{entries.map((entry) => <article className="cockpit-card rounded-xl border p-5" key={entry.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-label-caps uppercase text-primary">{kindLabel[entry.kind]} · {statusLabel[entry.status]}</p><h2 className="mt-1 text-headline-sm text-on-surface">{entry.title}</h2>{entry.summary && entry.summary !== entry.title && <p className="mt-2 whitespace-pre-wrap text-body-sm text-on-surface-variant">{entry.summary}</p>}<p className="mt-3 text-mono-data-sm text-outline">{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(entry.created_at))}</p></div><div className="flex gap-2">{entry.status === "captured" && <button className="cockpit-link" onClick={() => void mutate(`/api/stream-entries/${entry.id}/triage`, "POST", {})} type="button">Triage voorstellen</button>}{!entry.archived && !entry.deleted && <button className="cockpit-link" onClick={() => void mutate(`/api/stream-entries/${entry.id}/archive`, "POST")} type="button">Archiveer</button>}{!entry.deleted && <button className="text-body-sm text-error" onClick={() => void mutate(`/api/stream-entries/${entry.id}`, "DELETE")} type="button">Verwijder</button>}</div></div></article>)}{!entries.length && <p className="cockpit-card rounded-xl border p-5 text-on-surface-variant">Geen entries voor deze filters.</p>}</div></section></>}
    {state === "loading" && <p className="mt-8 text-on-surface-variant">Second Brain laden…</p>}
  </main>;
}
