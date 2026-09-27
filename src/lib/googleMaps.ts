// Google Maps のクライアント。APIキーはVercelの環境変数に置き、サーバー(/api/config)から受け取る。
// 場所検索(Places Autocomplete)はMaps JavaScript API(SDK)を動的読み込みして使う。
// 経路計算は新しい Routes API を、サーバーの中継(/api/routes)経由で呼び出す。

import type { LegMode, TransitStepDetail } from "../types";

export class GoogleMapsError extends Error {}

declare global {
  interface Window {
    google?: any;
    __tripPlannerGMapsLoadPromise?: Promise<void>;
    __tripPlannerGMapsLoadedForKey?: string;
  }
}

// window自体にPromise/キーを持たせ、開発中のHMR(モジュール再評価)を挟んでも
// スクリプトが二重に注入されないようにする(module-scopeの変数だとHMRでリセットされてしまい、
// 既にgoogle.maps.placesが読み込み済みでも再度<script>を追加してしまい、
// Places APIが壊れる原因になっていた)。
let callbackCounter = 0;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if (!apiKey) {
    return Promise.reject(
      new GoogleMapsError("Google Maps APIキーが設定されていません。")
    );
  }
  // 既に読み込み済みなら、どのキーで読み込まれたかに関わらずそのまま使う。
  if (window.google?.maps?.places) {
    window.__tripPlannerGMapsLoadedForKey = apiKey;
    return Promise.resolve();
  }
  if (window.__tripPlannerGMapsLoadPromise && window.__tripPlannerGMapsLoadedForKey === apiKey) {
    return window.__tripPlannerGMapsLoadPromise;
  }

  window.__tripPlannerGMapsLoadedForKey = apiKey;
  callbackCounter += 1;
  const callbackName = `__tripPlannerGMapsReady${callbackCounter}`;

  window.__tripPlannerGMapsLoadPromise = new Promise((resolve, reject) => {
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

  return window.__tripPlannerGMapsLoadPromise;
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

export interface GeocodedPlace {
  placeId: string | null;
  lat: number;
  lng: number;
}

// オートコンプリートで候補を選ばず名前だけが入力されているStopのための、
// バックグラウンドでの自動ジオコーディング。google.maps.Geocoderを使う
// (Places APIではなくMaps JS APIの標準機能なので追加の有効化は不要)。
// 見つからない場合はnullを返す(呼び出し側で「位置情報が見つかりませんでした」等を出す)。
export async function geocodePlaceName(name: string): Promise<GeocodedPlace | null> {
  const g = window.google;
  if (!g?.maps) {
    throw new GoogleMapsError("Google Mapsが読み込まれていません。");
  }
  const geocoder = new g.maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode(
      { address: name, region: "jp", language: "ja" },
      (results: any, status: string) => {
        if (status === "OK" && results?.[0]?.geometry?.location) {
          const result = results[0];
          resolve({
            placeId: result.place_id ?? null,
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
          });
        } else {
          resolve(null);
        }
      }
    );
  });
}

export interface RouteResult {
  durationMinutes: number;
  distanceMeters: number;
  transitDetails: TransitStepDetail[] | null;
}

const MODE_MAP: Record<LegMode, string> = {
  walk: "WALK",
  transit: "TRANSIT",
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
    case "NOT_CONFIGURED":
      return "Google Maps APIキーがサーバーに設定されていません。";
    case "FORBIDDEN_ORIGIN":
      return "許可されていないアクセス元です。";
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
  origin: { placeId: string } | { lat: number; lng: number },
  destination: { placeId: string } | { lat: number; lng: number },
  mode: LegMode,
  departureTime?: string
): Promise<RouteResult> {
  const res = await fetch("/api/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
