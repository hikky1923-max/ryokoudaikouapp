import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTrip } from "../../hooks/useTrip";
import { ItineraryTimeline } from "../itinerary/ItineraryTimeline";
import { BudgetPage } from "../budget/BudgetPage";

type Tab = "itinerary" | "budget";

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const { trip } = useTrip(tripId ?? "");
  const [tab, setTab] = useState<Tab>("itinerary");

  if (!trip) {
    return (
      <div className="empty-state">
        旅行が見つかりません。<Link to="/">旅行一覧へ戻る</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{trip.title}</h2>
        <Link to="/" className="muted">
          ← 一覧へ
        </Link>
      </div>
      <div className="granularity-switch" style={{ marginBottom: 14 }}>
        <button
          className={tab === "itinerary" ? "active" : ""}
          onClick={() => setTab("itinerary")}
        >
          行程表
        </button>
        <button className={tab === "budget" ? "active" : ""} onClick={() => setTab("budget")}>
          予算
        </button>
      </div>
      {tab === "itinerary" ? (
        <ItineraryTimeline tripId={trip.id} />
      ) : (
        <BudgetPage tripId={trip.id} />
      )}
    </div>
  );
}
