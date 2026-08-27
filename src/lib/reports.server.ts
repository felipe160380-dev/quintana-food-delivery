/**
 * Montagem dos dados de relatório (Excel) — SOMENTE servidor.
 * Usa o client administrativo depois que a autorização já foi validada
 * pela server function que chama estas funções.
 */

export type ReportAudience = "admin" | "merchant";

export type ReportOrder = {
  id: string;
  created_at: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  delivery_fee: number;
  total: number;
  notes: string | null;
  store_id: string;
  store_name: string;
  customer_name: string | null;
  courier_name: string | null;
  courier_stage: string | null;
  delivered_at: string | null;
  accepted_at: string | null;
  ready_at: string | null;
  courier_accepted_at: string | null;
  picked_up_at: string | null;
  paid_amount: number | null;
  paid_at: string | null;
  refunded_amount: number;
  payment_type: string | null;
};

export type ReportItem = {
  order_id: string;
  created_at: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  addons: string;
  addons_total: number;
  subtotal: number;
  notes: string | null;
};

export type ReportProduct = {
  name: string;
  category: string | null;
  price: number;
  promo_price: number | null;
  active: string;
  sold: number;
  revenue: number;
};

export type ReportWithdrawal = {
  id: string;
  store_name: string;
  owner_name: string | null;
  requested_at: string;
  amount: number;
  fee: number;
  net: number;
  status: string;
  approved_at: string | null;
  paid_at: string | null;
  note: string | null;
};

export type ReportStoreLine = {
  store_name: string;
  city: string | null;
  orders: number;
  delivered: number;
  cancelled: number;
  revenue: number;
  refunded: number;
  withdrawals_requested: number;
  withdrawals_paid: number;
};

export type ReportData = {
  scope: "store" | "all";
  title: string;
  city: string | null;
  from: string;
  to: string;
  orders: ReportOrder[];
  items: ReportItem[];
  products: ReportProduct[];
  withdrawals: ReportWithdrawal[];
  storeLines: ReportStoreLine[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export async function buildReport(
  db: Db,
  opts: { storeIds: string[]; from: string; to: string; audience: ReportAudience; scope: "store" | "all" },
): Promise<ReportData> {
  const { storeIds, from, to, audience, scope } = opts;

  const { data: stores } = await db
    .from("stores")
    .select("id, name, city, owner_id")
    .in("id", storeIds);
  const storeMap = new Map<string, any>((stores ?? []).map((s: any) => [s.id, s]));

  const { data: rawOrders } = await db
    .from("orders")
    .select(
      "id, created_at, status, payment_status, payment_method, subtotal, delivery_fee, total, notes, store_id, customer_id, courier_id, courier_stage, delivered_at",
    )
    .in("store_id", storeIds)
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: false });

  const orders = (rawOrders ?? []) as any[];
  const orderIds = orders.map((o) => o.id);

  const personIds = Array.from(
    new Set(orders.flatMap((o) => [o.customer_id, o.courier_id]).filter(Boolean)),
  ) as string[];

  const [{ data: profiles }, { data: payments }, { data: events }, { data: items }, { data: products }, { data: withdrawals }] =
    await Promise.all([
      personIds.length
        ? db.from("profiles").select("id, full_name").in("id", personIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? db
            .from("payments")
            .select("order_id, status, amount, payment_method, payment_type, paid_at")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? db.from("order_events").select("order_id, kind, created_at").in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      orderIds.length
        ? db
            .from("order_items")
            .select("order_id, product_id, product_name, unit_price, quantity, notes, addons:order_item_addons(name, price, quantity)")
            .in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      db.from("products").select("id, store_id, name, category, price, promo_price, is_available, is_paused").in("store_id", storeIds),
      db
        .from("store_withdrawals")
        .select("id, store_id, amount, fee, net, status, requested_at, approved_at, paid_at, note")
        .in("store_id", storeIds)
        .gte("requested_at", from)
        .lte("requested_at", to)
        .order("requested_at", { ascending: false }),
    ]);

  const nameOf = new Map<string, string | null>((profiles ?? []).map((p: any) => [p.id, p.full_name]));
  const ownerNames = new Map<string, string | null>();
  (stores ?? []).forEach((s: any) => ownerNames.set(s.id, nameOf.get(s.owner_id) ?? null));

  // Nome do dono da loja pode não estar em profiles carregados acima.
  const missingOwners = (stores ?? []).map((s: any) => s.owner_id).filter((id: string) => !nameOf.has(id));
  if (missingOwners.length) {
    const { data: owners } = await db.from("profiles").select("id, full_name").in("id", missingOwners);
    (owners ?? []).forEach((p: any) => nameOf.set(p.id, p.full_name));
    (stores ?? []).forEach((s: any) => ownerNames.set(s.id, nameOf.get(s.owner_id) ?? null));
  }

  const evt = new Map<string, Record<string, string>>();
  (events ?? []).forEach((e: any) => {
    const cur = evt.get(e.order_id) ?? {};
    if (!cur[e.kind]) cur[e.kind] = e.created_at;
    evt.set(e.order_id, cur);
  });

  const payByOrder = new Map<string, any>();
  const refundByOrder = new Map<string, number>();
  (payments ?? []).forEach((p: any) => {
    if (p.status === "paid") payByOrder.set(p.order_id, p);
    if (p.status === "refunded") refundByOrder.set(p.order_id, Number(p.amount ?? 0));
  });

  const reportOrders: ReportOrder[] = orders.map((o) => {
    const e = evt.get(o.id) ?? {};
    const pay = payByOrder.get(o.id);
    return {
      id: o.id,
      created_at: o.created_at,
      status: o.status,
      payment_status: o.payment_status,
      payment_method: o.payment_method,
      subtotal: Number(o.subtotal ?? 0),
      discount: 0,
      delivery_fee: Number(o.delivery_fee ?? 0),
      total: Number(o.total ?? 0),
      notes: o.notes ?? null,
      store_id: o.store_id,
      store_name: storeMap.get(o.store_id)?.name ?? "—",
      customer_name: nameOf.get(o.customer_id) ?? null,
      courier_name: o.courier_id ? nameOf.get(o.courier_id) ?? null : null,
      courier_stage: o.courier_stage ?? null,
      delivered_at: o.delivered_at ?? e["status_delivered"] ?? null,
      accepted_at: e["status_accepted"] ?? null,
      ready_at: e["status_ready"] ?? null,
      courier_accepted_at: e["courier_assigned"] ?? null,
      picked_up_at: e["status_out_for_delivery"] ?? null,
      paid_amount: pay ? Number(pay.amount ?? 0) : null,
      paid_at: pay?.paid_at ?? null,
      refunded_amount: refundByOrder.get(o.id) ?? 0,
      payment_type: pay?.payment_type ?? null,
    };
  });

  const orderDate = new Map(reportOrders.map((o) => [o.id, o.created_at]));

  const reportItems: ReportItem[] = (items ?? []).map((it: any) => {
    const addons = (it.addons ?? []) as any[];
    const addonsTotal = addons.reduce((a, x) => a + Number(x.price ?? 0) * Number(x.quantity ?? 1), 0);
    const qty = Number(it.quantity ?? 0);
    return {
      order_id: it.order_id,
      created_at: orderDate.get(it.order_id) ?? "",
      product_name: it.product_name,
      quantity: qty,
      unit_price: Number(it.unit_price ?? 0),
      addons: addons.map((a) => `${a.quantity > 1 ? `${a.quantity}x ` : ""}${a.name}`).join(", "),
      addons_total: addonsTotal * qty,
      subtotal: (Number(it.unit_price ?? 0) + addonsTotal) * qty,
      notes: it.notes ?? null,
    };
  });

  const soldMap = new Map<string, { qty: number; revenue: number }>();
  (items ?? []).forEach((it: any) => {
    const key = String(it.product_name);
    const cur = soldMap.get(key) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(it.quantity ?? 0);
    cur.revenue += Number(it.unit_price ?? 0) * Number(it.quantity ?? 0);
    soldMap.set(key, cur);
  });

  const reportProducts: ReportProduct[] = (products ?? []).map((p: any) => {
    const sold = soldMap.get(p.name) ?? { qty: 0, revenue: 0 };
    return {
      name: p.name,
      category: p.category ?? null,
      price: Number(p.price ?? 0),
      promo_price: p.promo_price != null ? Number(p.promo_price) : null,
      active: p.is_available && !p.is_paused ? "Ativo" : "Inativo",
      sold: sold.qty,
      revenue: sold.revenue,
    };
  });

  const reportWithdrawals: ReportWithdrawal[] = (withdrawals ?? []).map((w: any) => ({
    id: w.id,
    store_name: storeMap.get(w.store_id)?.name ?? "—",
    owner_name: audience === "admin" ? ownerNames.get(w.store_id) ?? null : null,
    requested_at: w.requested_at,
    amount: Number(w.amount ?? 0),
    fee: Number(w.fee ?? 0),
    net: Number(w.net ?? 0),
    status: w.status,
    approved_at: w.approved_at ?? null,
    paid_at: w.paid_at ?? null,
    note: w.note ?? null,
  }));

  const storeLines: ReportStoreLine[] = (stores ?? []).map((s: any) => {
    const os = reportOrders.filter((o) => o.store_id === s.id);
    const ws = reportWithdrawals.filter((w) => w.store_name === s.name);
    return {
      store_name: s.name,
      city: s.city ?? null,
      orders: os.length,
      delivered: os.filter((o) => o.status === "delivered").length,
      cancelled: os.filter((o) => o.status === "cancelled").length,
      revenue: os.filter((o) => o.payment_status === "paid").reduce((a, o) => a + o.total, 0),
      refunded: os.reduce((a, o) => a + o.refunded_amount, 0),
      withdrawals_requested: ws.reduce((a, w) => a + w.amount, 0),
      withdrawals_paid: ws.filter((w) => w.status === "paid").reduce((a, w) => a + w.amount, 0),
    };
  });

  const first = storeIds.length === 1 ? storeMap.get(storeIds[0]) : null;

  return {
    scope,
    title: scope === "all" ? "Todas as lojas" : first?.name ?? "Loja",
    city: first?.city ?? null,
    from,
    to,
    orders: reportOrders,
    items: reportItems,
    products: reportProducts,
    withdrawals: reportWithdrawals,
    storeLines,
  };
}
