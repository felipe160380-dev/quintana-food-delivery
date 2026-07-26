import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useCart, type CartAddon } from "@/lib/cart";
import { Store as StoreIcon, Timer, Truck, ArrowLeft, Plus, Minus, ShoppingBag, Share2, Heart, Clock, Receipt, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { StoreRating } from "@/components/StoreRating";
import { EmptyState } from "@/components/ui-states";
import { isFavorite, toggleFavorite } from "@/lib/favorites";
import { useAuth } from "@/hooks/use-auth";
import { primaryRole } from "@/lib/profile";

export const Route = createFileRoute("/loja/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase.from("stores").select("*").eq("slug", params.slug).eq("is_online", true).maybeSingle();
    if (!data) throw notFound();
    return { store: data };
  },
  component: StorePage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <StoreIcon className="size-6" />
      </div>
      <h1 className="mt-4 text-lg font-bold">Loja não encontrada ou fechada</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Ela pode ter saído do ar. Veja outras lojas abertas agora.</p>
      <Button asChild className="mt-6"><Link to="/">Ver lojas abertas</Link></Button>
    </div>
  ),
});

type Product = { id: string; name: string; description: string | null; price: number; promo_price: number | null; image_url: string | null; category: string | null; is_available: boolean; is_paused: boolean; stock: number | null };

type Hours = Record<string, { open: string; close: string; closed?: boolean }>;

/** Rótulo do horário de hoje (somente exibição). */
function todayHoursLabel(hours: unknown): string | null {
  if (!hours || typeof hours !== "object") return null;
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const day = (hours as Hours)[keys[new Date().getDay()]];
  if (!day) return null;
  if (day.closed) return "Fechado hoje";
  if (!day.open || !day.close) return null;
  return `Hoje ${day.open}–${day.close}`;
}


function StorePage() {
  const { store } = Route.useLoaderData();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Product | null>(null);
  const [fav, setFav] = useState(false);
  const { add, count } = useCart();
  const { roles } = useAuth();
  const shopper = primaryRole(roles) === "customer";
  const hoursToday = todayHoursLabel(store.hours);


  useEffect(() => { setFav(isFavorite(store.id)); }, [store.id]);

  useEffect(() => {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("products").select("*").eq("store_id", store.id).eq("is_available", true).eq("is_paused", false).order("category").order("sort_order")
      .then(({ data }: { data: Product[] | null }) => {
        setProducts((data ?? []).filter((p) => p.stock == null || p.stock > 0));
        setLoading(false);
      });
  }, [store.id]);

  const byCategory: Record<string, Product[]> = {};
  for (const p of products) {
    const k = p.category ?? "Outros";
    (byCategory[k] ||= []).push(p);
  }

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) await navigator.share({ title: store.name, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copiado!"); }
    } catch { /* cancelado */ }
  };

  return (
    <div className="pb-28">
      {/* Banner */}
      <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-orange-300 to-primary sm:h-48">
        {store.cover_url && <img src={store.cover_url} alt={`Capa da loja ${store.name}`} className="h-full w-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-black/10" />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <Button asChild variant="secondary" size="sm" className="shadow-sm">
            <Link to="/"><ArrowLeft className="mr-1 size-4" /> Voltar</Link>
          </Button>
          <div className="flex gap-2">
            <Button
              variant="secondary" size="icon" className="size-9 shadow-sm" aria-label="Compartilhar" onClick={share}
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              variant="secondary" size="icon" className="size-9 shadow-sm"
              aria-label={fav ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              onClick={() => setFav(toggleFavorite(store.id))}
            >
              <Heart className={`size-4 transition-colors ${fav ? "fill-primary text-primary" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Cabeçalho da loja — logo parcialmente sobre o banner, sem cortar */}
      <div className="mx-auto max-w-3xl px-4">
        <Card className="-mt-10 p-4 shadow-lg sm:-mt-12">
          <div className="flex items-start gap-4">
            <div className="-mt-12 size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-lg sm:-mt-14">
              {store.logo_url
                ? <img src={store.logo_url} className="h-full w-full object-cover" alt={`Logo ${store.name}`} />
                : <div className="grid h-full w-full place-items-center text-primary"><StoreIcon className="size-8" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="min-w-0 truncate text-xl font-bold leading-tight sm:text-2xl">{store.name}</h1>
                <Badge className={store.is_online ? "bg-success text-success-foreground" : ""} variant={store.is_online ? "default" : "secondary"}>
                  {store.is_online ? "Aberta" : "Fechada"}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{store.category ?? "Restaurante"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                <StoreRating storeId={store.id} />
                <span className="inline-flex items-center gap-1"><Timer className="size-3.5 shrink-0" /> {store.prep_time_min} min</span>
                <span className="inline-flex items-center gap-1">
                  <Truck className="size-3.5 shrink-0" />
                  {Number(store.delivery_fee) > 0 ? brl(Number(store.delivery_fee)) : <span className="font-semibold text-success">Entrega grátis</span>}
                </span>
                {Number(store.min_order) > 0 && (
                  <span className="inline-flex items-center gap-1"><Receipt className="size-3.5 shrink-0" /> Mín. {brl(Number(store.min_order))}</span>
                )}
                {hoursToday && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 shrink-0" /> {hoursToday}
                  </span>
                )}

              </div>
              {store.description && (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{store.description}</p>
              )}
            </div>
          </div>
        </Card>

        {/* Menu */}
        <div className="mt-6 space-y-7">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="flex items-center gap-3 p-3">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="size-24 animate-pulse rounded-xl bg-muted" />
                </Card>
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="size-6" />}
              title="Menu indisponível"
              description="Esta loja ainda não publicou produtos disponíveis."
            />
          ) : (
            Object.entries(byCategory).map(([cat, list]) => (
              <section key={cat}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{cat}</h2>
                <div className="space-y-3">
                  {list.map((p) => {
                    const promo = p.promo_price != null && Number(p.promo_price) < Number(p.price);
                    return (
                      <Card
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelected(p)}
                        onKeyDown={(e) => e.key === "Enter" && setSelected(p)}
                        className="group flex cursor-pointer items-stretch gap-3 overflow-hidden p-3 transition-all duration-200 hover:border-primary/40 hover:shadow-md active:scale-[0.995]"
                      >
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 font-semibold leading-snug">{p.name}</div>
                            {promo && <Badge className="shrink-0">Promoção</Badge>}
                          </div>
                          {p.description && (
                            <div className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.description}</div>
                          )}
                          <div className="mt-auto pt-2 text-base font-bold text-primary">
                            {promo ? (
                              <>
                                <span className="mr-1.5 text-xs font-medium text-muted-foreground line-through">{brl(Number(p.price))}</span>
                                {brl(Number(p.promo_price))}
                              </>
                            ) : brl(Number(p.price))}
                          </div>
                        </div>
                        <div className="relative shrink-0">
                          {p.image_url ? (
                            <img
                              src={p.image_url} alt={p.name} loading="lazy"
                              className="size-24 rounded-xl object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                            />
                          ) : (
                            <div className="grid size-24 place-items-center rounded-xl bg-muted text-muted-foreground">
                              <UtensilsCrossed className="size-6" />
                            </div>
                          )}
                          <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
                            <Plus className="size-4" />
                          </span>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))
          )}
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
              toast.success(`${selected.name} adicionado ao carrinho`);
              setSelected(null);
            }}
          />
        )}

        {shopper && count > 0 && (
          <div className="fixed inset-x-0 bottom-16 z-30 mx-auto max-w-md px-4 sm:bottom-4">
            <Button asChild className="w-full animate-fade-in shadow-xl" size="lg">
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
  const effectivePrice = Number(product.promo_price ?? product.price);
  const promo = product.promo_price != null && Number(product.promo_price) < Number(product.price);
  const total = (effectivePrice + addonsSum) * qty;

  const missing = addons.some((a) => a.is_required && !(picked[a.id] ?? 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-t-3xl bg-card p-4 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {product.image_url && (
          <img src={product.image_url} alt={product.name} className="mb-3 h-40 w-full rounded-2xl object-cover" />
        )}
        <div>
          <h3 className="text-lg font-bold leading-tight">{product.name}</h3>
          {product.description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{product.description}</p>}
          <div className="mt-2 text-lg font-bold text-primary">
            {promo ? (
              <>
                <span className="mr-1.5 text-xs font-medium text-muted-foreground line-through">{brl(Number(product.price))}</span>
                {brl(effectivePrice)}
              </>
            ) : brl(effectivePrice)}
          </div>
        </div>

        {addons.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Adicionais</div>
            <ul className="space-y-2">
              {addons.map((a) => (
                <li key={a.id} className="flex items-center gap-2 rounded-xl border p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {a.name}{a.is_required && <span className="ml-1 text-xs text-primary">(obrigatório)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">+ {brl(Number(a.price))}</div>
                  </div>
                  <Button size="icon" variant="outline" className="size-8 shrink-0" aria-label="Remover" onClick={() => dec(a)}><Minus className="size-3" /></Button>
                  <span className="w-5 text-center text-sm font-medium tabular-nums">{picked[a.id] ?? 0}</span>
                  <Button size="icon" variant="outline" className="size-8 shrink-0" aria-label="Adicionar" onClick={() => inc(a)}><Plus className="size-3" /></Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-4 space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações</div>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: tirar cebola, sem gelo…" rows={2} />
        </div>

        <div className="sticky bottom-0 mt-5 flex items-center gap-3 bg-card pt-2">
          <div className="flex items-center gap-1 rounded-full border p-1">
            <Button size="icon" variant="ghost" className="size-8 rounded-full" aria-label="Diminuir" onClick={() => setQty((q) => Math.max(1, q - 1))}><Minus className="size-3.5" /></Button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums">{qty}</span>
            <Button size="icon" variant="ghost" className="size-8 rounded-full" aria-label="Aumentar" onClick={() => setQty((q) => q + 1)}><Plus className="size-3.5" /></Button>
          </div>
          <Button className="flex-1" size="lg" disabled={missing} onClick={() => onAdd(qty, chosen, notes)}>
            {missing ? "Escolha os obrigatórios" : `Adicionar · ${brl(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
