import { ActionDomainPage } from "../personal/action-domain-page";
import type { Action } from "../actions/action-form";

export const dynamic = "force-dynamic";
export default async function AdministrationPage() {
  try {
    const response = await fetch("http://backend:8000/api/actions?domain=administratie", { cache: "no-store" });
    return <ActionDomainPage title="Administratie" domain="administratie" initialActions={response.ok ? await response.json() as Action[] : []} loadError={response.ok ? null : "Administratie kon niet worden geladen."} />;
  } catch { return <ActionDomainPage title="Administratie" domain="administratie" initialActions={[] as Action[]} loadError="Administratie-bron is niet bereikbaar." />; }
}
