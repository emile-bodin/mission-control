"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type Action = {
  id: string;
  title: string;
  type: string;
  status: "Open" | "Bezig" | "Klaar" | "Later";
  priority: string;
  project_id: string | null;
  status_card_id: string | null;
  due_date: string | null;
  domain: "administratie" | "huis_gezin" | "project";
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

const statuses: Action["status"][] = ["Open", "Bezig", "Klaar", "Later"];
const domains: Array<{ value: Action["domain"]; label: string }> = [
  { value: "administratie", label: "Administratie" },
  { value: "huis_gezin", label: "Huis / gezin" },
  { value: "project", label: "Project" },
];

function payload(form: HTMLFormElement) {
  const values: Record<string, string | null> = {};
  new FormData(form).forEach((value, key) => { values[key] = String(value) || null; });
  return values;
}

export function ActionForm({ action, projectId, statusCardId }: { action?: Action; projectId?: string | null; statusCardId?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const editing = Boolean(action);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(editing ? `/api/actions/${action?.id}` : "/api/actions", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(event.currentTarget))
    });
    if (!response.ok) {
      setError((await response.json()).detail || "Actie kon niet worden bewaard.");
      return;
    }
    const saved: Action = await response.json();
    router.push(`/actions/${saved.id}`);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label>Titel<input name="title" required defaultValue={action?.title} /></label>
      <label>Type<input name="type" required defaultValue={action?.type || "Unknown"} /></label>
      <label>Status<select name="status" defaultValue={action?.status || "Open"}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Prioriteit<input name="priority" required defaultValue={action?.priority || "Unknown"} /></label>
      <label>Project slug (optioneel)<input name="project_id" defaultValue={action?.project_id ?? projectId ?? ""} /></label>
      <label>Statuskaart-ID (optioneel)<input name="status_card_id" defaultValue={action?.status_card_id ?? statusCardId ?? ""} /></label>
      <label>Due date (optioneel)<input name="due_date" type="date" defaultValue={action?.due_date || ""} /></label>
      <label>Domein<select name="domain" defaultValue={action?.domain || "project"}>{domains.map((domain) => <option key={domain.value} value={domain.value}>{domain.label}</option>)}</select></label>
      {error && <p className="text-red-300">{error}</p>}
      <button className="w-fit rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">{editing ? "Bewaar wijzigingen" : "Maak actie"}</button>
    </form>
  );
}
