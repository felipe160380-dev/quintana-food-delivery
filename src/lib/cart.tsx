import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CartAddon = { addon_id?: string; name: string; price: number; quantity: number };
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
  /** Dono do carrinho: user.id do cliente logado ou "guest". */
  owner?: string;
};

const GUEST = "guest";
const empty: CartState = { storeId: null, storeName: null, items: [], owner: GUEST };
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
  const owner = useRef<string>(GUEST);

  // Só liberamos a persistência depois de saber quem é o dono do carrinho.
  const [hydrated, setHydrated] = useState(false);

  // Primeiro confirmamos quem está logado; só então lemos o carrinho salvo.
  // Isso evita exibir, mesmo que por um instante, o carrinho de outra conta.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const applyOwner = (next: string) => {
      owner.current = next;
      setState((prev) => {
        if ((prev.owner ?? GUEST) === next) return prev;
        return { ...empty, owner: next };
      });
    };

    let first = true;
    const resolve = (uid: string | undefined) => {
      const next = uid ?? GUEST;
      if (!first) {
        applyOwner(next);
        return;
      }
      first = false;
      owner.current = next;
      let raw: string | null = null;
      try { raw = localStorage.getItem(KEY); } catch { /* storage indisponível */ }
      let saved: CartState | null = null;
      if (raw) {
        try { saved = JSON.parse(raw) as CartState; } catch { /* json inválido */ }
      }
      setState(saved && (saved.owner ?? GUEST) === next ? { ...empty, ...saved } : { ...empty, owner: next });
      setHydrated(true);
    };

    supabase.auth.getSession().then(({ data }) => resolve(data.session?.user?.id));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      resolve(session?.user?.id),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state, hydrated]);

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
            return { storeId, storeName, items: [withId], owner: owner.current };
          }
          return { storeId, storeName, items: [...prev.items, withId], owner: owner.current };
        });
      },
      remove: (line_id: string) =>
        setState((prev) => {
          const items = prev.items.filter((i) => i.line_id !== line_id);
          return items.length ? { ...prev, items } : { ...empty, owner: owner.current };
        }),
      setQty: (line_id: string, qty: number) =>
        setState((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.line_id === line_id ? { ...i, quantity: Math.max(1, qty) } : i)),
        })),
      clear: () => setState({ ...empty, owner: owner.current }),
    };
  }, [state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useCart = () => useContext(Ctx);
