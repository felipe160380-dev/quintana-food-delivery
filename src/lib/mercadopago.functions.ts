import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Retorna a Public Key do Mercado Pago para uso no SDK do cliente. */
export const getMpPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { publicKey: process.env.MP_PUBLIC_KEY ?? "" };
});

/** Cria um pagamento Pix para um pedido do usuário autenticado. */
export const createPixForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => {
    if (!input?.orderId || typeof input.orderId !== "string") throw new Error("orderId inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_id, total, payment_status, payment_method")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.customer_id !== userId) throw new Error("Sem permissão");
    if (order.payment_status === "paid") throw new Error("Pedido já pago");

    // Reaproveita pagamento pendente se já existir
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("payments")
      .select("id, external_id, raw, status")
      .eq("order_id", order.id)
      .eq("provider", "mercadopago")
      .eq("payment_method", "pix")
      .in("status", ["pending"])
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (existing?.raw && (existing.raw as any)?.qr_code) {
      const raw = existing.raw as any;
      return {
        paymentId: existing.external_id,
        qr_code: raw.qr_code as string,
        qr_code_base64: raw.qr_code_base64 as string,
        ticket_url: raw.ticket_url as string | undefined,
      };
    }

    const { createPixPayment, mapMpStatus } = await import("@/lib/mercadopago.server");
    const email = (claims as any)?.email || `cliente-${userId}@quintanafood.app`;
    const mp = await createPixPayment({
      orderId: order.id,
      amount: Number(order.total),
      description: `Pedido MiPede #${order.id.slice(0, 8)}`,
      payerEmail: email,
    });
    const qr = mp.point_of_interaction?.transaction_data;
    const rawPayload = {
      qr_code: qr?.qr_code,
      qr_code_base64: qr?.qr_code_base64,
      ticket_url: qr?.ticket_url,
      mp,
    };
    const { error: payErr } = await supabaseAdmin.from("payments").upsert(
      {
        order_id: order.id,
        provider: "mercadopago",
        external_id: String(mp.id),
        status: mapMpStatus(mp.status),
        amount: mp.transaction_amount,
        payment_method: "pix",
        payment_type: mp.payment_type_id ?? "bank_transfer",
        paid_at: mp.date_approved,
        raw: rawPayload,
      },
      { onConflict: "provider,external_id" },
    );
    if (payErr) console.error("createPixForOrder payments upsert error", payErr.message);

    return {
      paymentId: String(mp.id),
      qr_code: qr?.qr_code ?? "",
      qr_code_base64: qr?.qr_code_base64 ?? "",
      ticket_url: qr?.ticket_url,
    };
  });

/** Cria pagamento com cartão (recebe token gerado pelo SDK do cliente). */
export const createCardForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    orderId: string;
    token: string;
    installments: number;
    payment_method_id: string;
    issuer_id?: string | number;
    payer_email: string;
    identification_type?: string;
    identification_number?: string;
  }) => {
    if (!input?.orderId || !input?.token || !input?.payment_method_id) {
      throw new Error("Dados de cartão incompletos");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_id, total, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.customer_id !== userId) throw new Error("Sem permissão");
    if (order.payment_status === "paid") throw new Error("Pedido já pago");

    const { createCardPayment, mapMpStatus } = await import("@/lib/mercadopago.server");
    const mp = await createCardPayment({
      orderId: order.id,
      amount: Number(order.total),
      description: `Pedido MiPede #${order.id.slice(0, 8)}`,
      card: {
        token: data.token,
        installments: data.installments || 1,
        payment_method_id: data.payment_method_id,
        issuer_id: data.issuer_id,
        payer: {
          email: data.payer_email,
          identification:
            data.identification_type && data.identification_number
              ? { type: data.identification_type, number: data.identification_number }
              : undefined,
        },
      },
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const status = mapMpStatus(mp.status);
    const { error: payErr } = await supabaseAdmin.from("payments").upsert(
      {
        order_id: order.id,
        provider: "mercadopago",
        external_id: String(mp.id),
        status,
        amount: mp.transaction_amount,
        payment_method: mp.payment_method_id ?? "card",
        payment_type: mp.payment_type_id ?? "credit_card",
        paid_at: mp.date_approved,
        raw: mp as any,
      },
      { onConflict: "provider,external_id" },
    );
    if (payErr) console.error("createCardForOrder payments upsert error", payErr.message);

    if (status === "paid") {
      await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
    } else if (status === "failed") {
      await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
    }

    return {
      paymentId: String(mp.id),
      status,
      mp_status: mp.status,
      status_detail: mp.status_detail,
    };
  });

/**
 * Reconciliação: consulta o Mercado Pago (fonte da verdade) e sincroniza
 * payments + orders.payment_status. Usada quando o webhook não chega.
 * Nunca confia em dados do cliente — apenas no orderId, e só quem participa
 * do pedido (cliente, dono da loja ou admin) pode chamar.
 */
export const syncOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { orderId: string }) => {
    if (!input?.orderId || typeof input.orderId !== "string") throw new Error("orderId inválido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS garante que só quem participa do pedido consegue lê-lo.
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, payment_status, payment_method")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("Pedido não encontrado");
    if (order.payment_status === "paid") return { payment_status: "paid" as const };
    if (!["pix", "card_online"].includes(order.payment_method)) {
      return { payment_status: order.payment_status };
    }

    const { searchPaymentsByOrder, mapMpStatus } = await import("@/lib/mercadopago.server");
    const list = await searchPaymentsByOrder(order.id);
    if (list.length === 0) return { payment_status: order.payment_status };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let best: "pending" | "paid" | "failed" | "refunded" = "pending";
    for (const mp of list) {
      const status = mapMpStatus(mp.status);
      const { error: upErr } = await supabaseAdmin.from("payments").upsert(
        {
          order_id: order.id,
          provider: "mercadopago",
          external_id: String(mp.id),
          status,
          amount: mp.transaction_amount,
          payment_method: mp.payment_method_id ?? null,
          payment_type: mp.payment_type_id ?? null,
          paid_at: mp.date_approved,
          raw: mp as any,
        },
        { onConflict: "provider,external_id" },
      );
      if (upErr) console.error("syncOrderPayment payments upsert error", upErr.message);
      if (status === "paid") best = "paid";
      else if (status === "refunded" && best !== "paid") best = "refunded";
      else if (status === "failed" && best === "pending") best = "failed";
    }

    // Só promovemos o pedido quando o Mercado Pago confirma. Nunca rebaixamos
    // um pedido já pago.
    if (best === "paid") {
      await supabaseAdmin.from("orders").update({ payment_status: "paid" }).eq("id", order.id);
    } else if (best === "refunded") {
      await supabaseAdmin
        .from("orders")
        .update({ payment_status: "refunded", status: "cancelled" })
        .eq("id", order.id);
    } else if (best === "failed") {
      await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", order.id);
    }
    return { payment_status: best };
  });
