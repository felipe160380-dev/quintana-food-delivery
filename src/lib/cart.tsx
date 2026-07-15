import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartAddon = { name: string; price: number; quantity: number };
export type CartItem = {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  image_url?: string | null;
  addons?: CartAddon[];
  notes?: string;
  line_id?: string;
};

type CartState = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
};

const empty: CartState = { storeId: null, storeName: null, items: [] };
const KEY = "qf.cart.v2";

function addonsTotal(a?: CartAddon[]) {
  return (a ?? []).reduce((s, x) => s + x.price * x.quantity, 0);
}
export function itemTotal(i: CartItem) {
  return (i.unit_price + addonsTotal(i.addons)) * i.quantity;
}

const Ctx = createContext<{
  state: CartState;
  add: (storeId: string, storeName: string, item: CartItem) => void;
  remove: (line_id: string) => void;
  setQty: (line_id: string, qty: number) => void;
  clear: () => void;
  subtotal: number;
  count: number;
}>({
  state: empty,
  add: () => {},
  remove: () => {},
  setQty: () => {},
  clear: () => {},
  subtotal: 0,
  count: 0,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(empty);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
      if (raw) setState(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  const api = useMemo(() => {
    const subtotal = state.items.reduce((s, i) => s + itemTotal(i), 0);
    const count = state.items.reduce((s, i) => s + i.quantity, 0);
    return {
      state,
      subtotal,
      count,
      add: (storeId: string, storeName: string, item: CartItem) => {
        const withId: CartItem = { ...item, line_id: item.line_id ?? crypto.randomUUID() };
        setState((prev) => {
          if (prev.storeId && prev.storeId !== storeId) {
            if (!confirm("Seu carrinho tem itens de outra loja. Deseja esvaziar e adicionar esse item?")) return prev;
            return { storeId, storeName, items: [withId] };
          }
          return { storeId, storeName, items: [...prev.items, withId] };
        });
      },
      remove: (line_id: string) =>
        setState((prev) => {
          const items = prev.items.filter((i) => i.line_id !== line_id);
          return items.length ? { ...prev, items } : empty;
        }),
      setQty: (line_id: string, qty: number) =>
        setState((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.line_id === line_id ? { ...i, quantity: Math.max(1, qty) } : i)),
        })),
      clear: () => setState(empty),
    };
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
