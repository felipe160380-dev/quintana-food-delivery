import type { ReportAudience, ReportData } from "@/lib/reports.types";
import type { Sheet } from "@/lib/xlsx";
import {
  courierStageLabel,
  dateTimeBR,
  label,
  orderNumber,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  withdrawalStatusLabel,
} from "@/lib/format";

/** Monta as abas da planilha a partir dos dados retornados pelo servidor. */
export function buildReportSheets(data: ReportData, audience: ReportAudience): Sheet[] {
  const isAdmin = audience === "admin";
  const period = `${new Date(data.from).toLocaleDateString("pt-BR")} a ${new Date(data.to).toLocaleDateString("pt-BR")}`;
  const delivered = data.orders.filter((o) => o.status === "delivered");
  const cancelled = data.orders.filter((o) => o.status === "cancelled");
  const revenue = data.orders.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total, 0);
  const refunded = data.orders.reduce((a, o) => a + o.refunded_amount, 0);
  const ticket = data.orders.length ? revenue / data.orders.length : 0;

  const resumo: Sheet = {
    name: "RESUMO",
    columns: [{ header: "Indicador", width: 34 }, { header: "Valor", width: 28 }],
    rows: [
      [data.scope === "all" ? "Relatório" : "Loja", data.title],
      ...(data.city ? [["Cidade", data.city]] : []),
      ["Período", period],
      ["Quantidade total de pedidos", data.orders.length],
      ["Pedidos entregues", delivered.length],
      ["Pedidos cancelados", cancelled.length],
      ["Faturamento bruto (pedidos pagos)", revenue],
      ["Valores estornados", refunded],
      ["Ticket médio", Number(ticket.toFixed(2))],
      ["Quantidade de entregas", delivered.length],
    ] as (string | number)[][],
  };

  const pedidos: Sheet = {
    name: "PEDIDOS",
    columns: [
      { header: "Pedido", width: 12 },
      ...(isAdmin ? [{ header: "ID completo", width: 38 }] : []),
      { header: "Data/hora", width: 20 },
      ...(data.scope === "all" ? [{ header: "Loja", width: 24 }] : []),
      ...(isAdmin ? [{ header: "Cliente", width: 24 }] : []),
      { header: "Status", width: 18 },
      { header: "Pagamento", width: 16 },
      { header: "Forma de pagamento", width: 20 },
      { header: "Subtotal", width: 14, money: true },
      { header: "Desconto", width: 12, money: true },
      { header: "Taxa de entrega", width: 16, money: true },
      { header: "Total", width: 14, money: true },
      { header: "Entregador", width: 22 },
      { header: "Entrega concluída em", width: 20 },
    ],
    rows: data.orders.map((o) => [
      orderNumber(o.id),
      ...(isAdmin ? [o.id] : []),
      dateTimeBR(o.created_at),
      ...(data.scope === "all" ? [o.store_name] : []),
      ...(isAdmin ? [o.customer_name ?? "—"] : []),
      label(orderStatusLabel, o.status),
      label(paymentStatusLabel, o.payment_status),
      label(paymentMethodLabel, o.payment_method),
      o.subtotal,
      o.discount,
      o.delivery_fee,
      o.total,
      o.courier_name ?? "—",
      o.delivered_at ? dateTimeBR(o.delivered_at) : "—",
    ]),
  };

  const itens: Sheet = {
    name: "ITENS",
    columns: [
      { header: "Pedido", width: 12 },
      { header: "Data", width: 20 },
      { header: "Produto", width: 28 },
      { header: "Quantidade", width: 12 },
      { header: "Preço unitário", width: 16, money: true },
      { header: "Adicionais", width: 30 },
      { header: "Valor dos adicionais", width: 18, money: true },
      { header: "Subtotal", width: 14, money: true },
      { header: "Observação", width: 30 },
    ],
    rows: data.items.map((i) => [
      orderNumber(i.order_id),
      dateTimeBR(i.created_at),
      i.product_name,
      i.quantity,
      i.unit_price,
      i.addons || "—",
      i.addons_total,
      i.subtotal,
      i.notes ?? "—",
    ]),
  };

  const produtos: Sheet = {
    name: "PRODUTOS",
    columns: [
      { header: "Produto", width: 28 },
      { header: "Categoria", width: 20 },
      { header: "Preço atual", width: 14, money: true },
      { header: "Preço promocional", width: 18, money: true },
      { header: "Situação", width: 12 },
      { header: "Quantidade vendida", width: 18 },
      { header: "Faturamento no período", width: 22, money: true },
    ],
    rows: data.products.map((p) => [
      p.name,
      p.category ?? "—",
      p.price,
      p.promo_price ?? null,
      p.active,
      p.sold,
      Number(p.revenue.toFixed(2)),
    ]),
  };

  const entregas: Sheet = {
    name: "ENTREGAS",
    columns: [
      { header: "Pedido", width: 12 },
      { header: "Entregador", width: 24 },
      { header: "Status", width: 18 },
      { header: "Etapa atual", width: 22 },
      { header: "Taxa de entrega", width: 16, money: true },
      { header: "Aceite do entregador", width: 22 },
      { header: "Coleta", width: 20 },
      { header: "Conclusão", width: 20 },
    ],
    rows: data.orders
      .filter((o) => o.courier_name || o.courier_accepted_at)
      .map((o) => [
        orderNumber(o.id),
        o.courier_name ?? "—",
        label(orderStatusLabel, o.status),
        o.courier_stage ? label(courierStageLabel, o.courier_stage) : "—",
        o.delivery_fee,
        o.courier_accepted_at ? dateTimeBR(o.courier_accepted_at) : "—",
        o.picked_up_at ? dateTimeBR(o.picked_up_at) : "—",
        o.delivered_at ? dateTimeBR(o.delivered_at) : "—",
      ]),
  };

  const financeiro: Sheet = {
    name: "FINANCEIRO",
    columns: [
      { header: "Pedido", width: 12 },
      { header: "Data", width: 20 },
      { header: "Valor do pedido", width: 16, money: true },
      { header: "Forma de pagamento", width: 20 },
      { header: "Tipo", width: 14 },
      { header: "Status financeiro", width: 18 },
      { header: "Valor pago", width: 14, money: true },
      { header: "Valor estornado", width: 16, money: true },
      { header: "Pago em", width: 20 },
    ],
    rows: data.orders.map((o) => [
      orderNumber(o.id),
      dateTimeBR(o.created_at),
      o.total,
      label(paymentMethodLabel, o.payment_method),
      o.payment_type ?? "—",
      label(paymentStatusLabel, o.payment_status),
      o.paid_amount ?? null,
      o.refunded_amount || null,
      o.paid_at ? dateTimeBR(o.paid_at) : "—",
    ]),
  };

  const saques: Sheet = {
    name: "SAQUES",
    columns: [
      { header: "Solicitação", width: 14 },
      ...(data.scope === "all" ? [{ header: "Loja", width: 24 }] : []),
      ...(isAdmin ? [{ header: "Lojista", width: 24 }] : []),
      { header: "Data", width: 20 },
      { header: "Valor solicitado", width: 16, money: true },
      { header: "Taxa", width: 12, money: true },
      { header: "Valor líquido", width: 16, money: true },
      { header: "Status", width: 14 },
      { header: "Aprovado em", width: 20 },
      { header: "Pago em", width: 20 },
      { header: "Motivo da recusa", width: 30 },
    ],
    rows: data.withdrawals.map((w) => [
      orderNumber(w.id),
      ...(data.scope === "all" ? [w.store_name] : []),
      ...(isAdmin ? [w.owner_name ?? "—"] : []),
      dateTimeBR(w.requested_at),
      w.amount,
      w.fee,
      w.net,
      label(withdrawalStatusLabel, w.status),
      w.approved_at ? dateTimeBR(w.approved_at) : "—",
      w.paid_at ? dateTimeBR(w.paid_at) : "—",
      w.status === "rejected" ? w.note ?? "—" : "—",
    ]),
  };

  const sheets: Sheet[] = [resumo, pedidos, itens, produtos, entregas, financeiro, saques];

  if (data.scope === "all") {
    sheets.splice(1, 0, {
      name: "LOJAS",
      columns: [
        { header: "Loja", width: 28 },
        { header: "Cidade", width: 18 },
        { header: "Pedidos no período", width: 18 },
        { header: "Entregues", width: 12 },
        { header: "Cancelados", width: 12 },
        { header: "Faturamento", width: 16, money: true },
        { header: "Estornos", width: 14, money: true },
        { header: "Saques solicitados", width: 18, money: true },
        { header: "Saques pagos", width: 16, money: true },
      ],
      rows: data.storeLines.map((s) => [
        s.store_name,
        s.city ?? "—",
        s.orders,
        s.delivered,
        s.cancelled,
        Number(s.revenue.toFixed(2)),
        Number(s.refunded.toFixed(2)),
        Number(s.withdrawals_requested.toFixed(2)),
        Number(s.withdrawals_paid.toFixed(2)),
      ]),
    });
  }

  return sheets;
}

/** Períodos pré-definidos de exportação. */
export type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";

export function periodRange(key: PeriodKey, customFrom?: string, customTo?: string) {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (key === "7d") start.setDate(start.getDate() - 6);
  else if (key === "30d") start.setDate(start.getDate() - 29);
  else if (key === "month") start.setDate(1);
  else if (key === "custom") {
    const f = customFrom ? new Date(`${customFrom}T00:00:00`) : start;
    const t = customTo ? new Date(`${customTo}T23:59:59`) : end;
    return { from: f.toISOString(), to: t.toISOString() };
  }
  return { from: start.toISOString(), to: end.toISOString() };
}
