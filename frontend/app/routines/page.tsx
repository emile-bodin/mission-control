import { RoutinePage } from "./routine-page";

export const dynamic = "force-dynamic";
export default async function RoutinesPage() {
  try { const response = await fetch("http://backend:8000/api/routines", { cache: "no-store" }); return <RoutinePage initialRoutines={response.ok ? await response.json() : []} loadError={response.ok ? null : "Routines konden niet worden geladen."} />; }
  catch { return <RoutinePage initialRoutines={[]} loadError="Routine-bron is niet bereikbaar." />; }
}
