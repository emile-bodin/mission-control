import type { Metadata } from "next";
import Image from "next/image";
import "./globals.css";
import { CortexTopbar } from "./cortex-topbar";
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
        <div className="cortex-root">
          <aside className="border-b border-surface-container-highest bg-surface-container-lowest px-space-base py-space-sm md:fixed md:inset-y-0 md:left-0 md:z-50 md:flex md:w-16 md:flex-col md:border-b-0 md:border-r md:px-space-sm lg:w-sidebar-width lg:px-space-base">
            <div className="flex h-12 items-center justify-between gap-space-sm lg:h-16">
              <div className="grid h-8 w-8 place-items-center overflow-hidden rounded border border-primary/35 bg-primary/10"><Image alt="Cortex Command" height={32} priority src="/cortex-command-logo.svg" width={32} /></div>
              <div className="hidden min-w-0 lg:block"><p className="font-label-caps text-label-caps text-outline">WORKSPACE ROOT</p><p className="mt-0.5 font-mono text-mono-data-sm text-outline">v2.4.0</p></div>
            </div>
            <Navigation />
            <div className="mt-space-lg hidden border-t border-surface-container-highest pt-space-sm lg:block">
              <p className="font-label-caps text-label-caps uppercase text-outline">SYSTEM STATUS</p>
              <p className="mt-space-xs flex items-center gap-2 font-mono text-mono-data-sm text-on-surface-variant"><span className={`h-1.5 w-1.5 rounded-full ${homelab.available ? "bg-tertiary" : "bg-outline"}`} />{homelab.available ? `Pulse ${online}/${homelab.resources.length} online` : "Pulse: Unknown"}</p>
            </div>
            <footer className="mt-8 hidden border-t border-surface-container-highest pt-space-sm md:mt-auto md:flex md:items-center md:justify-center lg:justify-start lg:gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-bright font-mono text-mono-data-sm text-on-surface">EB</span>
              <span className="hidden min-w-0 lg:block"><span className="block truncate text-body-sm text-on-surface">Emile Bodin</span><span className="block truncate font-mono text-mono-data-sm text-outline">Persoonlijke workspace</span></span>
            </footer>
          </aside>
          <CortexTopbar pulseAvailable={homelab.available} pulseOnline={online} pulseTotal={homelab.resources.length} />
          <div className="min-h-screen pt-14 md:pl-16 lg:pl-sidebar-width">{children}</div>
        </div>
      </body>
    </html>
  );
}
