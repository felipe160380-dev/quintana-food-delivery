import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useCart, type CartAddon } from "@/lib/cart";
import { Store as StoreIcon, Timer, Truck, ArrowLeft, Plus, Minus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { StoreRating } from "@/components/StoreRating";

export const Route = createFileRoute("/loja/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase.from("stores").select("*").eq("slug", params.slug).eq("is_online", true).maybeSingle();
    if (!data) throw notFound();
    return { store: data };
  },
  component: StorePage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-10 text-center">
      <StoreIcon className="mx-auto size-8 text-muted-foreground" />
      <h1 className="mt-2 text-xl font-semibold">Loja não encontrada ou offline</h1>
      <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">Voltar</Link>
    </div>
  ),
});

type Product = { id: string; name: string; description: string | null; price: number; promo_price: number | null; image_url: string | null; category: string | null; is_available: boolean; is_paused: boolean; stock: number | null };

function StorePage() {
  const { store } = Route.useLoaderData();
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const { add, count } = useCart();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("products").select("*").eq("store_id", store.id).eq("is_available", true).eq("is_paused", false).order("category").order("sort_order")
      .then(({ data }: { data: Product[] | null }) => setProducts((data ?? []).filter((p) => p.stock == null || p.stock > 0)));
  }, [store.id]);

  const byCategory: Record<string, Product[]> = {};
  for (const p of products) {
    const k = p.category ?? "Outros";
    (byCategory[k] ||= []).push(p);
  }

  return (
    <div>
      <div className="relative h-40 w-full bg-gradient-to-br from-orange-300 to-primary">
        {store.cover_url && <img src={store.cover_url} alt="" className="h-full w-full object-cover" />}
        <Button asChild variant="secondary" size="sm" className="absolute left-3 top-3">
          <Link to="/"><ArrowLeft className="mr-1 size-4" /> Voltar</Link>
        </Button>
      </div>
      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-12 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4">
          <div className="size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-lg">
            {store.logo_url ? <img src={store.logo_url} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full w-full place-items-center text-primary"><StoreIcon /></div>}
          </div>
          <div className="min-w-0 flex-1 pt-1 sm:pb-2">
            <h1 className="text-xl font-bold">{store.name}</h1>
            <p className="text-sm text-muted-foreground">{store.category ?? "Restaurante"}</p>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <StoreRating storeId={store.id} />
              <span className="inline-flex items-center gap-1"><Timer className="size-3" /> {store.prep_time_min} min</span>
              <span className="inline-flex items-center gap-1"><Truck className="size-3" /> {Number(store.delivery_fee) > 0 ? brl(Number(store.delivery_fee)) : "Grátis"}</span>
              {Number(store.min_order) > 0 && <span>Pedido mín. {brl(Number(store.min_order))}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {store.accepts_pix && <Badge variant="secondary">Pix</Badge>}
              {store.accepts_card_online && <Badge variant="secondary">Cartão</Badge>}
              {store.accepts_cash && <Badge variant="secondary">Dinheiro</Badge>}
              {store.accepts_card_on_delivery && <Badge variant="secondary">Cartão na entrega</Badge>}
            </div>
          </div>
        </div>

        {store.description && <p className="mt-4 text-sm text-muted-foreground">{store.description}</p>}

        <div className="mt-6 space-y-6 pb-24">
          {Object.entries(byCategory).map(([cat, list]) => (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
              <div className="space-y-2">
                {list.map((p) => (
                  <Card key={p.id} className="flex gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.name}</div>
                      {p.description && <div className="line-clamp-2 text-sm text-muted-foreground">{p.description}</div>}
                      <div className="mt-1 font-semibold text-primary">
                        {p.promo_price ? <><span className="mr-1 text-xs text-muted-foreground line-through">{brl(Number(p.price))}</span>{brl(Number(p.promo_price))}</> : brl(Number(p.price))}
                      </div>
                    </div>
                    {p.image_url && <img src={p.image_url} alt="" className="size-20 shrink-0 rounded-lg object-cover" />}
                    <Button
                      size="icon"
                      className="self-center"
                      onClick={() => setSelected(p)}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

        {selected && (
          <ProductDialog
            product={selected}
            onClose={() => setSelected(null)}
            onAdd={(qty, addons, notes) => {
              add(store.id, store.name, {
                product_id: selected.id, product_name: selected.name,
                unit_price: Number(selected.promo_price ?? selected.price), quantity: qty,
                image_url: selected.image_url, addons, notes,
              });
              toast.success(`${selected.name} adicionado`);
              setSelected(null);
            }}
          />
        )}

        {count > 0 && (
          <div className="fixed inset-x-0 bottom-3 z-30 mx-auto max-w-md px-4">
            <Button asChild className="w-full shadow-lg" size="lg">
              <Link to="/checkout"><ShoppingBag className="mr-2 size-4" /> Ver carrinho ({count})</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

type Addon = { id: string; name: string; price: number; is_required: boolean; max_qty: number };

function ProductDialog({
  product, onClose, onAdd,
}: {
  product: Product;
  onClose: () => void;
  onAdd: (qty: number, addons: CartAddon[], notes: string) => void;
}) {
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [addons, setAddons] = useState<Addon[]>([]);
  const [picked, setPicked] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.from("product_addons").select("*").eq("product_id", product.id).order("sort_order")
      .then(({ data }) => setAddons((data ?? []) as Addon[]));
  }, [product.id]);

  const inc = (a: Addon) => setPicked((p) => ({ ...p, [a.id]: Math.min(a.max_qty, (p[a.id] ?? 0) + 1) }));
  const dec = (a: Addon) => setPicked((p) => ({ ...p, [a.id]: Math.max(0, (p[a.id] ?? 0) - 1) }));

  const chosen: CartAddon[] = addons
    .filter((a) => (picked[a.id] ?? 0) > 0)
    .map((a) => ({ name: a.name, price: Number(a.price), quantity: picked[a.id]! }));

  const addonsSum = chosen.reduce((s, a) => s + a.price * a.quantity, 0);
  const total = (Number(product.price) + addonsSum) * qty;

  const missing = addons.some((a) => a.is_required && !(picked[a.id] ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2">
          <h3 className="text-lg font-bold">{product.name}</h3>
          {product.description && <p className="text-sm text-muted-foreground">{product.description}</p>}
          <div className="mt-1 font-semibold text-primary">{brl(Number(product.price))}</div>
        </div>

        {addons.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adicionais</div>
            <ul className="space-y-1">
              {addons.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-lg border p-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{a.name}{a.is_required && <span className="ml-1 text-xs text-primary">(obrigatório)</span>}</div>
                    <div className="text-xs text-muted-foreground">+ {brl(Number(a.price))}</div>
                  </div>
                  <Button size="icon" variant="outline" className="size-7" onClick={() => dec(a)}><Minus className="size-3" /></Button>
                  <span className="w-5 text-center text-sm">{picked[a.id] ?? 0}</span>
                  <Button size="icon" variant="outline" className="size-7" onClick={() => inc(a)}><Plus className="size-3" /></Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: tirar cebola, sem gelo…" rows={2} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" className="size-8" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="size-3" /></Button>
            <span className="w-8 text-center text-sm">{qty}</span>
            <Button size="icon" variant="outline" className="size-8" onClick={() => setQty((q) => q + 1)}><Plus className="size-3" /></Button>
          </div>
          <Button className="flex-1" disabled={missing} onClick={() => onAdd(qty, chosen, notes)}>
            {missing ? "Escolha os obrigatórios" : `Adicionar — ${brl(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

