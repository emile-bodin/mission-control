"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function QuickCapture() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = content.trim();
    if (!value) return;
    setSaving(true);
    setError("");
    const response = await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: value })
    });
    setSaving(false);
    if (!response.ok) {
      setError("Capture kon niet worden bewaard.");
      return;
    }
    setContent("");
    router.refresh();
  }

  return <form className="space-y-3" onSubmit={submit}>
    <textarea aria-label="Quick Capture" className="min-h-24 resize-none" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Schrijf iets voor je Inbox…" />
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-slate-500">Wordt lokaal in Inbox bewaard.</p>
      <button className="shrink-0 rounded-md bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" disabled={saving || !content.trim()}>{saving ? "Opslaan…" : "Opslaan"}</button>
    </div>
    {error && <p className="text-xs text-red-300">{error}</p>}
  </form>;
}
