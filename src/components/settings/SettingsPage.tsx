import { useState } from "react";
import { useTripStore } from "../../store/useTripStore";

export function SettingsPage() {
  const settings = useTripStore((s) => s.settings);
  const updateSettings = useTripStore((s) => s.actions.updateSettings);
  const [apiKeyInput, setApiKeyInput] = useState(settings.googleMapsApiKey ?? "");
  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.geminiApiKey ?? "");

  return (
    <div>
      <div className="card">
        <div className="card-header">
          <h3>Google Maps API (場所検索・経路計算に使用)</h3>
        </div>
        <div className="field">
          <label>Google Maps APIキー</label>
          <input
            type="password"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIza..."
          />
        </div>
        <p className="muted">
          APIキーはこの端末のブラウザ内(localStorage)にのみ保存され、Google Maps
          APIへ直接送信されます。未設定でも手動入力でアプリ自体は問題なく利用できます。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => updateSettings({ googleMapsApiKey: apiKeyInput || null })}
        >
          保存
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Gemini API (乗換案内のスクリーンショット読み取りに使用)</h3>
        </div>
        <div className="field">
          <label>Gemini APIキー</label>
          <input
            type="password"
            value={geminiKeyInput}
            onChange={(e) => setGeminiKeyInput(e.target.value)}
            placeholder="AIza..."
          />
        </div>
        <p className="muted">
          APIキーはこの端末のブラウザ内(localStorage)にのみ保存され、Gemini
          APIへ直接送信されます。未設定でもテキストの貼り付けはそのまま利用できます。
        </p>
        <button
          className="btn btn-primary"
          onClick={() => updateSettings({ geminiApiKey: geminiKeyInput || null })}
        >
          保存
        </button>
      </div>
    </div>
  );
}
