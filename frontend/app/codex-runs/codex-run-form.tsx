"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const fields = [
  ["project_id", "Project slug", true],
  ["linear_issue", "Linear issue"],
  ["repo", "Repo"],
  ["branch", "Branch"],
  ["start_sha", "Start SHA"],
  ["end_sha", "End SHA"],
  ["commit_sha", "Commit SHA"],
  ["model", "Model"],
  ["profile", "TOML profile"],
  ["reasoning_level", "Reasoning level"],
  ["status", "Status"],
  ["summary", "Summary"],
  ["verification", "Verification/tests"],
  ["changed_files", "Changed files"],
  ["risks", "Risks"],
  ["next_step", "Next step"]
] as const;

export function CodexRunForm({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values: Record<string, string> = {};
    new FormData(event.currentTarget).forEach((value, key) => { values[key] = String(value) || "Unknown"; });
    const response = await fetch("/api/codex-runs", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(values)
    });
    if (!response.ok) {
      setError((await response.json()).detail || "Codex-run kon niet worden bewaard.");
      return;
    }
    router.push(`/projects/${values.project_id}`);
    router.refresh();
  }

  return <form className="grid gap-4" onSubmit={submit}>
    {fields.map(([name, label, required]) => <label key={name}>{label}<textarea className="min-h-10" name={name} required={required} defaultValue={name === "project_id" ? projectId : "Unknown"} /></label>)}
    <label>Session type<select name="session_type" defaultValue="Unknown"><option>Unknown</option><option>new</option><option>current</option><option>existing</option></select></label>
    {error && <p className="text-red-300">{error}</p>}
    <button className="w-fit rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">Maak Codex-run</button>
  </form>;
}
