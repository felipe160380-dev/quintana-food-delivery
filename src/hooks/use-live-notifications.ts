import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

function alertUser() {
  try { navigator.vibrate?.([180, 90, 180]); } catch {}
  try {
    const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch {}
}

function notify(title: string, body?: string | null, alert = false) {
  toast(title, { description: body ?? undefined });
  if (alert) alertUser();
  if ("Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: body ?? undefined, icon: "/icon-192.png" }); } catch {}
  }
}

/**
 * Escuta as notificações persistidas do usuário logado (user_notifications)
 * e, para lojistas, as notificações das próprias lojas (store_notifications),
 * exibindo toast + notificação nativa do navegador.
 */
export function useLiveNotifications() {
  const { user, roles } = useAuth();
  const userId = user?.id;
  const isMerchant = roles.includes("merchant");

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const channels: any[] = [];

    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch {}
    }

    const personal = supabase
      .channel(`notif-user-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` },
        (p) => {
          const row = p.new as any;
          notify(row.title, row.body, row.kind === "courier_approved" || row.kind?.startsWith("payment_"));
        },
      )
      .subscribe();
    channels.push(personal);

    (async () => {
      if (!isMerchant) return;
      const { data: stores } = await supabase.from("stores").select("id,name").eq("owner_id", userId);
      if (cancelled) return;
      for (const s of stores ?? []) {
        const ch = supabase
          .channel(`notif-store-${s.id}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "store_notifications", filter: `store_id=eq.${s.id}` },
            (p) => {
              const row = p.new as any;
              notify(row.title, row.body, row.kind === "new_order");
            },
          )
          .subscribe();
        channels.push(ch);
      }
    })();

    return () => {
      cancelled = true;
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [userId, isMerchant]);
}
