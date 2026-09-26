import { addMinutes, parseISO } from "date-fns";
import type { ID, Leg, Stop } from "../types";

// Dayというエンティティはストアに存在しない。宿泊Stopの直後で新しい日が始まるとみなし、
// 表示のたびにこの関数で導出する。
export function deriveDayGroups(stops: Stop[]): Stop[][] {
  const groups: Stop[][] = [];
  let current: Stop[] = [];
  for (const stop of stops) {
    current.push(stop);
    if (stop.category === "lodging") {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export interface ComputedStopTime {
  arrival: Date | null;
  departure: Date | null;
}

function findLeg(legs: Leg[], fromStopId: ID, toStopId: ID): Leg | undefined {
  return legs.find((l) => l.fromStopId === fromStopId && l.toStopId === toStopId);
}

// 保存された派生データを持たず、stops/legsから毎回この場で計算する。
// ピン留めされた arrivalTime が常に優先され、それ以前のズレは黙って吸収する。
// tripStartDateTimeは旅行全体の出発日時。最初のStopが自分自身のarrivalTimeを
// 持たない場合にのみ、その暗黙のピン留めとして使われる。
export function computeStopTimes(
  stops: Stop[],
  legs: Record<ID, Leg>,
  tripStartDateTime?: string | null
): Map<ID, ComputedStopTime> {
  const legList = Object.values(legs);
  const result = new Map<ID, ComputedStopTime>();
  let cursor: Date | null = tripStartDateTime ? parseISO(tripStartDateTime) : null;

  stops.forEach((stop, i) => {
    if (stop.arrivalTime) {
      cursor = parseISO(stop.arrivalTime);
    }
    const arrival = cursor;
    const departure =
      arrival != null ? addMinutes(arrival, stop.stayDurationMinutes) : null;
    result.set(stop.id, { arrival, departure });
    cursor = departure;

    const next = stops[i + 1];
    if (next && cursor != null) {
      const leg = findLeg(legList, stop.id, next.id);
      if (leg?.durationMinutes != null) {
        cursor = addMinutes(cursor, leg.durationMinutes);
      }
    }
  });

  return result;
}
