import type { BudgetCategory, BudgetSummary } from "../../types";
import { formatCurrency } from "../../lib/budget";

const CATEGORY_LABEL: Record<BudgetCategory, string> = {
  lodging: "宿泊",
  transport: "交通",
  food: "食事",
  activity: "アクティビティ",
  shopping: "買い物",
  other: "その他",
};

export function BudgetSummaryPanel({
  summary,
  currency,
}: {
  summary: BudgetSummary;
  currency: string;
}) {
  const diff = summary.actualTotal - summary.plannedTotal;
  return (
    <div className="card">
      <div className="card-header">
        <h3>予算サマリー</h3>
      </div>
      <div className="row" style={{ gap: 24, marginBottom: 12 }}>
        <div>
          <div className="muted">計画合計</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {formatCurrency(summary.plannedTotal, currency)}
          </div>
        </div>
        <div>
          <div className="muted">実績合計</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {formatCurrency(summary.actualTotal, currency)}
          </div>
        </div>
        <div>
          <div className="muted">差額</div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: diff > 0 ? "var(--danger)" : "var(--success)",
            }}
          >
            {formatCurrency(diff, currency)}
          </div>
        </div>
      </div>
      <table className="budget-table">
        <thead>
          <tr>
            <th>カテゴリ</th>
            <th>計画</th>
            <th>実績</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(summary.byCategory).map(([category, amounts]) => (
            <tr key={category}>
              <td>{CATEGORY_LABEL[category as BudgetCategory]}</td>
              <td>{formatCurrency(amounts.planned, currency)}</td>
              <td>{formatCurrency(amounts.actual, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
