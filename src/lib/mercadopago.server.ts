// Server-only helpers para integração Mercado Pago.
// Nunca importar este arquivo do bundle do cliente (o filename *.server.ts
// bloqueia isso automaticamente).

const MP_BASE = "https://api.mercadopago.com";

/**
 * URL pública do webhook. Enviada em cada pagamento (notification_url) para
 * não depender apenas do webhook configurado no painel do Mercado Pago.
 */
function notificationUrl(): string {
  const base =
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    "https://quintana-food-delivery.lovable.app";
  return `${base}/api/public/mp-webhook`;
}

export type MpPixResponse = {
  id: number;
  status: string;
  status_detail: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  transaction_amount: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
};

export type MpCardPayload = {
  token: string;
  installments: number;
  payment_method_id: string;
  issuer_id?: string | number;
  payer: { email: string; identification?: { type: string; number: string } };
};

export type MpPayment = {
  id: number;
  status: string;
  status_detail: string;
  transaction_amount: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_approved?: string | null;
  external_reference?: string | null;
};

function getToken(): string {
  const t = process.env.MP_ACCESS_TOKEN;
  if (!t) throw new Error("MP_ACCESS_TOKEN não configurado");
  return t;
}

async function mpFetch<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const { idempotencyKey, headers, ...rest } = init;
  const res = await fetch(`${MP_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
      ...(headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const msg = body?.message || body?.error || res.statusText;
    throw new Error(`Mercado Pago ${res.status}: ${msg}`);
  }
  return body as T;
}

export async function createPixPayment(args: {
  orderId: string;
  amount: number;
  description: string;
  payerEmail: string;
  payerName?: string;
}): Promise<MpPixResponse> {
  return mpFetch<MpPixResponse>("/v1/payments", {
    method: "POST",
    idempotencyKey: `order-${args.orderId}-pix`,
    body: JSON.stringify({
      transaction_amount: Number(args.amount.toFixed(2)),
      description: args.description,
      payment_method_id: "pix",
      external_reference: args.orderId,
      notification_url: notificationUrl(),
      payer: { email: args.payerEmail, first_name: args.payerName || "Cliente" },
    }),
  });
}

export async function createCardPayment(args: {
  orderId: string;
  amount: number;
  description: string;
  card: MpCardPayload;
}): Promise<MpPayment> {
  return mpFetch<MpPayment>("/v1/payments", {
    method: "POST",
    idempotencyKey: `order-${args.orderId}-card-${args.card.token.slice(0, 8)}`,
    body: JSON.stringify({
      transaction_amount: Number(args.amount.toFixed(2)),
      description: args.description,
      token: args.card.token,
      installments: args.card.installments,
      payment_method_id: args.card.payment_method_id,
      issuer_id: args.card.issuer_id,
      external_reference: args.orderId,
      notification_url: notificationUrl(),
      payer: args.card.payer,
    }),
  });
}

export async function getPayment(paymentId: string | number): Promise<MpPayment> {
  return mpFetch<MpPayment>(`/v1/payments/${paymentId}`, { method: "GET" });
}

/**
 * Reconciliação: busca no Mercado Pago todos os pagamentos criados para um
 * pedido (external_reference). Fonte da verdade é sempre a API do MP.
 */
export async function searchPaymentsByOrder(orderId: string): Promise<MpPayment[]> {
  const res = await mpFetch<{ results?: MpPayment[] }>(
    `/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=date_created&criteria=desc`,
    { method: "GET" },
  );
  return res.results ?? [];
}


/** Mapeia status Mercado Pago para o enum payment_status do banco. */
export function mapMpStatus(status: string): "pending" | "paid" | "failed" | "refunded" {
  switch (status) {
    case "approved":
      return "paid";
    case "refunded":
    case "charged_back":
      return "refunded";
    case "rejected":
    case "cancelled":
      return "failed";
    case "pending":
    case "in_process":
    case "authorized":
    default:
      return "pending";
  }
}

/**
 * Valida assinatura do webhook do Mercado Pago.
 * Doc: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * Formato do header x-signature: "ts=TIMESTAMP,v1=HASH"
 * template: id:{data.id};request-id:{x-request-id};ts:{TIMESTAMP};
 */
export async function verifyMpSignature(args: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}): Promise<boolean> {
  if (!args.xSignature || !args.dataId || !args.secret) return false;
  const parts = Object.fromEntries(
    args.xSignature.split(",").map((p) => {
      const [k, v] = p.trim().split("=");
      return [k, v];
    }),
  ) as { ts?: string; v1?: string };
  if (!parts.ts || !parts.v1) return false;

  const template = `id:${args.dataId};request-id:${args.xRequestId ?? ""};ts:${parts.ts};`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(template));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Comparação em tempo constante
  if (hex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}
