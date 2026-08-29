import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodin Control Center",
  description: "Personal workspace"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        <div className="min-h-screen bg-[#070b12] text-slate-100">
          <aside className="border-b border-slate-800 bg-[#090e17] px-4 py-4 md:fixed md:inset-y-0 md:left-0 md:w-56 md:border-b-0 md:border-r md:px-5 md:py-7">
            <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-indigo-300/50 bg-indigo-300/10 font-mono text-sm text-indigo-200">BC</div><div><p className="font-semibold tracking-wide text-white">BODIN</p><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Control Center</p></div></div>
            <nav className="mt-6 flex gap-1 overflow-x-auto md:block md:space-y-1" aria-label="Hoofdnavigatie">
              <Link className="block whitespace-nowrap rounded-md bg-indigo-500/30 px-3 py-2 text-sm text-indigo-100" href="/">Today</Link>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Inbox <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/projects">Projects</Link>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Notes <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/actions">Actions</Link>
              <div className="my-4 border-t border-slate-800" />
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/homelab">Homelab</Link>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Codex <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <div className="my-4 border-t border-slate-800" />
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Archive <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
              <span aria-disabled="true" className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-600">Settings <span className="ml-2 text-[10px] uppercase">Unknown</span></span>
            </nav>
            <div className="mt-8 hidden border-t border-slate-800 pt-5 text-xs text-slate-500 md:block">Personal workspace</div>
          </aside>
          <div className="md:pl-56">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
