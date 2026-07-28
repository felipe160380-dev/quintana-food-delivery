import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CourierPoint = {
  latitude: number;
  longitude: number;
  heading: number | null;
  updated_at: string;
};

export type OrderEvent = { id: string; kind: string; created_at: string };

/** Cliente/lojista: acompanha em tempo real a posição do entregador do pedido. */
export function useCourierPosition(orderId: string | null, enabled: boolean) {
  const [point, setPoint] = useState<CourierPoint | null>(null);

  useEffect(() => {
    if (!orderId || !enabled) {
      setPoint(null);
      return;
    }
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("order_courier_locations")
        .select("latitude,longitude,heading,updated_at")
        .eq("order_id", orderId)
        .maybeSingle();
      if (active) setPoint((data as CourierPoint) ?? null);
    };
    load();
    const ch = supabase
      .channel(`track-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_courier_locations", filter: `order_id=eq.${orderId}` },
        (p) => {
          if (!active) return;
          if (p.eventType === "DELETE") setPoint(null);
          else setPoint(p.new as unknown as CourierPoint);
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [orderId, enabled]);

  return point;
}

/** Histórico de etapas do pedido (usado para carimbar horários na timeline). */
export function useOrderEvents(orderId: string | null) {
  const [events, setEvents] = useState<OrderEvent[]>([]);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("order_events")
        .select("id,kind,created_at")
        .eq("order_id", orderId)
        .order("created_at");
      if (active) setEvents((data as OrderEvent[]) ?? []);
    };
    load();
    const ch = supabase
      .channel(`events-${orderId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_events", filter: `order_id=eq.${orderId}` },
        load,
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  return events;
}
