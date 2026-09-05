import Link from "next/link";

export interface CortexTopbarProps {
  readonly pulseAvailable: boolean;
  readonly pulseOnline: number;
  readonly pulseTotal: number;
}

export function CortexTopbar({ pulseAvailable, pulseOnline, pulseTotal }: CortexTopbarProps) {
  const time = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Amsterdam" }).format(new Date());
  const pulse = pulseAvailable ? `${pulseOnline}/${pulseTotal} Pulse` : "Pulse: Unknown";

  return <header className="cortex-topbar fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-surface-container-highest bg-surface-container-lowest/95 px-3 backdrop-blur md:left-16 lg:left-sidebar-width lg:px-6" aria-label="Cortex Command topbar">
    <Link className="cortex-focus hidden items-center gap-2 md:flex" href="/"><span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(76,215,246,0.9)]" /><span className="font-headline text-headline-sm tracking-tight text-on-surface">CORTEX // COMMAND</span><span className="hidden font-mono text-mono-data-sm text-tertiary xl:inline">AI SYNC: FACTUAL</span></Link>
    <Link className="cortex-focus ml-auto flex h-8 min-w-0 max-w-command-bar-max-width flex-1 items-center gap-2 rounded border border-surface-container-highest bg-surface-container px-3 text-on-surface-variant shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:ml-2" href="/ideas"><span className="material-symbols-outlined text-[17px] text-primary" aria-hidden="true">auto_awesome</span><span className="truncate text-body-sm">Ingest thought, search infra, or prompt assistant…</span><kbd className="ml-auto rounded bg-surface-container-lowest px-1.5 py-0.5 font-mono text-mono-data-sm text-outline">⌘K</kbd></Link>
    <div className="hidden shrink-0 text-right lg:block"><p className="font-mono text-mono-metric-md text-on-surface">{time}</p><p className="font-mono text-mono-data-sm text-outline">Europe/Amsterdam</p></div>
    <span className="hidden shrink-0 rounded bg-surface-container-high px-2 py-1 font-mono text-mono-data-sm text-outline xl:block">Proposal service: unavailable</span>
    <span className={`hidden shrink-0 rounded px-2 py-1 font-mono text-mono-data-sm lg:block ${pulseAvailable ? "bg-tertiary/10 text-tertiary" : "bg-surface-container-high text-outline"}`}>{pulse}</span>
    <span className="material-symbols-outlined shrink-0 text-on-surface-variant" aria-label="Meldingen">notifications</span>
  </header>;
}
