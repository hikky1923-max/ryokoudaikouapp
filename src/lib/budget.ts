import type { BudgetCategory, BudgetEntry, BudgetSummary, ID, Leg, Stop } from "../types";

const CATEGORIES: BudgetCategory[] = [
  "lodging",
  "transport",
  "food",
  "activity",
  "shopping",
  "other",
];

export function computeBudgetSummary(entries: BudgetEntry[]): BudgetSummary {
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => [c, { planned: 0, actual: 0 }])
  ) as Record<BudgetCategory, { planned: number; actual: number }>;

  let plannedTotal = 0;
  let actualTotal = 0;

  for (const entry of entries) {
    const actual = entry.actualAmount ?? 0;
    plannedTotal += entry.plannedAmount;
    actualTotal += actual;
    byCategory[entry.category].planned += entry.plannedAmount;
    byCategory[entry.category].actual += actual;
  }

  return { plannedTotal, actualTotal, byCategory };
}

export type BudgetLink =
  | { kind: "stop"; stop: Stop }
  | { kind: "leg"; leg: Leg }
  | null;

// stopId/legIdのうち高々一方のみnon-nullという不変条件の解決をここに集約する。
export function resolveBudgetLink(
  entry: BudgetEntry,
  stops: Record<ID, Stop>,
  legs: Record<ID, Leg>
): BudgetLink {
  if (entry.stopId) {
    const stop = stops[entry.stopId];
    return stop ? { kind: "stop", stop } : null;
  }
  if (entry.legId) {
    const leg = legs[entry.legId];
    return leg ? { kind: "leg", leg } : null;
  }
  return null;
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency }).format(
    amount
  );
}
