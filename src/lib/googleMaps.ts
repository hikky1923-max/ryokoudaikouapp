// Google Maps をブラウザから直接利用するクライアント。
// APIキーはユーザーが設定画面で入力し、localStorageに保存されたものを利用する(バックエンド不要)。
// 場所検索(Places Autocomplete)はMaps JavaScript API(SDK)を動的読み込みして使う。
// 経路計算は新しい Routes API を素のfetch()で直接呼び出す(CORS対応済みのREST API)。
// 旧来のDirections REST APIとは異なりCORS制限を受けず、SDKの読み込みも不要。

import type { LegMode, TransitStepDetail } from "../types";

export class GoogleMapsError extends Error {}

declare global {
  interface Window {
    google?: any;
  }
}

let loadPromise: Promise<void> | null = null;
let loadedForKey: string | null = null;
let callbackCounter = 0;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (!apiKey) {
    return Promise.reject(
      new GoogleMapsError("Google Maps APIキーが設定されていません。")
    );
  }
  if (loadedForKey === apiKey && window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (loadPromise && loadedForKey === apiKey) return loadPromise;

  loadedForKey = apiKey;
  callbackCounter += 1;
  const callbackName = `__tripPlannerGMapsReady${callbackCounter}`;

  loadPromise = new Promise((resolve, reject) => {
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&loading=async&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      reject(new GoogleMapsError("Google Mapsスクリプトの読み込みに失敗しました。"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export function isGoogleMapsReady(): boolean {
  return Boolean(window.google?.maps?.places);
}

export interface PlaceSelection {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
}

// 既存の<input>にオートコンプリートを付与する。クリーンアップ関数を返す。
export function attachPlaceAutocomplete(
  input: HTMLInputElement,
  onSelect: (place: PlaceSelection) => void
): () => void {
  const g = window.google;
  if (!g?.maps?.places) {
    throw new GoogleMapsError("Google Maps Places APIが読み込まれていません。");
  }
  const autocomplete = new g.maps.places.Autocomplete(input, {
    fields: ["place_id", "name", "geometry"],
  });
  const listener = autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place.place_id || !place.geometry?.location) return;
    onSelect({
      name: place.name ?? input.value,
      placeId: place.place_id,
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
    });
  });
  return () => {
    g.maps.event.removeListener(listener);
  };
}

export interface RouteResult {
  durationMinutes: number;
  distanceMeters: number;
  transitDetails: TransitStepDetail[] | null;
}

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const ROUTES_API_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.transitDetails",
].join(",");

const MODE_MAP: Record<LegMode, string> = {
  walk: "WALK",
  transit: "TRANSIT",
  drive: "DRIVE",
  bicycle: "BICYCLE",
};

function toRoutesApiWaypoint(p: { placeId: string } | { lat: number; lng: number }) {
  return "placeId" in p
    ? { placeId: p.placeId }
    : { location: { latLng: { latitude: p.lat, longitude: p.lng } } };
}

// Routes APIのエラーレスポンス(google.rpc.Status形式)をユーザー向けの日本語メッセージに変換する。
function describeRoutesApiError(httpStatus: number, body: any): string {
  const code: string | undefined = body?.error?.status;
  switch (code) {
    case "PERMISSION_DENIED":
      return "このAPIキーではこの機能を利用できません。Google Cloud ConsoleでRoutes APIが有効になっているか、キーの制限設定を確認してください。";
    case "RESOURCE_EXHAUSTED":
      return "Google Maps APIの利用上限に達しました。しばらく待ってから再度お試しください。";
    case "INVALID_ARGUMENT":
      return "リクエストが不正です。場所の情報を選び直してみてください。";
    case "NOT_FOUND":
      return "出発地または到着地の場所が見つかりませんでした。名前欄で候補を選び直してください。";
    default:
      return `経路の計算に失敗しました (${httpStatus}${code ? `: ${code}` : ""})`;
  }
}

export async function computeRoute(
  apiKey: string,
  origin: { placeId: string } | { lat: number; lng: number },
  destination: { placeId: string } | { lat: number; lng: number },
  mode: LegMode,
  departureTime?: string
): Promise<RouteResult> {
  if (!apiKey) {
    throw new GoogleMapsError("Google Maps APIキーが設定されていません。");
  }

  const res = await fetch(ROUTES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": ROUTES_API_FIELD_MASK,
    },
    body: JSON.stringify({
      origin: toRoutesApiWaypoint(origin),
      destination: toRoutesApiWaypoint(destination),
      travelMode: MODE_MAP[mode],
      languageCode: "ja",
      units: "METRIC",
      // departureTimeは未来の時刻のみ有効(過去を渡すとINVALID_ARGUMENTになる)。
      // transitモードでのみ意味を持つ(発車時刻によって使える路線が変わるため)。
      ...(mode === "transit" && departureTime ? { departureTime } : {}),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new GoogleMapsError(describeRoutesApiError(res.status, data));
  }

  const route = data?.routes?.[0];
  if (!route) {
    throw new GoogleMapsError(
      "この移動手段ではルートが見つかりませんでした(長距離・複数事業者にまたがる乗換など、データでカバーされていない場合があります)。移動手段を変更するか、手動で入力してください。"
    );
  }

  const durationSeconds = typeof route.duration === "string" ? parseInt(route.duration, 10) : 0;
  const steps = route.legs?.[0]?.steps ?? [];

  const transitDetails: TransitStepDetail[] | null =
    mode === "transit"
      ? steps
          .filter((s: any) => s.travelMode === "TRANSIT")
          .map(
            (s: any): TransitStepDetail => ({
              lineName: s.transitDetails?.transitLine?.nameShort ?? s.transitDetails?.transitLine?.name,
              vehicleType: s.transitDetails?.transitLine?.vehicle?.type,
              departureStop: s.transitDetails?.stopDetails?.departureStop?.name,
              arrivalStop: s.transitDetails?.stopDetails?.arrivalStop?.name,
              numStops: s.transitDetails?.stopCount,
            })
          )
      : null;

  return {
    durationMinutes: Math.round((durationSeconds || 0) / 60),
    distanceMeters: route.distanceMeters ?? 0,
    transitDetails: transitDetails && transitDetails.length > 0 ? transitDetails : null,
  };
}
