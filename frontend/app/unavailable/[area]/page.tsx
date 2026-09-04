import Link from "next/link";

const areas: Record<string, string> = { notes: "Notities", settings: "Instellingen" };

export default function UnavailablePage({ params }: { params: { area: string } }) {
  const title = areas[params.area] || "Deze pagina";
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 sm:px-10"><Link className="cockpit-link" href="/">← Dashboard</Link><section className="cockpit-card mt-8 rounded-2xl border p-6"><h1 className="text-2xl font-semibold text-white">{title}</h1><p className="mt-3 text-slate-400">Nog niet beschikbaar. Geen lokale data of workflow bestaat hiervoor; status blijft Unknown.</p></section></main>;
}
