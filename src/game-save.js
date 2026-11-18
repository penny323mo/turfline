import { newGame } from "./race.js";

// Updating the wallet and its race in one read/write transaction serializes tabs and settlement.
export async function openGameSave() {
  let db;
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("turfline-arcade", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("save");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await run(() => {});
  } catch {
    db?.close();
    let local = newGame();
    return {
      temporary: true,
      channel: null,
      read: async () => structuredClone(local),
      update: async (fn) => {
        const g = structuredClone(local);
        fn(g);
        local = g;
        return structuredClone(g);
      },
    };
  }
  function run(fn) {
    return new Promise((resolve, reject) => {
      const mode = fn ? "readwrite" : "readonly";
      const tx = db.transaction("save", mode),
        store = tx.objectStore("save"),
        request = store.get("player");
      let result, error;
      request.onsuccess = () => {
        try {
          result = request.result ?? newGame();
          if (fn) {
            fn(result);
            store.put(result, "player");
          }
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(error ?? tx.error);
      tx.onabort = () => reject(error ?? tx.error);
    });
  }
  const channel =
    typeof BroadcastChannel === "function"
      ? new BroadcastChannel("turfline-game-v1")
      : null;
  db.onversionchange = () => db.close();
  return {
    temporary: false,
    channel,
    read: () => run(),
    update: async (fn) => {
      const r = await run(fn);
      channel?.postMessage("saved");
      return r;
    },
  };
}
