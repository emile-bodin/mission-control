import Link from "next/link";
import { Inbox } from "../inbox";

export const dynamic = "force-dynamic";
type InboxItem = { id: string; content: string; created_at: string };

export default async function InboxPage() {
  const response = await fetch("http://backend:8000/api/inbox", { cache: "no-store" });
  const items: InboxItem[] = response.ok ? await response.json() : [];
  return <main className="bcc-shell mx-auto min-h-screen"><header><Link className="text-cyan-300 underline" href="/">← Vandaag</Link><h1 className="mt-6 text-4xl font-semibold text-white">Inbox</h1><p className="mt-2 text-sm text-slate-400">Vang gedachten op en verwerk ze wanneer je ruimte hebt.</p></header><section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5"><Inbox items={items} limit={items.length} /></section></main>;
}
