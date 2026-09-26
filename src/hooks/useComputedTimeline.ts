import { useMemo } from "react";
import { computeStopTimes } from "../lib/timeline";
import type { ID, Leg, Stop } from "../types";

export function useComputedTimeline(
  stops: Stop[],
  legs: Record<ID, Leg>,
  tripStartDateTime?: string | null
) {
  return useMemo(
    () => computeStopTimes(stops, legs, tripStartDateTime),
    [stops, legs, tripStartDateTime]
  );
}
