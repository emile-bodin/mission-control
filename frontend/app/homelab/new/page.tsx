import Link from "next/link";
import { AssetForm } from "../asset-form";

export default function NewAssetPage() {
  return <main className="bcc-shell mx-auto min-h-screen"><Link className="text-cyan-300 underline" href="/homelab">← Homelab</Link><h1 className="mt-6 text-4xl font-semibold text-white">Nieuwe asset</h1><div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><AssetForm /></div></main>;
}
