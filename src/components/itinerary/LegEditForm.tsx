import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { hasAnyParsedData, parseTransitShareText } from "../../lib/routeTextParser";
import type { Leg, LegMode, TransitStepDetail } from "../../types";

const MODE_LABEL: Record<LegMode, string> = {
  walk: "徒歩",
  transit: "電車・バス(乗換案内)",
};

export function LegEditForm({ leg, onClose }: { leg: Leg; onClose: () => void }) {
  const setLegOverride = useTripStore((s) => s.actions.setLegOverride);

  const [mode, setMode] = useState<LegMode>(leg.mode);
  const [duration, setDuration] = useState(leg.durationMinutes?.toString() ?? "");
  const [distanceKm, setDistanceKm] = useState(
    leg.distanceMeters != null ? (leg.distanceMeters / 1000).toString() : ""
  );
  const [cost, setCost] = useState(leg.cost?.toString() ?? "");
  const [transitDetails, setTransitDetails] = useState<TransitStepDetail[] | null>(
    leg.transitDetails
  );

  const [pasteText, setPasteText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [parsedSummary, setParsedSummary] = useState<string | null>(null);
  const [parsedWarning, setParsedWarning] = useState<string | null>(null);

  function handleParse() {
    const info = parseTransitShareText(pasteText);
    if (!hasAnyParsedData(info) || info.segments.length === 0) {
      setParsedSummary(null);
      setParsedWarning(
        "経路情報を読み取れませんでした。Yahoo!乗換案内の「検索結果を共有」テキストを貼り付けてください。"
      );
      return;
    }

    setMode("transit");
    if (info.durationMinutes != null) setDuration(String(info.durationMinutes));
    if (info.distanceMeters != null) setDistanceKm((info.distanceMeters / 1000).toString());
    if (info.fareYen != null) setCost(String(info.fareYen));
    setTransitDetails(
      info.segments.map((segment) => ({
        lineName: segment.lineName ?? undefined,
        headsign: segment.headsign ?? undefined,
        departureStop: segment.fromName,
        arrivalStop: segment.toName,
        departurePlatform: segment.departurePlatform ?? undefined,
        arrivalPlatform: segment.arrivalPlatform ?? undefined,
      }))
    );

    const summaryParts = [
      info.segments
        .map((s) => `${s.fromName}→${s.toName}${s.lineName ? `(${s.lineName})` : ""}`)
        .join(" ・ "),
      info.durationMinutes != null ? `${info.durationMinutes}分` : null,
      info.fareYen != null ? `${info.fareYen}円` : null,
      info.distanceMeters != null ? `${(info.distanceMeters / 1000).toFixed(1)}km` : null,
    ].filter(Boolean);
    setParsedSummary(summaryParts.join(" ・ "));
    setParsedWarning(null);
  }

  function handleSave() {
    setLegOverride(leg.id, {
      mode,
      durationMinutes: duration === "" ? null : Number(duration),
      distanceMeters: distanceKm === "" ? null : Math.round(Number(distanceKm) * 1000),
      cost: cost === "" ? null : Number(cost),
      transitDetails: mode === "transit" ? transitDetails : null,
    });
    onClose();
  }

  return (
    <div className="card leg-edit-form">
      <div className="field">
        <label>移動手段</label>
        <select value={mode} onChange={(e) => setMode(e.target.value as LegMode)}>
          {Object.entries(MODE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1 }}>
          <label>所要時間(分)</label>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>距離(km)</label>
          <input
            type="number"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
          />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>費用(円)</label>
          <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>

      <button className="btn btn-sm" onClick={() => setPasteOpen((v) => !v)}>
        {pasteOpen ? "貼り付け欄を閉じる" : "📋 Yahoo!乗換案内の結果を貼り付けて自動入力"}
      </button>

      {pasteOpen && (
        <div style={{ marginTop: 8 }}>
          <div className="field">
            <label>共有テキストを貼り付け</label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder={"大阪 ⇒ 森ノ宮\n2026年9月26日(土)\n10:18 ⇒ 10:30\n所要時間 12分\n運賃[IC優先] 180円\n..."}
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleParse}>
            解析して反映
          </button>
          {parsedSummary && <p className="muted">読み取り結果: {parsedSummary}</p>}
          {parsedWarning && <p className="muted">⚠ {parsedWarning}</p>}
        </div>
      )}

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn btn-primary btn-sm" onClick={handleSave}>
          保存
        </button>
        <button className="btn btn-sm" onClick={onClose}>
          キャンセル
        </button>
      </div>
    </div>
  );
}
