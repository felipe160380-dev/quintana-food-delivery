/** Tipos compartilhados da ficha administrativa de pedido (client-safe). */

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
    address: Record<string, string | number | boolean | null>;
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
