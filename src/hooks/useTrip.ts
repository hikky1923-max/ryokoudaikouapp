import { useMemo } from "react";
import { useTripStore } from "../store/useTripStore";
import type { ID } from "../types";

// Zustandのセレクタは毎回同じ参照を返す必要がある(useSyncExternalStoreの無限ループを避けるため)。
// filter/sortされた配列はセレクタの外、useMemoの中で導出する。
export function useTrip(tripId: ID) {
  const trip = useTripStore((s) => s.trips[tripId]);
  const stopsRecord = useTripStore((s) => s.stops);
  const legs = useTripStore((s) => s.legs);
  const budgetEntriesRecord = useTripStore((s) => s.budgetEntries);

  const stops = useMemo(
    () =>
      Object.values(stopsRecord)
        .filter((st) => st.tripId === tripId)
        .sort((a, b) => a.order - b.order),
    [stopsRecord, tripId]
  );
  const budgetEntries = useMemo(
    () => Object.values(budgetEntriesRecord).filter((e) => e.tripId === tripId),
    [budgetEntriesRecord, tripId]
  );

  return { trip, stops, legs, budgetEntries };
}
