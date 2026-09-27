export type ID = string;

export interface Trip {
  id: ID;
  title: string;
  area: string;
  theme: string[];
  plannedNights: number | null; // 「何泊何日」の目安。構造上の制約ではなく参考表示用
  startDateTime: string | null; // 出発日時(ISO)。設定すると最初のStopの暗黙のピン留めとして使われる
  currency: string; // default "JPY"
  createdAt: string;
  updatedAt: string;
}

export type StopCategory =
  | "activity" // 観光施設・食事・買い物など、訪れて過ごす場所全般
  | "lodging" // このカテゴリの直後でタイムライン表示上「Day」が区切られる
  | "other";

export interface Stop {
  id: ID;
  tripId: ID;
  order: number; // 旅行全体を通した通し順序（0始まり）。構造変更のたびに再採番
  name: string;
  placeId: string | null; // Google Place ID。APIキー未設定/手動入力時はnull
  lat: number | null;
  lng: number | null;
  category: StopCategory;
  stayDurationMinutes: number; // 希望滞在時間
  arrivalTime: string | null; // ISO日時。ユーザーが明示的に固定した時刻（ピン留め）。nullなら前後から自動計算
  note: string;
  bookingUrl: string | null;
  bookingProvider: string | null;
  bookingPrice: number | null;
  budgetEntryId: ID | null; // 参照用の逆リンク（正の情報源はBudgetEntry.stopId）
  createdAt: string;
}

// 徒歩(自動ルート計算の対象) か、乗換案内(電車・バスなど、貼り付け/手動で記録する対象) かの記録。
export type LegMode = "walk" | "transit";

export interface TransitStepDetail {
  lineName?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  numStops?: number;
  headsign?: string; // 方面・行き先(例: "京橋・鶴橋方面", "高槻行")
  departurePlatform?: string; // 発○番線
  arrivalPlatform?: string; // 着○番線
}

export interface Leg {
  id: ID;
  tripId: ID;
  fromStopId: ID;
  toStopId: ID;
  mode: LegMode;
  durationMinutes: number | null; // null = 未計算（APIキーなし、または未計算ボタン未押下）
  distanceMeters: number | null;
  isManualOverride: boolean; // ユーザーが手動編集/入力した場合true
  transitDetails: TransitStepDetail[] | null; // transitモード時、API成功時のみ緩く格納
  cost: number | null;
  bookingUrl: string | null;
  bookingProvider: string | null;
  budgetEntryId: ID | null;
  createdAt: string;
}

export type BudgetCategory =
  | "lodging"
  | "transport"
  | "food"
  | "activity"
  | "shopping"
  | "other";

export interface BudgetEntry {
  id: ID;
  tripId: ID;
  category: BudgetCategory;
  label: string;
  plannedAmount: number;
  actualAmount: number | null;
  isBooked: boolean;
  stopId: ID | null; // 不変条件: stopId/legIdのうち高々一方のみnon-null
  legId: ID | null;
  createdAt: string;
}

export interface BudgetSummary {
  plannedTotal: number;
  actualTotal: number;
  byCategory: Record<BudgetCategory, { planned: number; actual: number }>;
}
