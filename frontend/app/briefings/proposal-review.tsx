"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type Proposal = {
  id: string;
  title: string;
  rationale: string;
  record_type: "action" | "routine";
  record_id: string;
  changes: Record<string, unknown>;
  source_context: string[];
  expected_impact: string;
  status: "pending" | "accepted" | "rejected" | "failed";
  result: { message?: string } | null;
};

export function ProposalReview({ proposal }: { proposal: Proposal }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "accept" | "reject") {
    if (action === "accept" && !window.confirm("Pas deze ene voorgestelde wijziging toe?")) return;
    setBusy(true);
    setError("");
    const response = await fetch(`/api/briefing-proposals/${proposal.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "accept" ? JSON.stringify({ confirmed: true }) : undefined,
    });
    if (!response.ok) setError("Voorstel kon niet worden verwerkt.");
    setBusy(false);
    router.refresh();
  }

  return <article className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
    <p className="text-sm text-cyan-300">{proposal.status}</p>
    <h3 className="mt-1 font-medium text-white">{proposal.title}</h3>
    <p className="mt-1 text-sm text-slate-300">{proposal.rationale}</p>
    <p className="mt-3 text-sm text-slate-400">Doel: {proposal.record_type} · {proposal.record_id}</p>
    <p className="mt-1 text-sm text-slate-400">Verwacht effect: {proposal.expected_impact}</p>
    <p className="mt-1 text-sm text-slate-400">Broncontext: {proposal.source_context.join(" · ")}</p>
    <pre className="mt-3 overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-300">{JSON.stringify(proposal.changes, null, 2)}</pre>
    {proposal.status === "pending" && <div className="mt-4 flex gap-3"><button className="rounded bg-cyan-300 px-3 py-2 text-sm font-medium text-slate-950 disabled:opacity-50" disabled={busy} onClick={() => decide("accept")}>Accepteer</button><button className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50" disabled={busy} onClick={() => decide("reject")}>Wijs af</button></div>}
    {proposal.result?.message && <p className="mt-3 text-sm text-amber-300">{proposal.result.message}</p>}
    {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
  </article>;
}
