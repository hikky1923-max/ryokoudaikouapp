import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { useGoogleMapsReady } from "../../hooks/useGoogleMapsReady";
import type { Leg, LegMode } from "../../types";
import { LegEditForm } from "./LegEditForm";
import { AddStopForm } from "./AddStopForm";

const MODE_ICON: Record<LegMode, string> = {
  walk: "🚶",
  transit: "🚃",
};

const MODE_LABEL: Record<LegMode, string> = {
  walk: "徒歩",
  transit: "電車・バス",
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

  const details = leg.transitDetails ?? [];

  return (
    <div className="leg-connector">
      <div className="stop-time-col" />
      <div className="leg-rail" />
      <div className="leg-body">
        <div className="leg-info" onClick={() => setEditing((v) => !v)}>
          <div className="leg-mode-badge" title={MODE_LABEL[leg.mode]}>
            {MODE_ICON[leg.mode]}
          </div>
          <div className="leg-main">
            {details.length > 0 ? (
              details.map((detail, i) => {
                const isWalk = detail.lineName === "徒歩";
                return (
                  <div
                    className={`leg-segment${isWalk ? " leg-segment-walk" : ""}`}
                    key={i}
                  >
                    <span className="leg-segment-icon">{isWalk ? "🚶" : "🚃"}</span>
                    {isWalk ? (
                      <span className="muted">徒歩</span>
                    ) : (
                      <>
                        {detail.lineName && (
                          <span className="leg-line-name">{detail.lineName}</span>
                        )}
                        {detail.headsign && <span className="muted"> {detail.headsign}</span>}
                        {detail.departurePlatform && detail.arrivalPlatform && (
                          <span className="platform-chip" style={{ marginLeft: 6 }}>
                            発{detail.departurePlatform}番線 → 着{detail.arrivalPlatform}番線
                          </span>
                        )}
                      </>
                    )}
                    {i < details.length - 1 && (
                      <span className="muted"> ・ {detail.arrivalStop}で乗換</span>
                    )}
                  </div>
                );
              })
            ) : (
              <span className="muted">{MODE_LABEL[leg.mode]}</span>
            )}
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 2 }}>
              {leg.durationMinutes != null ? (
                <span className="muted">
                  {leg.durationMinutes}分
                  {leg.distanceMeters != null
                    ? `・${(leg.distanceMeters / 1000).toFixed(1)}km`
                    : ""}
                </span>
              ) : (
                <span className="muted">未計算</span>
              )}
            </div>
          </div>
          {leg.cost != null && <div className="leg-fare-box">{leg.cost}円</div>}
        </div>
        <div className="row" style={{ marginTop: 4 }}>
          {leg.mode === "walk" && leg.durationMinutes == null && ready && (
            <button className="btn btn-sm" disabled={calculating} onClick={handleCalculate}>
              {calculating ? "計算中..." : "ルートを計算"}
            </button>
          )}
          <button
            className="btn-icon"
            title="この後に場所を挿入"
            onClick={() => setAdding((v) => !v)}
          >
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
    </div>
  );
}
