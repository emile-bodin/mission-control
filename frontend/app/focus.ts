export type FocusAction = {
  id: string;
  title: string;
  status: "Open" | "Bezig" | "Klaar" | "Later";
  priority: string;
  due_date: string | null;
  status_card_id: string | null;
};

export type FocusCard = { id: string; status: "OK" | "Let op" | "Actie nodig" | "Geblokkeerd" | "Onbekend"; resolved_at: string | null };
export type FocusItem = FocusAction & { reason: string };

function priorityRank(priority: string) { return priority === "Hoog" ? 0 : priority === "Normaal" ? 1 : 2; }

export function buildFocus(actions: FocusAction[], cards: FocusCard[], today: string): FocusItem[] {
  const cardsById = new Map(cards.filter((card) => !card.resolved_at).map((card) => [card.id, card]));
  return actions.filter((action) => action.status !== "Klaar" && action.status !== "Later").map((action) => {
    const card = action.status_card_id ? cardsById.get(action.status_card_id) : undefined;
    const overdue = Boolean(action.due_date && action.due_date < today);
    const dueToday = action.due_date === today;
    const blocked = card?.status === "Geblokkeerd";
    const needsAttention = card?.status === "Actie nodig";
    const score = overdue ? 0 : blocked ? 1 : needsAttention ? 2 : dueToday ? 3 : action.priority === "Hoog" ? 4 : action.status === "Bezig" ? 5 : 6;
    const reason = overdue ? "Achterstallig" : blocked ? "Geblokkeerde statuskaart" : needsAttention ? "Statuskaart vraagt aandacht" : dueToday ? "Vandaag verschuldigd" : action.priority === "Hoog" ? "Hoge prioriteit" : action.status === "Bezig" ? "Al in uitvoering" : "Open actie";
    return { ...action, score, reason };
  }).sort((left, right) => left.score - right.score || priorityRank(left.priority) - priorityRank(right.priority) || (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31") || left.title.localeCompare(right.title)).slice(0, 3).map(({ score: _score, ...action }) => action);
}
