"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type Project = {
  name: string;
  slug: string;
  display_name: string;
  product_key: string;
  source_type: string;
  linear_project_name: string | null;
  linear_project_url: string | null;
  linear_team_key: string | null;
  product_label: string | null;
  visible_issue_prefix: string | null;
  technical_issue_prefix: string | null;
  status: string;
  personal_status: string;
  activity_source: string;
  notes: string;
};

const statuses = ["Active", "Maintenance", "Planned", "Backlog", "Paused", "Done", "Canceled", "Unknown"];
const fields = [
  ["display_name", "Display name"],
  ["product_key", "Product key"],
  ["source_type", "Source type"],
  ["linear_project_name", "Linear project name"],
  ["linear_project_url", "Linear project URL"],
  ["linear_team_key", "Linear team key"],
  ["product_label", "Product label"],
  ["visible_issue_prefix", "Visible issue prefix"],
  ["technical_issue_prefix", "Technical issue prefix"],
  ["activity_source", "Activity source"]
] as const;
const nullableFields = new Set([
  "linear_project_name",
  "linear_project_url",
  "linear_team_key",
  "product_label",
  "visible_issue_prefix",
  "technical_issue_prefix"
]);

function asPayload(form: HTMLFormElement) {
  const payload: Record<string, string | null> = {};
  new FormData(form).forEach((value, key) => {
    const text = String(value);
    if (text !== "") payload[key] = text;
    else if (nullableFields.has(key)) payload[key] = null;
    else if (key === "notes") payload[key] = "";
  });
  return payload;
}

export function ProjectForm({ project }: { project?: Project }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const editing = Boolean(project);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(editing ? `/api/projects/${project?.slug}` : "/api/projects", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asPayload(event.currentTarget))
    });
    if (!response.ok) {
      setError((await response.json()).detail || "Project could not be saved.");
      return;
    }
    const saved: Project = await response.json();
    router.push(`/projects/${saved.slug}`);
    router.refresh();
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <label>Name<input name="name" required defaultValue={project?.name} /></label>
      <label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={project?.slug} disabled={editing} /></label>
      {fields.map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={project?.[name] || ""} /></label>)}
      <label>Status<select name="status" defaultValue={project?.status || "Unknown"}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Personal status<select name="personal_status" defaultValue={project?.personal_status || "Unknown"}>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Notes<textarea name="notes" defaultValue={project?.notes} /></label>
      {error && <p className="text-red-300">{error}</p>}
      <button className="w-fit rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">
        {editing ? "Bewaar wijzigingen" : "Maak project"}
      </button>
    </form>
  );
}
