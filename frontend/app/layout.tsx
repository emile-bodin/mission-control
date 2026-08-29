import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodin Control Center",
  description: "Personal project and homelab cockpit"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <div className="min-h-screen bg-[#070b12] text-slate-100">
          <aside className="border-b border-slate-800 bg-[#090e17] px-4 py-4 md:fixed md:inset-y-0 md:left-0 md:w-64 md:border-b-0 md:border-r md:px-5 md:py-7">
            <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center border border-cyan-300/60 bg-cyan-300/10 font-mono text-sm text-cyan-200">BC</div><div><p className="font-semibold text-white">Bodin Control</p><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Local operator</p></div></div>
            <nav className="mt-6 flex gap-1 overflow-x-auto md:block md:space-y-1" aria-label="Hoofdnavigatie">
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/">Today</Link>
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/projects">Projects</Link>
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/status-cards">Status Cards</Link>
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/actions">Actions</Link>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Codex Runs <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Homelab <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Settings <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
            </nav>
            <div className="mt-8 hidden border-t border-slate-800 pt-5 text-xs text-slate-500 md:block">No external integrations enabled.</div>
          </aside>
          <div className="md:pl-64">
            <header className="border-b border-slate-800 bg-[#0a101a]/90 px-5 py-3 backdrop-blur sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3"><span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-300">LOCAL</span><label className="min-w-[220px] flex-1"><span className="sr-only">Zoeken</span><input className="mt-0 border-slate-700 bg-slate-950/70 text-sm" placeholder="Search local modules…" readOnly /></label><span className="flex items-center gap-2 text-xs text-slate-500"><span className="h-2 w-2 rounded-full bg-slate-600" />Local status Unknown</span></div></header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
