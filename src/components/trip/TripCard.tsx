import { Link } from "react-router-dom";
import { useTripStore } from "../../store/useTripStore";
import type { Trip } from "../../types";

export function TripCard({ trip }: { trip: Trip }) {
  const stopCount = useTripStore(
    (s) => Object.values(s.stops).filter((st) => st.tripId === trip.id).length
  );
  const deleteTrip = useTripStore((s) => s.actions.deleteTrip);

  return (
    <div className="card trip-card">
      <div className="card-header">
        <h3>
          <Link to={`/trips/${trip.id}`}>{trip.title}</Link>
        </h3>
        <button
          className="btn-icon"
          onClick={() => {
            if (window.confirm(`「${trip.title}」を削除しますか？`)) {
              deleteTrip(trip.id);
            }
          }}
        >
          ×
        </button>
      </div>
      <p className="muted">
        {trip.area || "エリア未設定"} ・ {stopCount}件の場所
      </p>
    </div>
  );
}
