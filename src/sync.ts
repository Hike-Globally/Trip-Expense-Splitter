import type { DB } from "./types";
import { KEY, adoptSession } from "./store";

let bc: BroadcastChannel | null = null;
try {
  bc = new BroadcastChannel("splitide-sync");
} catch {
  bc = null;
}

export function broadcast(db: DB) {
  try {
    bc?.postMessage({ type: "db", db });
  } catch {}
  try {
    localStorage.setItem("splitide-sync-ping", String(Date.now()));
  } catch {}
}

export function subscribe(cb: (db: DB) => void): () => void {
  // Another tab's data must never change who *this* tab is signed in as.
  const deliver = (next: DB) => cb(adoptSession(next));

  const onMsg = (e: MessageEvent) => {
    if (e.data && e.data.type === "db" && e.data.db) {
      deliver(e.data.db as DB);
    }
  };
  bc?.addEventListener("message", onMsg);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === "splitide-sync-ping") {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) deliver(JSON.parse(raw) as DB);
      } catch {}
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    bc?.removeEventListener("message", onMsg);
    window.removeEventListener("storage", onStorage);
  };
}
