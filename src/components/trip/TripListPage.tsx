import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTripStore } from "../../store/useTripStore";
import { TripCard } from "./TripCard";

export function TripListPage() {
  const tripsRecord = useTripStore((s) => s.trips);
  const trips = useMemo(
    () => Object.values(tripsRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tripsRecord]
  );
  const addTrip = useTripStore((s) => s.actions.addTrip);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");

  function handleCreate() {
    if (!title.trim()) return;
    const id = addTrip(title.trim(), area.trim());
    setTitle("");
    setArea("");
    navigate(`/trips/${id}`);
  }

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3>新しい旅行を作成</h3>
        </div>
        <div className="field">
          <label>タイトル</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例: 京都1泊2日"
          />
        </div>
        <div className="field">
          <label>エリア</label>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="例: 京都" />
        </div>
        <button className="btn btn-primary" onClick={handleCreate}>
          作成する
        </button>
      </div>

      {trips.length === 0 ? (
        <div className="empty-state">まだ旅行がありません。上のフォームから作成してください。</div>
      ) : (
        <div className="trip-grid">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
