import { format } from "date-fns";
import { ja } from "date-fns/locale";
import type { ComputedStopTime } from "../../lib/timeline";
import type { ID, Stop } from "../../types";

export function DayDivider({
  dayNumber,
  stop,
  computedTimes,
}: {
  dayNumber: number;
  stop: Stop | undefined;
  computedTimes: Map<ID, ComputedStopTime>;
}) {
  const arrival = stop ? computedTimes.get(stop.id)?.arrival : null;
  return (
    <div className="day-divider">
      <span>Day {dayNumber}</span>
      {arrival && <span className="muted">　{format(arrival, "M/d(EEE)", { locale: ja })}</span>}
    </div>
  );
}
