import type { AdminOrderDetail } from "@/lib/reports.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Carrega a ficha completa de um pedido (uso administrativo, somente servidor). */
export async function loadOrderDetail(db: Db, orderId: string): Promise<AdminOrderDetail> {
  const { data: o, error } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!o) throw new Error("Pedido não encontrado");

  const [{ data: rawItems }, { data: store }, { data: payments }, { data: events }] = await Promise.all([
    db
      .from("order_items")
      .select("id, product_name, unit_price, quantity, notes, addons:order_item_addons(name, price, quantity)")
      .eq("order_id", orderId),
    db
      .from("stores")
      .select("name, owner_id, phone, whatsapp, address_line, city, state")
      .eq("id", o.store_id)
      .maybeSingle(),
    db
      .from("payments")
      .select("provider, external_id, status, amount, payment_method, payment_type, paid_at, created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    db.from("order_events").select("kind, created_at").eq("order_id", orderId).order("created_at"),
  ]);

  const personIds = [o.customer_id, o.courier_id, store?.owner_id].filter(Boolean) as string[];
  const { data: profiles } = await db.from("profiles").select("id, full_name, phone").in("id", personIds);
  const pMap = new Map<string, { full_name: string | null; phone: string | null }>(
    (profiles ?? []).map((p: any) => [p.id, p]),
  );

  let email: string | null = null;
  try {
    const { data: authUser } = await db.auth.admin.getUserById(o.customer_id);
    email = authUser?.user?.email ?? null;
  } catch {
    email = null;
  }

  let courier: AdminOrderDetail["courier"] = null;
  if (o.courier_id) {
    const { data: c } = await db
      .from("couriers")
      .select("vehicle, vehicle_brand, vehicle_model, vehicle_plate")
      .eq("id", o.courier_id)
      .maybeSingle();
    const prof = pMap.get(o.courier_id);
    courier = {
      name: prof?.full_name ?? null,
      phone: prof?.phone ?? null,
      vehicle: c?.vehicle ?? null,
      vehicle_brand: c?.vehicle_brand ?? null,
      vehicle_model: c?.vehicle_model ?? null,
      vehicle_plate: c?.vehicle_plate ?? null,
      stage: o.courier_stage ?? null,
    };
  }

  const items = (rawItems ?? []).map((it: any) => {
    const addons = ((it.addons ?? []) as any[]).map((a) => ({
      name: a.name as string,
      price: Number(a.price ?? 0),
      quantity: Number(a.quantity ?? 1),
    }));
    const addonsTotal = addons.reduce((acc, a) => acc + a.price * a.quantity, 0);
    return {
      id: it.id as string,
      product_name: it.product_name as string,
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      notes: it.notes ?? null,
      addons,
      subtotal: (Number(it.unit_price ?? 0) + addonsTotal) * Number(it.quantity ?? 0),
    };
  });

  const customerProfile = pMap.get(o.customer_id);

  return {
    order: {
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
      change_for: o.change_for != null ? Number(o.change_for) : null,
      delivery_code: o.delivery_code ?? null,
      delivered_at: o.delivered_at ?? null,
      courier_stage: o.courier_stage ?? null,
      address: (o.address_snapshot ?? {}) as Record<string, string | number | boolean | null>,
    },
    items,
    customer: {
      name: customerProfile?.full_name ?? null,
      phone: customerProfile?.phone ?? null,
      email,
    },
    store: store
      ? {
          name: store.name,
          owner_name: pMap.get(store.owner_id)?.full_name ?? null,
          phone: store.phone ?? null,
          whatsapp: store.whatsapp ?? null,
          address_line: store.address_line ?? null,
          city: store.city ?? null,
          state: store.state ?? null,
        }
      : null,
    courier,
    payment: (payments ?? []).map((p: any) => ({
      provider: p.provider,
      external_id: p.external_id ?? null,
      status: p.status,
      amount: Number(p.amount ?? 0),
      payment_method: p.payment_method ?? null,
      payment_type: p.payment_type ?? null,
      paid_at: p.paid_at ?? null,
      created_at: p.created_at,
    })),
    events: (events ?? []).map((e: any) => ({ kind: e.kind, created_at: e.created_at })),
  };
}
