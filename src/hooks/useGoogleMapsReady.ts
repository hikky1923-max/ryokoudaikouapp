import { useEffect, useState } from "react";
import { useTripStore } from "../store/useTripStore";
import { isGoogleMapsReady, loadGoogleMapsScript } from "../lib/googleMaps";
import { resolveGoogleMapsApiKey } from "../lib/apiKeys";

export function useGoogleMapsReady() {
  const userApiKey = useTripStore((s) => s.settings.googleMapsApiKey);
  const apiKey = resolveGoogleMapsApiKey(userApiKey);
  const [loaded, setLoaded] = useState(isGoogleMapsReady());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (!cancelled) {
          setLoaded(true);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  return { ready: Boolean(apiKey) && loaded, error };
}
