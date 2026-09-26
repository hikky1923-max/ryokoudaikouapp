// 経路計算: OpenRouteService(ORS)による実計算と、Haversine公式による直線距離概算。
// ORSはAPIキー登録が無料・クレジットカード不要だが、静的サイトからのブラウザ直接呼び出しで
// CORSエラーが起きるという報告が複数あり、確実に動く保証はない。そのため呼び出し側
// (store の recalculateLeg)では必ずORS失敗時にHaversine概算へフォールバックする設計とする。

import type { LegMode } from "../types";

export class RoutingError extends Error {}

export interface RouteEstimate {
  durationMinutes: number;
  distanceMeters: number;
}

export type RoutableMode = Exclude<LegMode, "transit">;

// 経験則による係数。実測データではない。
const CIRCUITY_FACTOR: Record<RoutableMode, number> = {
  walk: 1.4, // 徒歩は道なりに曲がるため直線距離よりかなり長くなる
  bicycle: 1.3,
  drive: 1.3,
};
const AVERAGE_SPEED_KMH: Record<RoutableMode, number> = {
  walk: 4.8,
  bicycle: 15,
  drive: 25, // 市街地・信号込みの想定。高速道路は考慮しない
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeHaversineEstimate(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: RoutableMode
): RouteEstimate {
  const distanceMeters = haversineMeters(from, to) * CIRCUITY_FACTOR[mode];
  const durationMinutes = Math.round((distanceMeters / 1000 / AVERAGE_SPEED_KMH[mode]) * 60);
  return { durationMinutes, distanceMeters };
}

const ORS_PROFILE: Record<RoutableMode, string> = {
  walk: "foot-walking",
  bicycle: "cycling-regular",
  drive: "driving-car",
};

export async function computeOrsRoute(
  apiKey: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: RoutableMode
): Promise<RouteEstimate> {
  let res: Response;
  try {
    res = await fetch(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      // ORS/GeoJSONの座標順は[経度,緯度]で、アプリ内のlat/lngとは逆順になる点に注意。
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
    });
  } catch {
    // CORSブロックはfetchではネットワークエラー(TypeError)として現れる。
    throw new RoutingError("OpenRouteServiceへの接続に失敗しました。");
  }
  if (!res.ok) {
    throw new RoutingError(`OpenRouteServiceがエラーを返しました (${res.status})`);
  }

  try {
    const data = await res.json();
    const summary = data.routes?.[0]?.summary;
    if (!summary || typeof summary.duration !== "number" || typeof summary.distance !== "number") {
      throw new Error("unexpected shape");
    }
    return {
      durationMinutes: Math.round(summary.duration / 60),
      distanceMeters: summary.distance,
    };
  } catch {
    throw new RoutingError("OpenRouteServiceの応答を解析できませんでした。");
  }
}
