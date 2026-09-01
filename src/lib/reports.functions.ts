import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Ficha administrativa completa de um pedido. */
export const adminOrderDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => {
    if (!input?.orderId) throw new Error("Pedido inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Acesso restrito a administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadOrderDetail } = await import("@/lib/reports.server.detail");
    return loadOrderDetail(supabaseAdmin, data.orderId);
  });
