/**
 * Espelho (somente exibição) de public.store_is_open_now no banco.
 * A decisão final é sempre do servidor (create_order).
 */
type Day = { open?: string; close?: string; closed?: boolean };
const KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function nowInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = KEYS.indexOf(get("weekday").toLowerCase().slice(0, 3));
  const hh = get("hour") === "24" ? "00" : get("hour");
  return { dow, t: `${hh}:${get("minute")}` };
}

export function isStoreOpenNow(hours: unknown): boolean {
  if (!hours || typeof hours !== "object" || Object.keys(hours).length === 0) return true;
  const h = hours as Record<string, Day>;
  const { dow, t } = nowInSaoPaulo();
  const today = h[KEYS[dow]];
  const prev = h[KEYS[(dow + 6) % 7]];
  if (today && !today.closed && today.open && today.close) {
    if (today.close > today.open && t >= today.open && t < today.close) return true;
    if (today.close <= today.open && t >= today.open) return true;
  }
  if (prev && !prev.closed && prev.open && prev.close && prev.close <= prev.open && t < prev.close) return true;
  return false;
}
