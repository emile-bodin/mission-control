import { ActionDomainPage } from "../personal/action-domain-page";
import type { Action } from "../actions/action-form";

export const dynamic = "force-dynamic";
export default async function HouseholdPage() {
  try {
    const response = await fetch("http://backend:8000/api/actions?domain=huis_gezin", { cache: "no-store" });
    return <ActionDomainPage title="Huis en gezin" domain="huis_gezin" initialActions={response.ok ? await response.json() as Action[] : []} loadError={response.ok ? null : "Huis en gezin kon niet worden geladen."} />;
  } catch { return <ActionDomainPage title="Huis en gezin" domain="huis_gezin" initialActions={[] as Action[]} loadError="Huis en gezin-bron is niet bereikbaar." />; }
}
