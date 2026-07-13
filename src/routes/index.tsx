import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { brl } from "@/lib/format";
import { Search, Store as StoreIcon, Timer, Truck } from "lucide-react";

export const Route = createFileRoute("/")({ component: Home });

type Store = {
  id: string; name: string; slug: string; description: string | null;
  category: string | null; logo_url: string | null; cover_url: string | null;
  delivery_fee: number; prep_time_min: number; is_online: boolean;
};

function Home() {
  const [stores, setStores] = useState<Store[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("stores")
      .select("id,name,slug,description,category,logo_url,cover_url,delivery_fee,prep_time_min,is_online")
      .eq("is_online", true)
      .order("name")
      .then(({ data }) => { setStores((data ?? []) as Store[]); setLoading(false); });
  }, []);

  const filtered = useMemo(
    () => stores.filter((s) => (s.name + " " + (s.category ?? "") + " " + (s.description ?? "")).toLowerCase().includes(q.toLowerCase())),
    [stores, q]
  );

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-orange-500 py-10 text-primary-foreground">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(255,255,255,0.25),transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-4">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Comida boa, entregue rápido.</h1>
          <p className="mt-1 max-w-md text-primary-foreground/90">Explore as lojas online agora na Quintana Food.</p>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-background/95 p-1.5 shadow-lg shadow-black/10">
            <Search className="ml-2 size-4 text-muted-foreground" />
            <Input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar loja, prato ou categoria"
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Lojas online agora</h2>
          <Badge variant="secondary">{filtered.length}</Badge>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <Link key={s.id} to="/loja/$slug" params={{ slug: s.slug }} className="group">
                <Card className="overflow-hidden transition hover:shadow-lg">
                  <div className="relative h-24 w-full bg-gradient-to-br from-orange-200 to-orange-400">
                    {s.cover_url && <img src={s.cover_url} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex gap-3 p-3">
                    <div className="-mt-8 size-14 shrink-0 overflow-hidden rounded-xl border-4 border-background bg-muted">
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
    <Card className="p-8 text-center">
      <StoreIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
      <div className="font-semibold">Nenhuma loja online agora</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Você é lojista? <Link to="/tornar-se-lojista" className="text-primary underline">Cadastre sua loja</Link> e comece a receber pedidos.
      </p>
    </Card>
  );
}
