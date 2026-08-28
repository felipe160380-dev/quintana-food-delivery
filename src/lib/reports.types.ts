/** Tipos compartilhados dos relatórios (client-safe). */

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

/** Ficha administrativa completa de um pedido. */
export type AdminOrderDetail = {
  order: {
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
    change_for: number | null;
    delivery_code: string | null;
    delivered_at: string | null;
    courier_stage: string | null;
    address: Record<string, unknown>;
  };
  items: {
    id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    notes: string | null;
    addons: { name: string; price: number; quantity: number }[];
    subtotal: number;
  }[];
  customer: { name: string | null; phone: string | null; email: string | null };
  store: {
    name: string;
    owner_name: string | null;
    phone: string | null;
    whatsapp: string | null;
    address_line: string | null;
    city: string | null;
    state: string | null;
  } | null;
  courier: {
    name: string | null;
    phone: string | null;
    vehicle: string | null;
    vehicle_brand: string | null;
    vehicle_model: string | null;
    vehicle_plate: string | null;
    stage: string | null;
  } | null;
  payment: {
    provider: string;
    external_id: string | null;
    status: string;
    amount: number;
    payment_method: string | null;
    payment_type: string | null;
    paid_at: string | null;
    created_at: string;
  }[];
  events: { kind: string; created_at: string }[];
};
