import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { formatCurrency, resolveBudgetLink } from "../../lib/budget";
import type { BudgetEntry, ID, Leg, Stop } from "../../types";

export function BudgetEntryRow({
  entry,
  stops,
  legs,
  currency,
}: {
  entry: BudgetEntry;
  stops: Stop[];
  legs: Record<ID, Leg>;
  currency: string;
}) {
  const updateBudgetEntry = useTripStore((s) => s.actions.updateBudgetEntry);
  const deleteBudgetEntry = useTripStore((s) => s.actions.deleteBudgetEntry);
  const linkBudgetEntryToStop = useTripStore((s) => s.actions.linkBudgetEntryToStop);
  const unlinkBudgetEntry = useTripStore((s) => s.actions.unlinkBudgetEntry);
  const [actualInput, setActualInput] = useState(entry.actualAmount?.toString() ?? "");

  const stopsById = Object.fromEntries(stops.map((s) => [s.id, s]));
  const link = resolveBudgetLink(entry, stopsById, legs);

  function handleActualBlur() {
    updateBudgetEntry(entry.id, {
      actualAmount: actualInput === "" ? null : Number(actualInput),
    });
  }

  return (
    <div className="card row-between">
      <div>
        <div style={{ fontWeight: 600 }}>{entry.label}</div>
        <div className="muted">
          計画: {formatCurrency(entry.plannedAmount, currency)}
          {link?.kind === "stop" && ` ・ ${link.stop.name}に紐付け`}
          {link?.kind === "leg" && " ・ 移動費として紐付け"}
        </div>
      </div>
      <div className="row">
        <input
          type="number"
          value={actualInput}
          onChange={(e) => setActualInput(e.target.value)}
          onBlur={handleActualBlur}
          placeholder="実績額"
          style={{ width: 100 }}
        />
        <label className="row">
          <input
            type="checkbox"
            checked={entry.isBooked}
            onChange={(e) => updateBudgetEntry(entry.id, { isBooked: e.target.checked })}
          />
          予約済み
        </label>
        {link ? (
          <button className="btn btn-sm" onClick={() => unlinkBudgetEntry(entry.id)}>
            リンク解除
          </button>
        ) : (
          stops.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) linkBudgetEntryToStop(entry.id, e.target.value);
              }}
            >
              <option value="">場所に紐付け</option>
              {stops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )
        )}
        <button className="btn-icon" onClick={() => deleteBudgetEntry(entry.id)}>
          ×
        </button>
      </div>
    </div>
  );
}
