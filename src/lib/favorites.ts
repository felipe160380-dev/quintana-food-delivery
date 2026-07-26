const KEY = "qf_favorites";
const EVT = "qf-favorites-changed";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function getFavorites() {
  return read();
}

export function isFavorite(storeId: string) {
  return read().includes(storeId);
}

export function toggleFavorite(storeId: string) {
  const list = read();
  const next = list.includes(storeId) ? list.filter((i) => i !== storeId) : [...list, storeId];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVT));
  return next.includes(storeId);
}

export const FAVORITES_EVENT = EVT;
