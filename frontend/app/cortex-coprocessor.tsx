"use client";

import { FormEvent, useState } from "react";

export type CoprocessorAvailability = {
  state: "available" | "pending" | "unavailable" | "error";
  reason: string;
};

type ProposalResponse = {
  state: "proposal" | "pending" | "unavailable" | "error";
  proposal: string | null;
  generated_at: string;
  context_categories: string[];
  reason: string | null;
};

export function CortexCoprocessor({ availability }: { availability: CoprocessorAvailability }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<ProposalResponse["state"] | CoprocessorAvailability["state"]>(availability.state);
  const [reason, setReason] = useState(availability.reason);
  const [proposal, setProposal] = useState<string | null>(null);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || state === "pending" || state === "unavailable") return;
    setState("pending");
    setReason("Codex maakt een voorstel.");
    setProposal(null);
    try {
      const response = await fetch("/api/cortex/coprocessor/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const result: ProposalResponse | null = response.ok ? await response.json() : null;
      if (!result) throw new Error("request failed");
      setState(result.state);
      setReason(result.reason ?? "Voorstel is alleen advies; er wordt niets uitgevoerd.");
      setProposal(result.proposal);
    } catch {
      setState("error");
      setReason("Voorstel kon niet worden opgehaald.");
    }
  }

  const unavailable = state === "unavailable" || state === "error";
  return <div>
    <PanelTitle state={state} />
    <p className="mt-space-xs text-body-sm text-on-surface-variant">{reason}</p>
    <form className="mt-space-base" onSubmit={ask}>
      <label className="font-label-caps text-label-caps text-outline" htmlFor="coprocessor-question">Vraag om advies</label>
      <textarea className="mt-space-xs min-h-24 w-full border-surface-container-highest bg-surface-container-lowest font-body text-body-sm text-on-surface disabled:cursor-not-allowed" disabled={unavailable || state === "pending"} id="coprocessor-question" maxLength={2000} onChange={(event) => setQuestion(event.target.value)} placeholder="Beschrijf vraag; Codex geeft alleen een voorstel." value={question} />
      <button className="cortex-focus mt-space-sm rounded bg-primary px-space-base py-space-sm font-headline text-headline-sm text-on-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={unavailable || state === "pending" || !question.trim()} type="submit">{state === "pending" ? "Voorstel bezig…" : "Ask AI"}</button>
    </form>
    {proposal && <article className="mt-space-base rounded-lg border border-primary/30 bg-surface-container-low p-space-sm" aria-live="polite"><p className="font-label-caps text-label-caps text-primary">VOORSTEL — GEEN ACTIE UITGEVOERD</p><p className="mt-space-xs whitespace-pre-wrap text-body-sm text-on-surface">{proposal}</p></article>}
  </div>;
}

function PanelTitle({ state }: { state: string }) {
  return <div className="flex items-center justify-between gap-space-sm"><div className="flex items-center gap-space-sm"><span className="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">auto_awesome</span><h2 className="font-headline text-headline-md text-on-surface">Cortex Coprocessor</h2></div><span className="rounded bg-surface-container-high px-space-xs py-space-2xs font-mono text-mono-data-sm text-outline">{state.toUpperCase()}</span></div>;
}
