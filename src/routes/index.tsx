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
import { EmptyState, CardSkeleton } from "@/components/ui-states";
import { useAuth } from "@/hooks/use-auth";
import { primaryRole } from "@/lib/profile";
import {
  Search, Store as StoreIcon, Timer, Truck, Pizza, Sandwich, IceCream,
  Beef, Salad, CupSoda, Pill, ShoppingBasket, MapPin, LayoutDashboard, Bike, Shield, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QuintanaFood — Delivery de comida na sua cidade" },
      { name: "description", content: "Escolha entre as lojas online agora e receba seu pedido em casa com pagamento pelo app ou na entrega." },
      { property: "og:title", content: "QuintanaFood — Delivery de comida na sua cidade" },
      { property: "og:description", content: "Escolha entre as lojas online agora e receba seu pedido em casa." },
    ],
  }),
  component: Home,
});

type Store = {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; logo_url: string | null; cover_url: string | null;
  delivery_fee: number; prep_time_min: number; is_online: boolean;
  min_order?: number | null;
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
  const { roles, loading: authLoading } = useAuth();
  const role = primaryRole(roles);
  const currentCity = useMemo(
    () => (cities ?? []).find((c) => c.id === cityId) ?? null,
    [cities, cityId],
  );

  useEffect(() => {
    if (!cityId) { setStores([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("stores")
      .select("id,name,slug,description,category,logo_url,cover_url,delivery_fee,prep_time_min,is_online,min_order")
      .eq("is_online", true)
      .eq("city_id", cityId)
      .order("name")
      .then(({ data }) => { setStores((data ?? []) as Store[]); setLoading(false); });
  }, [cityId]);

  const filtered = useMemo(() => {
    const query = q.toLowerCase().trim();
    return stores.filter((s) => {
      const matchesQ = (s.name + " " + (s.category ?? "") + " " + (s.description ?? "")).toLowerCase().includes(query);
      const matchesCat = cat === "Todos" || (s.category ?? "").toLowerCase().includes(cat.toLowerCase());
      return matchesQ && matchesCat;
    });
  }, [stores, q, cat]);

  // Perfis operacionais não veem o catálogo do cliente.
  if (!authLoading && role !== "customer") {
    const panel =
      role === "merchant"
        ? { to: "/lojista" as const, label: "Painel do lojista", icon: LayoutDashboard, desc: "Gerencie pedidos, produtos e financeiro da sua loja." }
        : role === "courier"
          ? { to: "/entregador" as const, label: "Painel do entregador", icon: Bike, desc: "Veja entregas disponíveis e acompanhe seus ganhos." }
          : { to: "/adm" as const, label: "Painel administrativo", icon: Shield, desc: "Gerencie usuários, lojas, entregadores e pedidos." };
    const Icon = panel.icon;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-16 text-center">
        <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-7" />
        </div>
        <h1 className="mt-4 text-xl font-bold">{panel.label}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{panel.desc}</p>
        <Button asChild className="mt-6">
          <Link to={panel.to}>Abrir painel <ArrowRight className="ml-1 size-4" /></Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-orange-500 py-10 text-primary-foreground sm:py-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(255,255,255,0.28),transparent_60%)]" />
        <div className="absolute -bottom-16 -right-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <div className="relative mx-auto max-w-6xl px-4">
          <Badge variant="secondary" className="mb-3 bg-white/15 text-primary-foreground hover:bg-white/20">
            🔥 Fome? A gente resolve.
          </Badge>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Comida boa, <span className="underline decoration-white/40 underline-offset-4">entregue rápido.</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-primary-foreground/90 sm:text-base">
            Explore as lojas online agora na sua região.
          </p>
          {currentCity && (cities?.length ?? 0) >= 2 && (
            <button
              type="button"
              onClick={() => pick("")}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-white/25"
            >
              <MapPin className="size-3.5" /> {currentCity.name} / {currentCity.state} · trocar
            </button>
          )}
          <div className="mt-5 flex items-center gap-1 rounded-2xl bg-background/95 p-1.5 shadow-lg shadow-black/10">
            <Search className="ml-2 size-4 shrink-0 text-muted-foreground" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar loja, prato ou categoria"
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            {q && (
              <Button size="sm" variant="ghost" className="rounded-xl text-muted-foreground" onClick={() => setQ("")}>
                Limpar
              </Button>
            )}
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
                className={`flex w-20 shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-3 text-xs transition-all active:scale-95 ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30"
                    : "bg-card hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <Icon className="size-5" />
                <span className="truncate font-medium">{key}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold tracking-tight">Lojas online agora</h2>
            <p className="truncate text-xs text-muted-foreground">{cat === "Todos" ? "Todas as categorias" : cat}</p>
          </div>
          {!loading && <Badge variant="secondary" className="tabular-nums">{filtered.length}</Badge>}
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<StoreIcon className="size-6" />}
            title={q || cat !== "Todos" ? "Nenhuma loja encontrada" : "Nenhuma loja online agora"}
            description={q || cat !== "Todos"
              ? "Tente buscar por outro nome ou escolher outra categoria."
              : "As lojas da sua cidade ainda não abriram. Volte em alguns minutos."}
            action={(q || cat !== "Todos") && (
              <Button variant="outline" size="sm" onClick={() => { setQ(""); setCat("Todos"); }}>Limpar filtros</Button>
            )}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Link key={s.id} to="/loja/$slug" params={{ slug: s.slug }} className="group focus-visible:outline-none">
                <Card className="h-full overflow-hidden p-0 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-orange-200 to-orange-400">
                    {s.cover_url && (
                      <img
                        src={s.cover_url}
                        alt={`Capa da loja ${s.name}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    )}
                    <Badge className="absolute right-2 top-2 bg-success text-success-foreground shadow-sm">Aberto</Badge>
                  </div>
                  <div className="flex gap-3 px-3 pb-3">
                    <div className="relative z-10 -mt-8 size-16 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-md">
                      {s.logo_url ? (
                        <img src={s.logo_url} alt={`Logo ${s.name}`} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <div className="grid h-full w-full place-items-center text-primary"><StoreIcon className="size-5" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-2">
                      <div className="truncate font-semibold leading-tight transition-colors group-hover:text-primary">{s.name}</div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.category ?? "Restaurante"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <StoreRating storeId={s.id} compact />
                        <span className="inline-flex items-center gap-1"><Timer className="size-3 shrink-0" /> {s.prep_time_min} min</span>
                        <span className="inline-flex items-center gap-1">
                          <Truck className="size-3 shrink-0" />
                          {Number(s.delivery_fee) > 0
                            ? brl(Number(s.delivery_fee))
                            : <span className="font-semibold text-success">Grátis</span>}
                        </span>
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
