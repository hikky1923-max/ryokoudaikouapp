import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";
import { hasAnyParsedData, parseTransitShareText } from "../../lib/routeTextParser";
import type { ID } from "../../types";

// 「大阪」「大阪駅」のような表記ゆれを緩く同一視するための比較。
function namesMatch(a: string, b: string): boolean {
  const na = a.trim();
  const nb = b.trim();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function ImportRouteForm({ tripId, onDone }: { tripId: ID; onDone?: () => void }) {
  const [pasteText, setPasteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  function handleImport() {
    const info = parseTransitShareText(pasteText);
    if (!hasAnyParsedData(info) || !info.fromName || !info.toName) {
      setSummary(null);
      setError(
        "経路情報を読み取れませんでした。出発地・到着地を含むYahoo!乗換案内の共有テキストを貼り付けてください。"
      );
      return;
    }
    const fromName = info.fromName;
    const toName = info.toName;

    const { stops, actions } = useTripStore.getState();
    const tripStops = Object.values(stops)
      .filter((s) => s.tripId === tripId)
      .sort((a, b) => a.order - b.order);
    const lastStop = tripStops[tripStops.length - 1];

    let originId: ID;
    let originIsNew = false;
    if (lastStop && namesMatch(lastStop.name, fromName)) {
      originId = lastStop.id;
    } else {
      originId = actions.addStop(tripId, {
        name: fromName,
        category: "sightseeing",
        stayDurationMinutes: 0,
      });
      originIsNew = true;
    }

    const destinationId = actions.addStop(tripId, {
      name: toName,
      category: "sightseeing",
      stayDurationMinutes: 60,
    });

    if (originIsNew && info.date && info.departureTime) {
      actions.updateStop(originId, { arrivalTime: `${info.date}T${info.departureTime}` });
    }

    const legs = Object.values(useTripStore.getState().legs);
    const leg = legs.find((l) => l.fromStopId === originId && l.toStopId === destinationId);
    if (leg) {
      actions.setLegOverride(leg.id, {
        mode: "transit",
        durationMinutes: info.durationMinutes,
        distanceMeters: info.distanceMeters,
        cost: info.fareYen,
        transitDetails:
          info.lineNames.length > 0
            ? info.lineNames.map((lineName) => ({
                lineName,
                departureStop: fromName,
                arrivalStop: toName,
              }))
            : null,
      });
    }

    const parts = [
      `${fromName} → ${toName}`,
      info.durationMinutes != null ? `${info.durationMinutes}分` : null,
      info.fareYen != null ? `${info.fareYen}円` : null,
    ].filter((v): v is string => v != null);
    setSummary(`追加しました: ${parts.join(" ・ ")}`);
    setError(null);
    setPasteText("");
    onDone?.();
  }

  return (
    <div className="card">
      <div className="field">
        <label>Yahoo!乗換案内の共有テキストを貼り付け</label>
        <textarea
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          rows={5}
          placeholder={
            "大阪 ⇒ 森ノ宮\n2026年9月26日(土)\n10:18 ⇒ 10:30\n所要時間 12分\n運賃[IC優先] 180円\n..."
          }
        />
      </div>
      <p className="muted">
        出発地・到着地をStopとして自動追加し、その間のLegに所要時間・運賃・路線名を反映します。
        直前のStopと出発地が同じ場合は新規Stopを作らず続きとしてつなげます。
      </p>
      <div className="row">
        <button className="btn btn-primary btn-sm" onClick={handleImport}>
          解析して場所・区間を追加
        </button>
      </div>
      {summary && <p className="muted">✓ {summary}</p>}
      {error && <p className="muted">⚠ {error}</p>}
    </div>
  );
}
