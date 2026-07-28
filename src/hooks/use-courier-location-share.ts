import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/geo";

/**
 * Entregador: transmite a própria posição para os pedidos em rota.
 * Regra de economia: só envia quando andou >= 20 m OU passaram >= 10 s.
 * Para automaticamente quando não há mais pedidos ativos (entregue/cancelado).
 */
export function useCourierLocationShare(courierId: string | null, orderIds: string[]) {
  const key = orderIds.slice().sort().join(",");
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!courierId || ids.length === 0) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    last.current = null;
    let cancelled = false;

    const push = async (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const now = Date.now();
      const prev = last.current;
      if (prev) {
        const moved = distanceMeters({ lat: prev.lat, lng: prev.lng }, { lat, lng });
        if (moved < 20 && now - prev.t < 10000) return;
      }
      last.current = { lat, lng, t: now };
      if (cancelled) return;
      await supabase.from("order_courier_locations").upsert(
        ids.map((order_id) => ({
          order_id,
          courier_id: courierId,
          latitude: lat,
          longitude: lng,
          accuracy: pos.coords.accuracy ?? null,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "order_id" },
      );
    };

    const watchId = navigator.geolocation.watchPosition(push, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    });

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [courierId, key]);
}
