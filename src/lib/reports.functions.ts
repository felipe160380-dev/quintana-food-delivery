import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReportData } from "@/lib/reports.types";

/** Relatório administrativo: uma loja específica ou a plataforma inteira. */
export const adminReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId: string | null; from: string; to: string }) => {
    if (!input?.from || !input?.to) throw new Error("Período inválido");
    return input;
  })
  .handler(async ({ data, context }): Promise<ReportData> => {
    const { supabase, userId } = context;
    const { data: isAdmin, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (error) throw new Error(error.message);
    if (!isAdmin) throw new Error("Somente administradores podem exportar estes dados.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildReport } = await import("@/lib/reports.server");

    let storeIds: string[];
    if (data.storeId) {
      storeIds = [data.storeId];
    } else {
      const { data: stores } = await supabaseAdmin.from("stores").select("id");
      storeIds = (stores ?? []).map((s: { id: string }) => s.id);
    }
    if (!storeIds.length) throw new Error("Nenhuma loja encontrada.");

    return buildReport(supabaseAdmin, {
      storeIds,
      from: data.from,
      to: data.to,
      audience: "admin",
      scope: data.storeId ? "store" : "all",
    });
  });

/** Relatório do lojista: somente lojas do próprio usuário autenticado. */
export const merchantReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { storeId?: string | null; from: string; to: string }) => {
    if (!input?.from || !input?.to) throw new Error("Período inválido");
    return input;
  })
  .handler(async ({ data, context }): Promise<ReportData> => {
    const { supabase, userId } = context;

    const { data: mine, error } = await supabase.from("stores").select("id").eq("owner_id", userId);
    if (error) throw new Error(error.message);
    const owned = (mine ?? []).map((s: { id: string }) => s.id);
    if (!owned.length) throw new Error("Nenhuma loja vinculada a esta conta.");

    const storeId = data.storeId && owned.includes(data.storeId) ? data.storeId : owned[0];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildReport } = await import("@/lib/reports.server");

    return buildReport(supabaseAdmin, {
      storeIds: [storeId],
      from: data.from,
      to: data.to,
      audience: "merchant",
      scope: "store",
    });
  });

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
