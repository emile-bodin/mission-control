"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BriefingRefresh() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "running" | "error">("idle");

  async function refresh() {
    setState("running");
    const response = await fetch("/api/briefings/refresh", { method: "POST" });
    setState(response.ok ? "idle" : "error");
    router.refresh();
  }

  return <div className="flex items-center gap-3">
    <button className="rounded bg-cyan-300 px-4 py-2 font-medium text-slate-950 disabled:opacity-50" disabled={state === "running"} onClick={refresh}>
      {state === "running" ? "Briefing gestart…" : "Ververs briefing"}
    </button>
    {state === "error" && <p className="text-sm text-amber-300">Briefing kan nu niet starten.</p>}
  </div>;
}
