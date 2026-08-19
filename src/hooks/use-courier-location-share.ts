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

/**
 * Entregador disponível (mesmo sem entrega ativa): mantém `couriers.current_lat/lng`
 * e `last_seen_at` atualizados para o sistema calcular a distância até a loja.
 * Mesmo watcher/regra de economia do compartilhamento de entrega.
 */
export function useCourierPresence(courierId: string | null, active: boolean) {
  const last = useRef<{ lat: number; lng: number; t: number } | null>(null);

  useEffect(() => {
    if (!courierId || !active) return;
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
        if (moved < 30 && now - prev.t < 60000) return;
      }
      last.current = { lat, lng, t: now };
      if (cancelled) return;
      await supabase
        .from("couriers")
        .update({
          current_lat: lat,
          current_lng: lng,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", courierId);
    };

    const watchId = navigator.geolocation.watchPosition(push, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 20000,
    });

    // Heartbeat: renova last_seen_at mesmo parado (localização "recente").
    const beat = setInterval(() => {
      if (!last.current) return;
      supabase
        .from("couriers")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", courierId)
        .then(() => {});
    }, 120000);

    return () => {
      cancelled = true;
      clearInterval(beat);
      navigator.geolocation.clearWatch(watchId);
    };
  }, [courierId, active]);
}
