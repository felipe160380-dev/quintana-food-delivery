import { useEffect, useRef, useState } from "react";
import { loadMaps } from "@/lib/maps";
import { distanceMeters, estimateEtaMinutes, formatDistance, formatEta, type LatLng } from "@/lib/geo";
import { Bike, MapPin, Clock, Route } from "lucide-react";

type Props = {
  courier?: LatLng | null;
  destination?: LatLng | null;
  store?: LatLng | null;
  /** Altura do mapa (classe tailwind). */
  className?: string;
  label?: string;
};

/**
 * Mapa de acompanhamento da entrega: entregador, loja e destino,
 * com rota, distância e tempo estimado. Reutilizado por cliente,
 * lojista e entregador.
 */
export function DeliveryMap({ courier, destination, store, className = "h-56", label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<Record<string, any>>({});
  const renderer = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<{ distance: string; eta: string } | null>(null);

  useEffect(() => {
    loadMaps().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !ref.current || map.current) return;
    const g = window.google;
    const center = courier ?? destination ?? store ?? { lat: -23.5505, lng: -46.6333 };
    map.current = new g.maps.Map(ref.current, {
      center,
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "greedy",
    });
    renderer.current = new g.maps.DirectionsRenderer({
      map: map.current,
      suppressMarkers: true,
      preserveViewport: true,
      polylineOptions: { strokeColor: "#ea1d2c", strokeWeight: 5, strokeOpacity: 0.85 },
    });
  }, [ready, courier, destination, store]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const g = window.google;

    const upsert = (key: string, pos: LatLng | null | undefined, opts: any) => {
      if (!pos) {
        markers.current[key]?.setMap(null);
        delete markers.current[key];
        return;
      }
      if (markers.current[key]) markers.current[key].setPosition(pos);
      else markers.current[key] = new g.maps.Marker({ map: map.current, position: pos, ...opts });
    };

    const dot = (color: string) => ({
      path: g.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
    });

    upsert("store", store, { icon: dot("#f59e0b"), title: "Loja", zIndex: 1 });
    upsert("dest", destination, { icon: dot("#16a34a"), title: "Entrega", zIndex: 2 });
    upsert("courier", courier, { icon: dot("#ea1d2c"), title: "Entregador", zIndex: 3 });

    const pts = [store, destination, courier].filter(Boolean) as LatLng[];
    if (pts.length > 1) {
      const bounds = new g.maps.LatLngBounds();
      pts.forEach((p) => bounds.extend(p));
      map.current.fitBounds(bounds, 48);
    } else if (pts.length === 1) {
      map.current.setCenter(pts[0]);
    }

    // Rota + distância/ETA
    const from = courier ?? store;
    if (from && destination) {
      const straight = distanceMeters(from, destination);
      setInfo({ distance: formatDistance(straight), eta: formatEta(estimateEtaMinutes(straight)) });
      const svc = new g.maps.DirectionsService();
      svc.route(
        { origin: from, destination, travelMode: g.maps.TravelMode.DRIVING },
        (res: any, status: string) => {
          if (status !== "OK" || !res?.routes?.[0]) return;
          renderer.current?.setDirections(res);
          const leg = res.routes[0].legs[0];
          setInfo({
            distance: leg.distance?.text ?? formatDistance(straight),
            eta: leg.duration?.text ?? formatEta(estimateEtaMinutes(straight)),
          });
        },
      );
    } else {
      setInfo(null);
    }
  }, [ready, courier?.lat, courier?.lng, destination?.lat, destination?.lng, store?.lat, store?.lng]);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div ref={ref} className={`w-full ${className}`} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-3 py-2 text-xs">
        {label && <span className="font-medium">{label}</span>}
        {info ? (
          <>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Route className="size-3.5" /> {info.distance}
            </span>
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Clock className="size-3.5" /> {info.eta}
            </span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <MapPin className="size-3.5" /> Aguardando posição do entregador
          </span>
        )}
        {courier && (
          <span className="ml-auto inline-flex items-center gap-1 text-primary">
            <Bike className="size-3.5" /> ao vivo
          </span>
        )}
      </div>
    </div>
  );
}
