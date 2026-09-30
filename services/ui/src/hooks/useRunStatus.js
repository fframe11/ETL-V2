import { useEffect, useState } from "react";

const FINAL_STATES = new Set(["SUCCEEDED", "FAILED", "SKIPPED", "TRIGGER_FAILED"]);

// Polls GET /api/v1/pipeline/runs/{ingestId} until the run reaches a final state.
export function useRunStatus(ingestId, intervalMs = 5000) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ingestId) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/pipeline/runs/${encodeURIComponent(ingestId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        if (cancelled) return;
        setState(body.state);
        setError(false);
        if (!FINAL_STATES.has(body.state)) timer = setTimeout(poll, intervalMs);
      } catch {
        if (cancelled) return;
        setError(true);
        timer = setTimeout(poll, intervalMs);
      }
    };
    setState(null);
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ingestId, intervalMs]);

  return { state, error };
}
