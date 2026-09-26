import { useState } from "react";
import { useTrip } from "../../hooks/useTrip";
import { computeBudgetSummary } from "../../lib/budget";
import { useTripStore } from "../../store/useTripStore";
import { BudgetSummaryPanel } from "./BudgetSummaryPanel";
import { BudgetEntryRow } from "./BudgetEntryRow";
import type { BudgetCategory, ID } from "../../types";

const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  lodging: "宿泊",
  transport: "交通",
  food: "食事",
  activity: "アクティビティ",
  shopping: "買い物",
  other: "その他",
};

export function BudgetPage({ tripId }: { tripId: ID }) {
  const { trip, stops, legs, budgetEntries } = useTrip(tripId);
  const addBudgetEntry = useTripStore((s) => s.actions.addBudgetEntry);
  const summary = computeBudgetSummary(budgetEntries);

  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<BudgetCategory>("other");
  const [plannedAmount, setPlannedAmount] = useState("");

  function handleAdd() {
    if (!label.trim()) return;
    addBudgetEntry({
      tripId,
      category,
      label: label.trim(),
      plannedAmount: Number(plannedAmount) || 0,
    });
    setLabel("");
    setPlannedAmount("");
  }

  if (!trip) return null;

  return (
    <div>
      <BudgetSummaryPanel summary={summary} currency={trip.currency} />

      <div className="card">
        <div className="card-header">
          <h3>予算項目を追加</h3>
        </div>
        <div className="row">
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
            {Object.entries(CATEGORY_LABEL).map(([value, l]) => (
              <option key={value} value={value}>
                {l}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="例: 新幹線往復"
            style={{ flex: 1 }}
          />
          <input
            type="number"
            value={plannedAmount}
            onChange={(e) => setPlannedAmount(e.target.value)}
            placeholder="金額"
            style={{ width: 100 }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleAdd}>
            追加
          </button>
        </div>
      </div>

      {budgetEntries.length === 0 ? (
        <div className="empty-state">まだ予算項目がありません。</div>
      ) : (
        budgetEntries.map((entry) => (
          <BudgetEntryRow key={entry.id} entry={entry} stops={stops} legs={legs} currency={trip.currency} />
        ))
      )}
    </div>
  );
}
