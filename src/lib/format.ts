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
  pending: "Aguardando loja",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "A caminho",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const paymentMethodLabel: Record<string, string> = {
  pix: "Pix",
  card_online: "Cartão pelo app",
  cash_on_delivery: "Dinheiro na entrega",
  card_on_delivery: "Cartão na entrega",
};
