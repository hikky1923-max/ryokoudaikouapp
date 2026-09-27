import { useEffect, useState } from "react";
import { isGoogleMapsReady, loadGoogleMapsScript } from "../lib/googleMaps";
import { useServerConfig } from "../lib/serverConfig";

export function useGoogleMapsReady() {
  const apiKey = useServerConfig((s) => s.googleMapsApiKey);
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
