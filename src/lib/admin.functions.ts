import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Estorno TOTAL de um pagamento online, executado SOMENTE no servidor e
 * SOMENTE por administrador autenticado. O valor nunca vem do navegador:
 * é lido do banco/Mercado Pago.
 */
export const adminRefundOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => {
    if (!input?.orderId || typeof input.orderId !== "string") throw new Error("orderId inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1) Autorização: precisa ser admin (checado com o client do usuário).
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Somente administradores podem estornar pagamentos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2) Pedido e pagamento vêm do banco, nunca do cliente.
    const { data: order, error: orderErr } = await supabaseAdmin
      .from("orders")
      .select("id, total, payment_status, payment_method, status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw new Error(orderErr.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.payment_status === "refunded") throw new Error("Este pedido já foi estornado.");
    if (order.payment_status !== "paid") throw new Error("Só é possível estornar pagamento aprovado.");
    if (!["pix", "card_online"].includes(order.payment_method)) {
      throw new Error("Pagamento físico (na entrega) não pode ser estornado pelo app.");
    }

    const { data: payment, error: payErr } = await supabaseAdmin
      .from("payments")
      .select("id, external_id, status, amount")
      .eq("order_id", order.id)
      .eq("provider", "mercadopago")
      .eq("status", "paid")
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (payErr) throw new Error(payErr.message);
    if (!payment?.external_id) throw new Error("Nenhum pagamento aprovado no Mercado Pago para este pedido.");

    const amount = Number(payment.amount ?? order.total);

    async function log(result: string, details: unknown) {
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: userId,
        action: "refund_order",
        order_id: order!.id,
        amount,
        result,
        details: details as never,
      });
    }

    const { refundPayment, getPayment } = await import("@/lib/mercadopago.server");

    // 3) Confere no Mercado Pago (fonte da verdade) antes de estornar.
    try {
      const mp = await getPayment(payment.external_id);
      if (mp.status === "refunded" || mp.status === "charged_back") {
        await supabaseAdmin.from("payments").update({ status: "refunded", raw: mp as never }).eq("id", payment.id);
        await supabaseAdmin
          .from("orders")
          .update({ payment_status: "refunded", status: "cancelled" })
          .eq("id", order.id);
        await log("already_refunded", { mp_status: mp.status });
        throw new Error("Este pagamento já estava estornado no Mercado Pago.");
      }
      if (mp.status !== "approved") {
        await log("error", { mp_status: mp.status });
        throw new Error(`Pagamento não está aprovado no Mercado Pago (status: ${mp.status}).`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao consultar o Mercado Pago";
      throw new Error(msg);
    }

    // 4) Estorno total.
    try {
      const refund = await refundPayment(payment.external_id);
      await supabaseAdmin
        .from("payments")
        .update({ status: "refunded" })
        .eq("id", payment.id);
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "refunded", status: "cancelled" })
        .eq("id", order.id);
      await log("success", { refund_id: refund?.id ?? null, payment_external_id: payment.external_id });
      return { ok: true as const, amount, refundId: refund?.id ?? null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no estorno";
      await log("error", { message: msg, payment_external_id: payment.external_id });
      // Não marcamos como reembolsado quando o Mercado Pago falha.
      throw new Error(msg);
    }
  });
