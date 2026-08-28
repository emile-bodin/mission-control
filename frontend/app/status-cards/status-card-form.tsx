"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type StatusCard = {
  id: string;
  project_id: string | null;
  title: string;
  status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend";
  facts: string;
  interpretation: string;
  next_safe_step: string;
  source_type: string;
  source_reference: string;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

const statuses: StatusCard["status"][] = ["OK", "Let op", "Actie nodig", "Geblokkeerd", "Onbekend"];

function payload(form: HTMLFormElement) {
  const values: Record<string, string | boolean | null> = {};
  new FormData(form).forEach((value, key) => {
    values[key] = key === "resolved" ? value === "true" : String(value) || null;
  });
  return values;
}

export function StatusCardForm({ card, projectId }: { card?: StatusCard; projectId?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const editing = Boolean(card);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(editing ? `/api/status-cards/${card?.id}` : "/api/status-cards", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(event.currentTarget))
    });
    if (!response.ok) {
      setError((await response.json()).detail || "Statuskaart kon niet worden bewaard.");
      return;
    }
    const saved: StatusCard = await response.json();
    router.push(`/status-cards/${saved.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label>Titel<input name="title" required defaultValue={card?.title} /></label>
      <label>Project slug (optioneel)<input name="project_id" defaultValue={card?.project_id ?? projectId ?? ""} /></label>
      <label>Status<select name="status" defaultValue={card?.status || "Onbekend"}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Feiten<textarea name="facts" required defaultValue={card?.facts} /></label>
      <label>Interpretatie<textarea name="interpretation" required defaultValue={card?.interpretation} /></label>
      <label>Volgende veilige stap<textarea name="next_safe_step" required defaultValue={card?.next_safe_step} /></label>
      <label>Brontype<input name="source_type" required defaultValue={card?.source_type || "Unknown"} /></label>
      <label>Bronreferentie<input name="source_reference" required defaultValue={card?.source_reference || "Unknown"} /></label>
      <label>Laatst gecontroleerd<input name="last_checked_at" type="datetime-local" defaultValue={card?.last_checked_at?.slice(0, 16)} /></label>
      {editing && <label className="flex items-center gap-2"><input name="resolved" type="hidden" value="false" /><input defaultChecked={Boolean(card?.resolved_at)} name="resolved" type="checkbox" value="true" />Opgelost</label>}
      {error && <p className="text-red-300">{error}</p>}
      <button className="w-fit rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">{editing ? "Bewaar wijzigingen" : "Maak statuskaart"}</button>
    </form>
  );
}
