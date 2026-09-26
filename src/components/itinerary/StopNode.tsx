import { useEffect, useRef, useState } from "react";
import { addDays, differenceInMinutes, format } from "date-fns";
import { useTripStore } from "../../store/useTripStore";
import { useGoogleMapsReady } from "../../hooks/useGoogleMapsReady";
import { attachPlaceAutocomplete } from "../../lib/googleMaps";
import type { ComputedStopTime } from "../../lib/timeline";
import type { Stop, StopCategory } from "../../types";

const CATEGORY_ICON: Record<StopCategory, string> = {
  activity: "🎟",
  lodging: "🛏",
  other: "📍",
};

const CATEGORY_LABEL: Record<StopCategory, string> = {
  activity: "アクティビティ",
  lodging: "宿泊",
  other: "その他",
};

export function StopNode({
  stop,
  computedTime,
  canMoveUp,
  canMoveDown,
}: {
  stop: Stop;
  computedTime: ComputedStopTime;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const updateStop = useTripStore((s) => s.actions.updateStop);
  const deleteStop = useTripStore((s) => s.actions.deleteStop);
  const moveStop = useTripStore((s) => s.actions.moveStop);
  const addBudgetEntry = useTripStore((s) => s.actions.addBudgetEntry);
  const [expanded, setExpanded] = useState(false);
  const { ready } = useGoogleMapsReady();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const isPinned = stop.arrivalTime != null;
  const hasLocation = stop.placeId != null || (stop.lat != null && stop.lng != null);

  // 既存の場所の名前入力にもオートコンプリートを付与し、後から位置情報を設定し直せるようにする。
  useEffect(() => {
    if (!ready || !nameInputRef.current) return;
    const detach = attachPlaceAutocomplete(nameInputRef.current, (place) => {
      updateStop(stop.id, {
        name: place.name,
        placeId: place.placeId,
        lat: place.lat,
        lng: place.lng,
      });
    });
    return detach;
  }, [ready, stop.id, updateStop]);

  function handleAddToBudget() {
    if (stop.budgetEntryId) return;
    addBudgetEntry({
      tripId: stop.tripId,
      category: stop.category === "lodging" ? "lodging" : "activity",
      label: stop.name || "予約",
      plannedAmount: stop.bookingPrice ?? 0,
      stopId: stop.id,
    });
  }

  // 出発時刻(HH:mm)を直接編集した場合、到着時刻との差から滞在時間を逆算して更新する。
  // 到着時刻より前の時刻を入れた場合は日をまたいだとみなす。
  function handleDepartureTimeChange(value: string, arrival: Date) {
    const [h, m] = value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    let newDeparture = new Date(arrival);
    newDeparture.setHours(h, m, 0, 0);
    if (newDeparture < arrival) {
      newDeparture = addDays(newDeparture, 1);
    }
    const newStay = differenceInMinutes(newDeparture, arrival);
    updateStop(stop.id, { stayDurationMinutes: Math.max(0, newStay) });
  }

  return (
    <div className="stop-node">
      <div className="stop-time-col">
        <div className="stop-time">
          {computedTime.arrival ? format(computedTime.arrival, "M/d HH:mm") : "--:--"}
        </div>
        <button
          className={`btn-icon pin-toggle${isPinned ? " pinned" : ""}`}
          title={isPinned ? "時刻の固定を解除" : "時刻を固定"}
          onClick={() => {
            if (isPinned) {
              updateStop(stop.id, { arrivalTime: null });
            } else {
              const base = computedTime.arrival ?? new Date();
              updateStop(stop.id, { arrivalTime: format(base, "yyyy-MM-dd'T'HH:mm") });
            }
          }}
        >
          📌
        </button>
      </div>

      <div className="stop-rail">
        <div
          className={`stop-marker${stop.category === "lodging" ? " stop-marker-lodging" : ""}`}
        >
          {CATEGORY_ICON[stop.category]}
        </div>
      </div>

      <div
        className={`stop-body card${stop.category === "lodging" ? " stop-body-lodging" : ""}`}
      >
        <div className="card-header">
          <input
            ref={nameInputRef}
            className="stop-name-input"
            value={stop.name}
            onChange={(e) => updateStop(stop.id, { name: e.target.value, placeId: null, lat: null, lng: null })}
            placeholder="場所の名前"
          />
          <div className="row">
            <button className="btn-icon" disabled={!canMoveUp} onClick={() => moveStop(stop.id, "up")}>
              ▲
            </button>
            <button
              className="btn-icon"
              disabled={!canMoveDown}
              onClick={() => moveStop(stop.id, "down")}
            >
              ▼
            </button>
            <button
              className="btn-icon"
              onClick={() => {
                if (window.confirm(`「${stop.name || "この場所"}」を削除しますか？`)) {
                  deleteStop(stop.id);
                }
              }}
            >
              ×
            </button>
          </div>
        </div>

        {ready && !hasLocation && (
          <p className="muted">
            📍 位置情報が未設定です。名前の欄で候補を選び直すとルート計算ができるようになります。
          </p>
        )}

        <div className="row">
          <select
            className={stop.category === "lodging" ? "category-select-lodging" : ""}
            value={stop.category}
            onChange={(e) => updateStop(stop.id, { category: e.target.value as StopCategory })}
          >
            {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <label className="muted">滞在時間(分)</label>
          <input
            type="number"
            min={0}
            step={5}
            value={stop.stayDurationMinutes}
            onChange={(e) =>
              updateStop(stop.id, { stayDurationMinutes: Number(e.target.value) || 0 })
            }
            style={{ width: 72 }}
          />
          {computedTime.departure && computedTime.arrival && (
            <span className="row" style={{ gap: 2 }}>
              <span className="muted">→</span>
              <input
                type="time"
                className="inline-time-input"
                value={format(computedTime.departure, "HH:mm")}
                onChange={(e) =>
                  handleDepartureTimeChange(e.target.value, computedTime.arrival!)
                }
              />
              <span className="muted">出発</span>
            </span>
          )}
        </div>

        {isPinned && (
          <div className="field">
            <label>固定時刻</label>
            <input
              type="datetime-local"
              value={stop.arrivalTime ?? ""}
              onChange={(e) => updateStop(stop.id, { arrivalTime: e.target.value || null })}
            />
          </div>
        )}

        <button className="btn btn-sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "詳細を閉じる" : "メモ・予約を編集"}
        </button>

        {expanded && (
          <div style={{ marginTop: 8 }}>
            <div className="field">
              <label>メモ</label>
              <textarea
                value={stop.note}
                onChange={(e) => updateStop(stop.id, { note: e.target.value })}
                rows={2}
              />
            </div>
            <div className="field">
              <label>予約先URL</label>
              <input
                value={stop.bookingUrl ?? ""}
                onChange={(e) => updateStop(stop.id, { bookingUrl: e.target.value || null })}
                placeholder="https://..."
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label>予約先</label>
                <input
                  value={stop.bookingProvider ?? ""}
                  onChange={(e) =>
                    updateStop(stop.id, { bookingProvider: e.target.value || null })
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>金額</label>
                <input
                  type="number"
                  value={stop.bookingPrice ?? ""}
                  onChange={(e) =>
                    updateStop(stop.id, {
                      bookingPrice: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
            {stop.budgetEntryId ? (
              <p className="muted">✓ 予算に追加済み</p>
            ) : (
              <button className="btn btn-sm" onClick={handleAddToBudget}>
                予算に追加
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
