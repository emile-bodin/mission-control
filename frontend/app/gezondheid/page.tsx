import { HealthPage } from "./health-page";

export const dynamic = "force-dynamic";
export default async function HealthRoute() {
  try {
    const [weights, activities] = await Promise.all([fetch("http://backend:8000/api/health/weights", { cache: "no-store" }), fetch("http://backend:8000/api/health/activities", { cache: "no-store" })]);
    return <HealthPage initialWeights={weights.ok ? await weights.json() : []} initialActivities={activities.ok ? await activities.json() : []} loadError={weights.ok && activities.ok ? null : "Gezondheidsgegevens konden niet volledig worden geladen."} />;
  } catch { return <HealthPage initialWeights={[]} initialActivities={[]} loadError="Gezondheidsbron is niet bereikbaar." />; }
}
