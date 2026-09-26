import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { useGoogleMapsReady } from "../../hooks/useGoogleMapsReady";
import type { Leg, LegMode } from "../../types";
import { LegEditForm } from "./LegEditForm";
import { AddStopForm } from "./AddStopForm";

const MODE_ICON: Record<LegMode, string> = {
  walk: "🚶",
  transit: "🚃",
  drive: "🚗",
  bicycle: "🚲",
};

export function LegConnector({ leg }: { leg: Leg }) {
  const recalculateLeg = useTripStore((s) => s.actions.recalculateLeg);
  const { ready } = useGoogleMapsReady();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState<string | null>(null);

  async function handleCalculate() {
    setCalculating(true);
    setCalcError(null);
    try {
      await recalculateLeg(leg.id);
    } catch (e) {
      setCalcError((e as Error).message);
    } finally {
      setCalculating(false);
    }
  }

  return (
    <div className="leg-connector">
      <div className="leg-line" />
      <div className="leg-info" onClick={() => setEditing((v) => !v)}>
        <span>{MODE_ICON[leg.mode]}</span>
        {leg.durationMinutes != null ? (
          <span>
            {leg.durationMinutes}分
            {leg.distanceMeters != null ? `・${(leg.distanceMeters / 1000).toFixed(1)}km` : ""}
          </span>
        ) : (
          <span className="muted">未計算</span>
        )}
        {leg.transitDetails?.[0]?.lineName && (
          <span className="muted">{leg.transitDetails[0].lineName}</span>
        )}
        {leg.cost != null && <span className="muted">{leg.cost}円</span>}
      </div>
      <div className="row">
        {leg.durationMinutes == null && ready && (
          <button className="btn btn-sm" disabled={calculating} onClick={handleCalculate}>
            {calculating ? "計算中..." : "ルートを計算"}
          </button>
        )}
        <button className="btn-icon" title="この後に場所を挿入" onClick={() => setAdding((v) => !v)}>
          ＋
        </button>
      </div>
      {calcError && (
        <p className="muted">自動計算に失敗しました。手動で入力してください: {calcError}</p>
      )}
      {editing && <LegEditForm leg={leg} onClose={() => setEditing(false)} />}
      {adding && (
        <AddStopForm
          tripId={leg.tripId}
          insertAfterStopId={leg.fromStopId}
          onDone={() => setAdding(false)}
        />
      )}
    </div>
  );
}
