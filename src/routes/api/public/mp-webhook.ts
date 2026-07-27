import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/mp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");
        const raw = await request.text();
        let body: any = {};
        try {
          body = raw ? JSON.parse(raw) : {};
        } catch {
          body = {};
        }
        const dataId: string | null =
          body?.data?.id != null
            ? String(body.data.id)
            : url.searchParams.get("data.id") ?? url.searchParams.get("id");

        const secret = process.env.MP_WEBHOOK_SECRET;
        const { verifyMpSignature, getPayment, mapMpStatus } = await import(
          "@/lib/mercadopago.server"
        );

        // Se o secret existir, valida assinatura (padrão oficial MP).
        if (secret) {
          const ok = await verifyMpSignature({ xSignature, xRequestId, dataId, secret });
          if (!ok) return new Response("Invalid signature", { status: 401 });
        }

        // Só nos interessa notificação de pagamento.
        const topic =
          body?.type ?? body?.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
        if (topic && !["payment", "payment.updated", "payment.created"].includes(String(topic))) {
          return new Response("ignored", { status: 200 });
        }
        if (!dataId) return new Response("missing data.id", { status: 400 });

        const mp = await getPayment(dataId);
        const orderId = mp.external_reference || null;
        const status = mapMpStatus(mp.status);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Upsert idempotente em payments (unique em provider+external_id).
        const { error: upErr } = await supabaseAdmin.from("payments").upsert(
          {
            order_id: orderId as string,
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
        if (upErr) {
          console.error("mp-webhook payments upsert error", upErr.message);
          return new Response("db error", { status: 500 });
        }

        // Atualiza o pedido conforme o status mudar.
        if (orderId) {
          const patch =
            status === "refunded"
              ? { payment_status: status, status: "cancelled" as const }
              : { payment_status: status };

          const { error: oErr } = await supabaseAdmin
            .from("orders")
            .update(patch)
            .eq("id", orderId);
          if (oErr) console.error("mp-webhook orders update error", oErr.message);
        }


        return new Response("ok", { status: 200 });
      },
    },
  },
});
