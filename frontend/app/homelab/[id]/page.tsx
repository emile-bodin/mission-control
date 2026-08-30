"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Asset, AssetForm } from "../asset-form";

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset>();
  const [error, setError] = useState("");

  useEffect(() => { fetch(`/api/assets/${id}`).then((response) => response.ok ? response.json() : Promise.reject()).then(setAsset).catch(() => setError("Asset kon niet worden geladen.")); }, [id]);
  if (error) return <main className="bcc-shell text-red-300">{error}</main>;
  if (!asset) return <main className="bcc-shell text-slate-300">Asset laden…</main>;
  return <main className="bcc-shell mx-auto min-h-screen"><Link className="text-cyan-300 underline" href="/homelab">← Homelab</Link><h1 className="mt-6 text-4xl font-semibold text-white">{asset.name}</h1><dl className="mt-8 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6"><div><dt className="text-sm text-slate-400">Type</dt><dd>{asset.type}</dd></div><div><dt className="text-sm text-slate-400">Host / adres</dt><dd>{asset.host} · {asset.address}</dd></div><div><dt className="text-sm text-slate-400">Omgeving / status</dt><dd>{asset.environment} · {asset.status}</dd></div><div><dt className="text-sm text-slate-400">Notities</dt><dd>{asset.notes || "Unknown"}</dd></div></dl><section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"><h2 className="text-2xl font-semibold text-white">Bewerk asset</h2><div className="mt-6"><AssetForm asset={asset} /></div></section></main>;
}
