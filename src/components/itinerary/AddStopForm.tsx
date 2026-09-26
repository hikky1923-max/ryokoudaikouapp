import { useEffect, useRef, useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { useGoogleMapsReady } from "../../hooks/useGoogleMapsReady";
import { attachPlaceAutocomplete, type PlaceSelection } from "../../lib/googleMaps";
import type { ID, StopCategory } from "../../types";

const CATEGORY_LABEL: Record<StopCategory, string> = {
  activity: "アクティビティ",
  lodging: "宿泊",
  other: "その他",
};

export function AddStopForm({
  tripId,
  insertAfterStopId,
  onDone,
}: {
  tripId: ID;
  insertAfterStopId?: ID | null;
  onDone?: () => void;
}) {
  const addStop = useTripStore((s) => s.actions.addStop);
  const { ready } = useGoogleMapsReady();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<StopCategory>("activity");
  const [stayMinutes, setStayMinutes] = useState(60);
  const [selected, setSelected] = useState<PlaceSelection | null>(null);

  useEffect(() => {
    if (!ready || !inputRef.current) return;
    const detach = attachPlaceAutocomplete(inputRef.current, (place) => {
      setSelected(place);
      setName(place.name);
    });
    return detach;
  }, [ready]);

  function handleAdd() {
    if (!name.trim()) return;
    addStop(
      tripId,
      {
        name: name.trim(),
        placeId: selected?.placeId ?? null,
        lat: selected?.lat ?? null,
        lng: selected?.lng ?? null,
        category,
        stayDurationMinutes: stayMinutes,
      },
      insertAfterStopId ?? null
    );
    setName("");
    setSelected(null);
    onDone?.();
  }

  return (
    <div className="card add-stop-form">
      <div className="field">
        <label>場所の名前{ready ? "（検索できます）" : ""}</label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSelected(null);
          }}
          placeholder="例: 清水寺"
        />
      </div>
      <div className="row">
        <select value={category} onChange={(e) => setCategory(e.target.value as StopCategory)}>
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
          value={stayMinutes}
          onChange={(e) => setStayMinutes(Number(e.target.value) || 0)}
          style={{ width: 72 }}
        />
      </div>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={handleAdd}>
          追加
        </button>
        {onDone && (
          <button className="btn btn-sm" onClick={onDone}>
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
