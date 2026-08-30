import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bodin Control Center",
  description: "Personal workspace"
};

export const dynamic = "force-dynamic";

async function inboxCount() {
  try { const response = await fetch("http://backend:8000/api/inbox", { cache: "no-store" }); return response.ok ? (await response.json() as unknown[]).length : 0; } catch { return 0; }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const count = await inboxCount();
  return (
    <html lang="nl">
      <body>
        <div className="min-h-screen bg-[radial-gradient(circle_at_62%_0%,#111827_0%,#070b12_42%)] text-slate-100">
          <aside className="border-b border-slate-800 bg-[#090e17] px-4 py-4 md:fixed md:inset-y-0 md:left-0 md:flex md:w-56 md:flex-col md:border-b-0 md:border-r md:px-5 md:py-7">
            <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg border border-indigo-300/50 bg-indigo-300/10 font-mono text-sm text-indigo-200">BC</div><div><p className="font-semibold tracking-wide text-white">BODIN</p><p className="text-xs uppercase tracking-[0.18em] text-slate-500">Control Center</p></div></div>
            <nav className="mt-6 flex gap-1 overflow-x-auto md:block md:space-y-1" aria-label="Hoofdnavigatie">
              <Link className="block whitespace-nowrap rounded-md bg-indigo-500/30 px-3 py-2 text-sm text-indigo-100" href="/">Vandaag</Link>
              <Link className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/actions">Acties</Link>
              <Link className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/inbox">Inbox {count > 0 && <span className="ml-2 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-200">{count}</span>}</Link>
              <Link className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/projects">Projecten</Link>
              <Link className="block whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/status-cards">Statuskaarten</Link>
              <div className="my-4 border-t border-slate-800" />
              <Link className="whitespace-nowrap rounded px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white" href="/homelab">Homelab</Link>
            </nav>
            <footer className="mt-8 hidden border-t border-slate-800 pt-5 md:mt-auto md:flex md:items-center md:gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-500/70 text-sm font-medium text-white">B</span>
              <span className="min-w-0"><span className="block truncate text-sm text-slate-200">Bodin</span><span className="block truncate text-xs text-slate-500">Personal workspace</span></span>
            </footer>
          </aside>
          <div className="md:pl-56">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
