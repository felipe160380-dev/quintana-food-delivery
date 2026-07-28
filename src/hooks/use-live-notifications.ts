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

      const statusMsg: Record<string, string> = {
        accepted: "A loja confirmou seu pedido 🎉",
        preparing: "Seu pedido está sendo preparado 👨‍🍳",
        ready: "Pedido pronto, aguardando entregador 📦",
        out_for_delivery: "Saiu para entrega — acompanhe no mapa 🛵",
        delivered: "Pedido entregue. Bom apetite! ✅",
        cancelled: "Seu pedido foi cancelado ❌",
      };

      // Customer: any of my orders changed
      const c1 = supabase.channel(`notif-customer-${userId}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `customer_id=eq.${userId}` }, (p) => {
          const oldRow = p.old as any; const row = p.new as any;
          if (oldRow?.status !== row?.status) {
            notify("Pedido atualizado", statusMsg[row.status] ?? `Status: ${row.status}`);
          } else if (oldRow?.payment_status !== row?.payment_status && row?.payment_status === "paid") {
            notify("Pagamento confirmado", "A loja já recebeu seu pedido.");
          } else if (oldRow?.courier_id !== row?.courier_id && row?.courier_id) {
            notify("Entregador a caminho", "Um entregador aceitou seu pedido.");
          }
        })
        .subscribe();
      channels.push(c1);

      if (isMerchant) {
        const { data: stores } = await supabase.from("stores").select("id,name").eq("owner_id", userId);
        for (const s of stores ?? []) {
          const ch = supabase.channel(`notif-store-${s.id}`)
            .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `store_id=eq.${s.id}` },
              () => notify(`Novo pedido em ${s.name}`, "Abra o painel do lojista para aceitar."))
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `store_id=eq.${s.id}` }, (p) => {
              const oldRow = p.old as any; const row = p.new as any;
              if (oldRow?.courier_id !== row?.courier_id && row?.courier_id) {
                notify(`Entregador designado — ${s.name}`, "Um entregador aceitou a corrida.");
              } else if (oldRow?.status !== row?.status && row?.status === "out_for_delivery") {
                notify(`Pedido saiu para entrega — ${s.name}`, "Acompanhe a entrega no painel.");
              } else if (oldRow?.status !== row?.status && row?.status === "delivered") {
                notify(`Pedido entregue — ${s.name}`, "O valor foi creditado na sua carteira.");
              }
            })
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
            if (row?.courier_id === userId && oldRow?.status !== row?.status) {
              if (row.status === "delivered") notify("Entrega concluída ✅", "Bom trabalho!");
              if (row.status === "cancelled") notify("Entrega cancelada", "O pedido foi cancelado.");
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
