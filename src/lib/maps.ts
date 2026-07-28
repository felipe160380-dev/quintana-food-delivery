/**
 * Carregador único do SDK do Google Maps (compartilhado por LocationPicker,
 * DeliveryMap e qualquer outro consumidor). Nunca duplica o <script>.
 */
declare global {
  interface Window {
    google: any;
    __qfMapInit?: () => void;
    __qfMapReady?: Promise<void>;
  }
}

export function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps?.Map) return Promise.resolve();
  if (window.__qfMapReady) return window.__qfMapReady;
  window.__qfMapReady = new Promise<void>((resolve) => {
    window.__qfMapInit = () => resolve();
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const ch = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places&callback=__qfMapInit&channel=${ch}`;
    document.head.appendChild(s);
  });
  return window.__qfMapReady;
}
