import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { StoreRating } from "@/components/StoreRating";
import { useCurrentCity } from "@/hooks/use-current-city";
import { CityGate } from "@/components/CityGate";
import {
  Search, Store as StoreIcon, Timer, Truck, Pizza, Sandwich, IceCream,
  Beef, Salad, CupSoda, Pill, ShoppingBasket, MapPin,
} from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

type Store = {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; logo_url: string | null; cover_url: string | null;
  delivery_fee: number; prep_time_min: number; is_online: boolean;
};

const CATEGORIES = [
  { key: "Todos", icon: Salad },
  { key: "Pizza", icon: Pizza },
  { key: "Lanche", icon: Sandwich },
  { key: "Hambúrguer", icon: Beef },
  { key: "Sobremesa", icon: IceCream },
  { key: "Bebida", icon: CupSoda },
  { key: "Farmácia", icon: Pill },
  { key: "Mercado", icon: ShoppingBasket },
];

function Home() {
  const [stores, setStores] = useState<Store[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const { cityId, cities, needsPick, pick } = useCurrentCity();
  const currentCity = useMemo(
    () => (cities ?? []).find((c) => c.id === cityId) ?? null,
    [cities, cityId],
  );

  useEffect(() => {
    if (!cityId) { setStores([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("stores")
      .select("id,name,slug,description,category,logo_url,cover_url,delivery_fee,prep_time_min,is_online")
      .eq("is_online", true)
      .eq("city_id", cityId)
      .order("name")
      .then(({ data }) => { setStores((data ?? []) as Store[]); setLoading(false); });
  }, [cityId]);


  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return stores.filter((s) => {
      const matchesQ = (s.name + " " + (s.category ?? "") + " " + (s.description ?? "")).toLowerCase().includes(query);
      const matchesCat = cat === "Todos" || (s.category ?? "").toLowerCase().includes(cat.toLowerCase());
      return matchesQ && matchesCat;
    });
  }, [stores, q, cat]);

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-orange-500 py-12 text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(255,255,255,0.28),transparent_60%)]" />
        <div className="absolute -right-16 -bottom-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-4">
          <Badge variant="secondary" className="mb-3 bg-white/15 text-primary-foreground hover:bg-white/20">
            🔥 Fome? A gente resolve.
          </Badge>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Comida boa, <span className="underline decoration-white/40 underline-offset-4">entregue rápido.</span>
          </h1>
          <p className="mt-2 max-w-lg text-primary-foreground/90">
            Explore as lojas online agora na sua região.
          </p>
          {currentCity && (cities?.length ?? 0) >= 2 && (
            <button
              type="button"
              onClick={() => pick("")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-white/25"
            >
              <MapPin className="size-3.5" /> {currentCity.name} / {currentCity.state} · trocar
            </button>
          )}
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-background/95 p-1.5 shadow-lg shadow-black/10">
            <Search className="ml-2 size-4 text-muted-foreground" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar loja, prato ou categoria"
              className="border-0 shadow-none focus-visible:ring-0"
            />
            <Button size="sm" className="rounded-xl">Buscar</Button>
          </div>
        </div>
      </section>

      <CityGate open={needsPick || (cityId === null && (cities?.length ?? 0) > 1)} cities={cities ?? []} onPick={pick} />

      <section className="mx-auto max-w-6xl px-4 pt-6">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CATEGORIES.map(({ key, icon: Icon }) => {
            const active = cat === key;
            return (
              <button
                key={key}
                onClick={() => setCat(key)}
                className={`flex shrink-0 flex-col items-center gap-1 rounded-2xl border px-4 py-3 text-xs transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "bg-card hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <Icon className="size-5" />
                <span className="font-medium">{key}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Lojas online agora</h2>
            <p className="text-xs text-muted-foreground">{cat === "Todos" ? "Todas as categorias" : cat}</p>
          </div>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-40 animate-pulse bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Link key={s.id} to="/loja/$slug" params={{ slug: s.slug }} className="group">
                <Card className="overflow-hidden transition hover:-translate-y-0.5 hover:shadow-xl">
                  <div className="relative h-28 w-full bg-gradient-to-br from-orange-200 to-orange-400">
                    {s.cover_url && <img src={s.cover_url} alt="" className="h-full w-full object-cover" />}
                    <Badge className="absolute right-2 top-2 bg-success text-success-foreground">Aberto</Badge>
                  </div>
                  <div className="flex gap-3 p-3">
                    <div className="-mt-8 size-14 shrink-0 overflow-hidden rounded-xl border-4 border-background bg-muted shadow">
                      {s.logo_url ? (
                        <img src={s.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-primary"><StoreIcon className="size-5" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold group-hover:text-primary">{s.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{s.category ?? "Restaurante"}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <StoreRating storeId={s.id} compact />
                        <span className="inline-flex items-center gap-1"><Timer className="size-3" /> {s.prep_time_min} min</span>
                        <span className="inline-flex items-center gap-1"><Truck className="size-3" /> {s.delivery_fee > 0 ? brl(Number(s.delivery_fee)) : "Grátis"}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function EmptyState() {
  return (
    <Card className="p-10 text-center">
      <StoreIcon className="mx-auto mb-2 size-10 text-muted-foreground" />
      <div className="font-semibold">Nenhuma loja encontrada</div>
      <p className="mt-1 text-sm text-muted-foreground">Tente outra categoria ou busca.</p>
    </Card>
  );
}

