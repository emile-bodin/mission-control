"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type Asset = {
  id: string;
  name: string;
  type: string;
  host: string;
  address: string;
  environment: string;
  status: "Onbekend" | "OK" | "Let op" | "Fout";
  notes: string;
  created_at: string;
  updated_at: string;
};

const statuses: Asset["status"][] = ["Onbekend", "OK", "Let op", "Fout"];

function payload(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  new FormData(form).forEach((value, key) => { values[key] = key === "notes" ? String(value) : String(value) || "Unknown"; });
  return values;
}

export function AssetForm({ asset }: { asset?: Asset }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const editing = Boolean(asset);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const response = await fetch(editing ? `/api/assets/${asset?.id}` : "/api/assets", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(event.currentTarget))
    });
    if (!response.ok) {
      setError((await response.json()).detail || "Asset kon niet worden bewaard.");
      return;
    }
    const saved: Asset = await response.json();
    router.push(`/homelab/${saved.id}`);
    router.refresh();
  }

  return <form className="grid gap-4" onSubmit={submit}>
    <label>Naam<input name="name" required defaultValue={asset?.name} /></label>
    <label>Type<input name="type" required defaultValue={asset?.type || "Unknown"} /></label>
    <label>Host<input name="host" required defaultValue={asset?.host || "Unknown"} /></label>
    <label>Adres<input name="address" required defaultValue={asset?.address || "Unknown"} /></label>
    <label>Omgeving<input name="environment" required defaultValue={asset?.environment || "Unknown"} /></label>
    <label>Status<select name="status" defaultValue={asset?.status || "Onbekend"}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <label>Notities<textarea name="notes" defaultValue={asset?.notes} /></label>
    {error && <p className="text-red-300">{error}</p>}
    <button className="w-fit rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">{editing ? "Bewaar wijzigingen" : "Maak asset"}</button>
  </form>;
}
