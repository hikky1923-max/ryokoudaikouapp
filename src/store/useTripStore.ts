import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { v4 as uuid } from "uuid";
import type {
  BudgetEntry,
  ID,
  Leg,
  LegMode,
  Settings,
  Stop,
  Trip,
} from "../types";
import { computeRoute, geocodePlaceName, loadGoogleMapsScript } from "../lib/googleMaps";
import { computeStopTimes } from "../lib/timeline";

const now = () => new Date().toISOString();

interface TripPlannerState {
  trips: Record<ID, Trip>;
  stops: Record<ID, Stop>;
  legs: Record<ID, Leg>;
  budgetEntries: Record<ID, BudgetEntry>;
  settings: Settings;
}

function emptyState(): TripPlannerState {
  return {
    trips: {},
    stops: {},
    legs: {},
    budgetEntries: {},
    settings: { googleMapsApiKey: null, geminiApiKey: null },
  };
}

function tripStopsSorted(s: TripPlannerState, tripId: ID): Stop[] {
  return Object.values(s.stops)
    .filter((st) => st.tripId === tripId)
    .sort((a, b) => a.order - b.order);
}

// Legのcostが設定/変更された際に呼ぶ。工程表で入力された移動費用が予算タブに
// 自動的に反映されるよう、そのLegに紐づくBudgetEntryを作成/更新する
// (手動で作った既存のラベル・実績額・予約済みフラグは上書きしない)。
function syncLegBudgetEntry(s: TripPlannerState, leg: Leg) {
  if (leg.cost == null) return;
  let entry = leg.budgetEntryId ? s.budgetEntries[leg.budgetEntryId] : undefined;
  if (!entry) {
    entry = Object.values(s.budgetEntries).find((e) => e.legId === leg.id);
  }
  if (entry) {
    entry.plannedAmount = leg.cost;
    return;
  }
  const fromName = s.stops[leg.fromStopId]?.name ?? "";
  const toName = s.stops[leg.toStopId]?.name ?? "";
  const label = leg.transitDetails?.[0]?.lineName || `${fromName} → ${toName}`;
  const id = uuid();
  s.budgetEntries[id] = {
    id,
    tripId: leg.tripId,
    category: "transport",
    label,
    plannedAmount: leg.cost,
    actualAmount: null,
    isBooked: false,
    stopId: null,
    legId: leg.id,
    createdAt: now(),
  };
  leg.budgetEntryId = id;
}

// 構造変更（追加・削除・並び替え）の最後に必ず呼ぶ。隣接関係が変わったStopペアに合わせて
// Legを再構成する: もう隣接していないLegは削除し(紐づくBudgetEntryはリンク解除のみ)、
// 新しく隣接したペアには空のLegを作る。まだ隣接しているペアの既存Legはそのまま残す
// (手動編集値・費用・予約情報を保持するため)。
function syncLegsToAdjacency(s: TripPlannerState, tripId: ID) {
  const sorted = tripStopsSorted(s, tripId);
  const requiredPairs = new Set(
    sorted.slice(0, -1).map((st, i) => `${st.id}:${sorted[i + 1].id}`)
  );

  for (const leg of Object.values(s.legs)) {
    if (leg.tripId !== tripId) continue;
    if (!requiredPairs.has(`${leg.fromStopId}:${leg.toStopId}`)) {
      for (const entry of Object.values(s.budgetEntries)) {
        if (entry.legId === leg.id) entry.legId = null;
      }
      delete s.legs[leg.id];
    }
  }

  const existingPairs = new Set(
    Object.values(s.legs)
      .filter((l) => l.tripId === tripId)
      .map((l) => `${l.fromStopId}:${l.toStopId}`)
  );
  for (const pair of requiredPairs) {
    if (existingPairs.has(pair)) continue;
    const [fromStopId, toStopId] = pair.split(":");
    const id = uuid();
    s.legs[id] = {
      id,
      tripId,
      fromStopId,
      toStopId,
      // 徒歩をデフォルトにする: 自動計算できるのは徒歩のみなので、
      // 場所を手動で追加しただけの状態でも「ルートを計算」がすぐ使える。
      // 乗換案内の情報を貼り付けた場合はImportRouteForm/LegEditFormが
      // その直後にmode:"transit"へ上書きする。
      mode: "walk",
      durationMinutes: null,
      distanceMeters: null,
      isManualOverride: false,
      transitDetails: null,
      cost: null,
      bookingUrl: null,
      bookingProvider: null,
      budgetEntryId: null,
      createdAt: now(),
    };
  }
}

function reindexStops(s: TripPlannerState, tripId: ID) {
  tripStopsSorted(s, tripId).forEach((st, i) => {
    st.order = i;
  });
}

// budgetEntryのstopId/legIdリンクを解除する(呼び出し元がdraftを直接操作している前提)。
function unlinkBudgetEntryFromDraft(entry: BudgetEntry) {
  entry.stopId = null;
  entry.legId = null;
}

export interface NewStopInput {
  name: string;
  placeId?: string | null;
  lat?: number | null;
  lng?: number | null;
  category?: Stop["category"];
  stayDurationMinutes?: number;
  arrivalTime?: string | null;
  note?: string;
}

interface Actions {
  addTrip: (title: string, area: string) => ID;
  updateTrip: (id: ID, patch: Partial<Trip>) => void;
  deleteTrip: (id: ID) => void;

  addStop: (
    tripId: ID,
    input: NewStopInput,
    insertAfterStopId?: ID | null
  ) => ID;
  updateStop: (id: ID, patch: Partial<Stop>) => void;
  deleteStop: (id: ID) => void;
  moveStop: (id: ID, direction: "up" | "down") => void;

  recalculateLeg: (legId: ID) => Promise<void>;
  setLegOverride: (
    legId: ID,
    patch: Partial<
      Pick<Leg, "mode" | "durationMinutes" | "distanceMeters" | "cost" | "transitDetails">
    >
  ) => void;

  addBudgetEntry: (input: {
    tripId: ID;
    category: BudgetEntry["category"];
    label: string;
    plannedAmount: number;
    actualAmount?: number | null;
    isBooked?: boolean;
    stopId?: ID | null;
    legId?: ID | null;
  }) => ID;
  updateBudgetEntry: (id: ID, patch: Partial<BudgetEntry>) => void;
  deleteBudgetEntry: (id: ID) => void;
  linkBudgetEntryToStop: (budgetEntryId: ID, stopId: ID) => void;
  linkBudgetEntryToLeg: (budgetEntryId: ID, legId: ID) => void;
  unlinkBudgetEntry: (budgetEntryId: ID) => void;

  updateSettings: (patch: Partial<Settings>) => void;
}

type Store = TripPlannerState & { actions: Actions };

export const useTripStore = create<Store>()(
  persist(
    immer((set, get) => ({
      ...emptyState(),
      actions: {
        addTrip: (title, area) => {
          const id = uuid();
          set((s) => {
            s.trips[id] = {
              id,
              title,
              area,
              theme: [],
              plannedNights: null,
              startDateTime: null,
              currency: "JPY",
              createdAt: now(),
              updatedAt: now(),
            };
          });
          return id;
        },
        updateTrip: (id, patch) =>
          set((s) => {
            const trip = s.trips[id];
            if (!trip) return;
            Object.assign(trip, patch, { updatedAt: now() });
          }),
        deleteTrip: (id) =>
          set((s) => {
            delete s.trips[id];
            for (const stopId of Object.keys(s.stops)) {
              if (s.stops[stopId].tripId === id) delete s.stops[stopId];
            }
            for (const legId of Object.keys(s.legs)) {
              if (s.legs[legId].tripId === id) delete s.legs[legId];
            }
            for (const entryId of Object.keys(s.budgetEntries)) {
              if (s.budgetEntries[entryId].tripId === id)
                delete s.budgetEntries[entryId];
            }
          }),

        addStop: (tripId, input, insertAfterStopId) => {
          const id = uuid();
          set((s) => {
            const sorted = tripStopsSorted(s, tripId);
            let insertIndex = sorted.length;
            if (insertAfterStopId) {
              const idx = sorted.findIndex((st) => st.id === insertAfterStopId);
              if (idx !== -1) insertIndex = idx + 1;
            }
            const newStop: Stop = {
              id,
              tripId,
              order: insertIndex,
              name: input.name,
              placeId: input.placeId ?? null,
              lat: input.lat ?? null,
              lng: input.lng ?? null,
              category: input.category ?? "activity",
              stayDurationMinutes: input.stayDurationMinutes ?? 60,
              arrivalTime: input.arrivalTime ?? null,
              note: input.note ?? "",
              bookingUrl: null,
              bookingProvider: null,
              bookingPrice: null,
              budgetEntryId: null,
              createdAt: now(),
            };
            s.stops[id] = newStop;
            // orderの数値だけで並び替えるとinsertIndexが既存Stopと衝突し、
            // Object.valuesの列挙順(挿入順)でタイブレークされて意図した位置に入らないことがある。
            // ここでは明示的に並びを組み立ててからorderを振り直す。
            sorted.splice(insertIndex, 0, newStop);
            sorted.forEach((st, i) => {
              s.stops[st.id].order = i;
            });
            syncLegsToAdjacency(s, tripId);
          });
          return id;
        },
        updateStop: (id, patch) =>
          set((s) => {
            const stop = s.stops[id];
            if (!stop) return;
            Object.assign(stop, patch);
          }),
        deleteStop: (id) =>
          set((s) => {
            const stop = s.stops[id];
            if (!stop) return;
            const tripId = stop.tripId;
            for (const entry of Object.values(s.budgetEntries)) {
              if (entry.stopId === id) unlinkBudgetEntryFromDraft(entry);
            }
            delete s.stops[id];
            reindexStops(s, tripId);
            syncLegsToAdjacency(s, tripId);
          }),
        moveStop: (id, direction) =>
          set((s) => {
            const stop = s.stops[id];
            if (!stop) return;
            const tripId = stop.tripId;
            const sorted = tripStopsSorted(s, tripId);
            const idx = sorted.findIndex((st) => st.id === id);
            const swapIdx = direction === "up" ? idx - 1 : idx + 1;
            if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
            const tmp = sorted[idx].order;
            sorted[idx].order = sorted[swapIdx].order;
            sorted[swapIdx].order = tmp;
            syncLegsToAdjacency(s, tripId);
          }),

        recalculateLeg: async (legId) => {
          const state = get();
          const leg = state.legs[legId];
          if (!leg) return;
          const fromStop = state.stops[leg.fromStopId];
          const toStop = state.stops[leg.toStopId];
          const apiKey = state.settings.googleMapsApiKey;
          if (!fromStop || !toStop || !apiKey) return;

          await loadGoogleMapsScript(apiKey);

          const toWaypoint = (stop: Stop) =>
            stop.placeId != null
              ? { placeId: stop.placeId }
              : stop.lat != null && stop.lng != null
                ? { lat: stop.lat, lng: stop.lng }
                : null;

          // オートコンプリートで候補を選ばず名前だけのStopは、位置情報が無いままだと
          // ルート計算できない。ここでバックグラウンドで自動ジオコーディングを試み、
          // 成功すればStop自体にも保存して次回以降は再ジオコーディング不要にする。
          async function resolvePoint(stop: Stop) {
            const point = toWaypoint(stop);
            if (point) return point;
            const geocoded = await geocodePlaceName(stop.name);
            if (!geocoded) return null;
            set((s) => {
              const target = s.stops[stop.id];
              if (!target) return;
              target.placeId = geocoded.placeId;
              target.lat = geocoded.lat;
              target.lng = geocoded.lng;
            });
            return { lat: geocoded.lat, lng: geocoded.lng };
          }

          const [originPoint, destinationPoint] = await Promise.all([
            resolvePoint(fromStop),
            resolvePoint(toStop),
          ]);
          if (!originPoint || !destinationPoint) {
            throw new Error(
              "場所の位置情報が見つかりませんでした。名前を確認するか、オートコンプリートで場所を選び直してください。"
            );
          }

          const mode: LegMode = leg.mode;

          // 出発地点のタイムライン上の出発時刻を計算し、transitモードの発車時刻として渡す。
          // 過去の時刻はRoutes APIがエラーにするため、その場合は渡さず「現在時刻」扱いにする。
          const trip = state.trips[leg.tripId];
          const tripStops = tripStopsSorted(state, leg.tripId);
          const computedTimes = computeStopTimes(tripStops, state.legs, trip?.startDateTime ?? null);
          const fromDeparture = computedTimes.get(fromStop.id)?.departure ?? null;
          const departureTime =
            fromDeparture && fromDeparture.getTime() > Date.now()
              ? fromDeparture.toISOString()
              : undefined;

          const result = await computeRoute(
            apiKey,
            originPoint,
            destinationPoint,
            mode,
            departureTime
          );

          set((s) => {
            const l = s.legs[legId];
            if (!l) return;
            l.durationMinutes = result.durationMinutes;
            l.distanceMeters = result.distanceMeters;
            l.transitDetails = result.transitDetails;
            l.isManualOverride = false;
          });
        },
        setLegOverride: (legId, patch) =>
          set((s) => {
            const leg = s.legs[legId];
            if (!leg) return;
            Object.assign(leg, patch);
            leg.isManualOverride = true;
            if (patch.cost !== undefined) syncLegBudgetEntry(s, leg);
          }),

        addBudgetEntry: (input) => {
          const id = uuid();
          set((s) => {
            const entry: BudgetEntry = {
              id,
              tripId: input.tripId,
              category: input.category,
              label: input.label,
              plannedAmount: input.plannedAmount,
              actualAmount: input.actualAmount ?? null,
              isBooked: input.isBooked ?? false,
              stopId: input.stopId ?? null,
              legId: input.legId ?? null,
              createdAt: now(),
            };
            s.budgetEntries[id] = entry;
            if (entry.stopId && s.stops[entry.stopId]) {
              s.stops[entry.stopId].budgetEntryId = id;
            }
            if (entry.legId && s.legs[entry.legId]) {
              s.legs[entry.legId].budgetEntryId = id;
            }
          });
          return id;
        },
        updateBudgetEntry: (id, patch) =>
          set((s) => {
            const entry = s.budgetEntries[id];
            if (!entry) return;
            Object.assign(entry, patch);
          }),
        deleteBudgetEntry: (id) =>
          set((s) => {
            const entry = s.budgetEntries[id];
            if (!entry) return;
            if (entry.stopId && s.stops[entry.stopId]?.budgetEntryId === id) {
              s.stops[entry.stopId].budgetEntryId = null;
            }
            if (entry.legId && s.legs[entry.legId]?.budgetEntryId === id) {
              s.legs[entry.legId].budgetEntryId = null;
            }
            delete s.budgetEntries[id];
          }),
        linkBudgetEntryToStop: (budgetEntryId, stopId) =>
          set((s) => {
            const entry = s.budgetEntries[budgetEntryId];
            if (!entry) return;
            if (entry.stopId && s.stops[entry.stopId]?.budgetEntryId === budgetEntryId) {
              s.stops[entry.stopId].budgetEntryId = null;
            }
            if (entry.legId && s.legs[entry.legId]?.budgetEntryId === budgetEntryId) {
              s.legs[entry.legId].budgetEntryId = null;
            }
            entry.stopId = stopId;
            entry.legId = null;
            if (s.stops[stopId]) s.stops[stopId].budgetEntryId = budgetEntryId;
          }),
        linkBudgetEntryToLeg: (budgetEntryId, legId) =>
          set((s) => {
            const entry = s.budgetEntries[budgetEntryId];
            if (!entry) return;
            if (entry.stopId && s.stops[entry.stopId]?.budgetEntryId === budgetEntryId) {
              s.stops[entry.stopId].budgetEntryId = null;
            }
            if (entry.legId && s.legs[entry.legId]?.budgetEntryId === budgetEntryId) {
              s.legs[entry.legId].budgetEntryId = null;
            }
            entry.legId = legId;
            entry.stopId = null;
            if (s.legs[legId]) s.legs[legId].budgetEntryId = budgetEntryId;
          }),
        unlinkBudgetEntry: (budgetEntryId) =>
          set((s) => {
            const entry = s.budgetEntries[budgetEntryId];
            if (!entry) return;
            if (entry.stopId && s.stops[entry.stopId]?.budgetEntryId === budgetEntryId) {
              s.stops[entry.stopId].budgetEntryId = null;
            }
            if (entry.legId && s.legs[entry.legId]?.budgetEntryId === budgetEntryId) {
              s.legs[entry.legId].budgetEntryId = null;
            }
            unlinkBudgetEntryFromDraft(entry);
          }),

        updateSettings: (patch) =>
          set((s) => {
            Object.assign(s.settings, patch);
          }),
      },
    })),
    {
      name: "trip-planner-storage",
      version: 2,
      migrate: (persistedState, version) => {
        const state = persistedState as TripPlannerState | undefined;

        // v0→v1: StopCategoryを sightseeing/food/shopping/activity/lodging/other から
        // activity/lodging/other の3種類に整理。旧カテゴリはactivityへ寄せる。
        if (version < 1 && state?.stops) {
          for (const stop of Object.values(state.stops)) {
            if (stop.category !== "lodging" && stop.category !== "other") {
              stop.category = "activity";
            }
          }
        }

        // v1→v2: 工程表のLeg費用が予算タブに反映されていなかった既存データを、
        // 対応するBudgetEntryへ遡って同期する。
        if (version < 2 && state?.legs) {
          if (!state.budgetEntries) state.budgetEntries = {};
          for (const leg of Object.values(state.legs)) {
            syncLegBudgetEntry(state, leg);
          }
        }

        return state as Store;
      },
      partialize: (state) => {
        const { actions, ...rest } = state;
        return rest;
      },
    }
  )
);
