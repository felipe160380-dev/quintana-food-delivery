import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/lib/cart";
import { Store as StoreIcon, Timer, Truck, ArrowLeft, Plus, ShoppingBag } from "lucide-react";
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

type Product = { id: string; name: string; description: string | null; price: number; image_url: string | null; category: string | null; is_available: boolean };

function StorePage() {
  const { store } = Route.useLoaderData();
  const [products, setProducts] = useState<Product[]>([]);
  const { add, count } = useCart();

  useEffect(() => {
    supabase.from("products").select("*").eq("store_id", store.id).eq("is_available", true).order("category").order("sort_order")
      .then(({ data }) => setProducts((data ?? []) as Product[]));
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
        <div className="-mt-8 flex items-start gap-4">
          <div className="size-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted shadow">
            {store.logo_url ? <img src={store.logo_url} className="h-full w-full object-cover" alt="" /> : <div className="grid h-full w-full place-items-center text-primary"><StoreIcon /></div>}
          </div>
          <div className="pt-8">
            <h1 className="text-xl font-bold">{store.name}</h1>
            <p className="text-sm text-muted-foreground">{store.category ?? "Restaurante"}</p>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
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
                      <div className="mt-1 font-semibold text-primary">{brl(Number(p.price))}</div>
                    </div>
                    {p.image_url && <img src={p.image_url} alt="" className="size-20 shrink-0 rounded-lg object-cover" />}
                    <Button
                      size="icon"
                      className="self-center"
                      onClick={() => {
                        add(store.id, store.name, {
                          product_id: p.id, product_name: p.name, unit_price: Number(p.price), quantity: 1, image_url: p.image_url,
                        });
                        toast.success(`${p.name} adicionado`);
                      }}
                    >
                      <Plus className="size-4" />
                    </Button>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>

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
