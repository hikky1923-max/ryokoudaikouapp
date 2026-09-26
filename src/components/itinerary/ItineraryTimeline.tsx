import { useState } from "react";
import { useTrip } from "../../hooks/useTrip";
import { useComputedTimeline } from "../../hooks/useComputedTimeline";
import { useTripStore } from "../../store/useTripStore";
import { deriveDayGroups } from "../../lib/timeline";
import { StopNode } from "./StopNode";
import { LegConnector } from "./LegConnector";
import { DayDivider } from "./DayDivider";
import { AddStopForm } from "./AddStopForm";
import { ImportRouteForm } from "./ImportRouteForm";
import type { ID } from "../../types";

export function ItineraryTimeline({ tripId }: { tripId: ID }) {
  const { trip, stops, legs } = useTrip(tripId);
  const updateTrip = useTripStore((s) => s.actions.updateTrip);
  const computedTimes = useComputedTimeline(stops, legs, trip?.startDateTime);
  const dayGroups = deriveDayGroups(stops);
  const [addMode, setAddMode] = useState<"none" | "import" | "manual">("none");

  const legList = Object.values(legs);
  function legBetween(fromStopId: ID, toStopId: ID) {
    return legList.find((l) => l.fromStopId === fromStopId && l.toStopId === toStopId);
  }

  if (!trip) return null;

  const startField = (
    <div className="field" style={{ maxWidth: 260, marginBottom: 16 }}>
      <label>出発日時</label>
      <input
        type="datetime-local"
        value={trip.startDateTime ?? ""}
        onChange={(e) => updateTrip(trip.id, { startDateTime: e.target.value || null })}
      />
    </div>
  );

  if (stops.length === 0) {
    return (
      <div>
        {startField}
        <div className="empty-state">まだ場所が追加されていません。</div>
        <ImportRouteForm tripId={tripId} />
        <p className="muted" style={{ textAlign: "center" }}>
          または
        </p>
        <AddStopForm tripId={tripId} />
      </div>
    );
  }

  return (
    <div className="itinerary-timeline">
      {startField}
      {dayGroups.map((group, gi) => (
        <div key={group[0]?.id ?? gi}>
          <DayDivider dayNumber={gi + 1} stop={group[0]} computedTimes={computedTimes} />
          {group.map((stop) => {
            const idx = stops.findIndex((s) => s.id === stop.id);
            const nextStop = stops[idx + 1];
            const leg = nextStop ? legBetween(stop.id, nextStop.id) : undefined;
            return (
              <div key={stop.id}>
                <StopNode
                  stop={stop}
                  computedTime={computedTimes.get(stop.id) ?? { arrival: null, departure: null }}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < stops.length - 1}
                />
                {leg && <LegConnector leg={leg} />}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ marginTop: 12 }}>
        {addMode === "import" && (
          <ImportRouteForm tripId={tripId} onDone={() => setAddMode("none")} />
        )}
        {addMode === "manual" && (
          <AddStopForm tripId={tripId} onDone={() => setAddMode("none")} />
        )}
        {addMode === "none" && (
          <div className="row">
            <button className="btn btn-primary" onClick={() => setAddMode("import")}>
              📋 経路を貼り付けて追加
            </button>
            <button className="btn" onClick={() => setAddMode("manual")}>
              ＋ 場所を手動で追加
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
