import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "./navigation";

type PulseResource = { status: string };
type Homelab = { available: boolean; resources: PulseResource[] };

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Persoonlijk overzicht"
};

async function getHomelab(): Promise<Homelab> {
  try {
    const response = await fetch("http://backend:8000/api/homelab", { cache: "no-store" });
    return response.ok ? await response.json() : { available: false, resources: [] };
  } catch {
    return { available: false, resources: [] };
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const homelab = await getHomelab();
  const online = homelab.resources.filter((resource) => resource.status.toLowerCase() === "online").length;

  return (
    <html lang="nl">
      <body>
        <div className="cockpit-root min-h-screen text-slate-100">
          <aside className="cockpit-sidebar border-b border-slate-800/90 px-4 py-4 md:fixed md:inset-y-0 md:left-0 md:flex md:w-64 md:flex-col md:border-b-0 md:border-r md:px-5 md:py-8">
            <div className="flex items-center gap-3 px-2">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-blue-300/35 bg-blue-400/10 text-xl text-blue-100">◌</div>
              <div><p className="text-sm font-bold tracking-[0.14em] text-white">MISSION</p><p className="text-sm font-bold tracking-[0.14em] text-blue-400">CONTROL</p></div>
            </div>
            <Navigation />
            <div className="mt-8 hidden rounded-2xl border border-slate-800 bg-slate-900/65 p-4 md:block">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-200"><span className={`h-2.5 w-2.5 rounded-full ${homelab.available ? "bg-emerald-400" : "bg-slate-500"}`} />Systeemstatus</p>
              <p className="mt-2 text-xs text-slate-500">{homelab.available ? `Pulse: ${online}/${homelab.resources.length} online` : "Pulse status: Unknown"}</p>
              <div className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-500">{homelab.available ? "Pulse-data is beschikbaar." : "Geen recente synchronisatie bekend."}</div>
            </div>
            <footer className="mt-8 hidden border-t border-slate-800 pt-5 md:mt-auto md:flex md:items-center md:gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-slate-300 to-slate-500 text-sm font-semibold text-slate-950">EB</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-100">Emile Bodin</span><span className="block truncate text-xs text-slate-500">Persoonlijke workspace</span></span>
            </footer>
          </aside>
          <div className="min-h-screen md:pl-64">{children}</div>
        </div>
      </body>
    </html>
  );
}
