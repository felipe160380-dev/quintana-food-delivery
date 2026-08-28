export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

export const orderStatusLabel: Record<string, string> = {
  pending: "Pendente",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const paymentMethodLabel: Record<string, string> = {
  pix: "Pix",
  card_online: "Cartão pelo app",
  cash_on_delivery: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};

export const paymentStatusLabel: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  approved: "Pago",
  failed: "Falhou",
  rejected: "Recusado",
  refunded: "Estornado",
  cancelled: "Cancelado",
  in_process: "Em análise",
};

/** Situação das solicitações de saque (lojista e entregador). */
export const withdrawalStatusLabel: Record<string, string> = {
  requested: "Pendente",
  approved: "Aprovado",
  paid: "Pago",
  rejected: "Recusado",
};

/** Identificador curto exibido ao usuário (compatível com os pedidos atuais). */
export const orderNumber = (id: string) => `#${(id ?? "").slice(0, 8)}`;

export const dateTimeBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR") : "—";

export const dateBR = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

export const label = (map: Record<string, string>, value?: string | null) =>
  (value && (map[value] ?? value)) || "—";

/** Etapas detalhadas da entrega (fluxo do entregador). */
export const courierStageLabel: Record<string, string> = {
  accepted: "Entrega aceita",
  to_store: "A caminho da loja",
  at_store: "Na loja",
  picked_up: "Pedido coletado",
  to_customer: "A caminho do cliente",
  at_customer: "No endereço do cliente",
};

/** Sequência obrigatória de etapas do entregador. */
export const COURIER_STAGES = [
  "accepted",
  "to_store",
  "at_store",
  "picked_up",
  "to_customer",
  "at_customer",
] as const;

export const courierStageAction: Record<string, string> = {
  to_store: "Sair para a loja",
  at_store: "Cheguei na loja",
  picked_up: "Coletei o pedido",
  to_customer: "Sair para entrega",
  at_customer: "Cheguei no cliente",
};

