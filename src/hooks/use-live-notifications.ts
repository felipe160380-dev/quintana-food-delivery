import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Subscribes to relevant realtime events for the signed-in user and shows
 * toast + optional native browser notifications.
 * - customers: notified when their order status changes
 * - merchants: notified of new orders in their stores
 * - couriers: notified when a new order becomes 'ready' with no courier
 */
export function useLiveNotifications() {
  useEffect(() => {
    let cancelled = false;
    let channels: any[] = [];

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      const userId = u.user.id;

      if ("Notification" in window && Notification.permission === "default") {
        try { Notification.requestPermission(); } catch {}
      }

      const notify = (title: string, body?: string) => {
        toast(title, { description: body });
        if ("Notification" in window && Notification.permission === "granted") {
          try { new Notification(title, { body, icon: "/icon-192.png" }); } catch {}
        }
      };

      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const isMerchant = roles?.some((r) => r.role === "merchant");
      const isCourier = roles?.some((r) => r.role === "courier");

      // Customer: any of my orders changed
      const c1 = supabase.channel(`notif-customer-${userId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `customer_id=eq.${userId}` }, (p) => {
          const oldRow = p.old as any; const row = p.new as any;
          if (oldRow?.status !== row?.status) notify("Pedido atualizado", `Status: ${row.status}`);
        })
        .subscribe();
      channels.push(c1);

      if (isMerchant) {
        const { data: stores } = await supabase.from("stores").select("id,name").eq("owner_id", userId);
        for (const s of stores ?? []) {
          const ch = supabase.channel(`notif-store-${s.id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${s.id}` },
              () => notify(`Novo pedido em ${s.name}`, "Abra o painel do lojista para aceitar."))
            .subscribe();
          channels.push(ch);
        }
      }

      if (isCourier) {
        const ch = supabase.channel("notif-courier-ready")
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (p) => {
            const oldRow = p.old as any; const row = p.new as any;
            if (row?.status === "ready" && oldRow?.status !== "ready" && !row?.courier_id) {
              notify("Pedido pronto para retirada", "Abra o painel do entregador.");
            }
          })
          .subscribe();
        channels.push(ch);
      }
    })();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, []);
}
