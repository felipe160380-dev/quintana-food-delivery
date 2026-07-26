import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { brl, orderStatusLabel } from "@/lib/format";
import { ClipboardList, ChevronRight, Store as StoreIcon } from "lucide-react";
import { EmptyState, RowSkeleton } from "@/components/ui-states";

export const Route = createFileRoute("/_authenticated/pedidos/")({ component: Page });

type Order = { id: string; total: number; status: string; created_at: string; store: { name: string; logo_url: string | null } | null };

const OPEN_STATUSES = ["pending", "accepted", "preparing", "ready", "out_for_delivery"];

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { setLoading(false); return; }
      const { data: rows } = await supabase.from("orders")
        .select("id,total,status,created_at, store:stores(name,logo_url)")
        .eq("customer_id", data.user.id)
        .order("created_at", { ascending: false });
      setOrders((rows ?? []) as any);
      setLoading(false);
    });
  }, []);

  const active = orders.filter((o) => OPEN_STATUSES.includes(o.status));
  const past = orders.filter((o) => !OPEN_STATUSES.includes(o.status));

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">Meus pedidos</h1>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}</div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title="Você ainda não fez pedidos"
          description="Quando você pedir, o acompanhamento em tempo real aparece aqui."
          action={<Button asChild><Link to="/"><StoreIcon className="mr-1.5 size-4" /> Ver lojas abertas</Link></Button>}
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Em andamento</h2>
              <div className="space-y-3">{active.map((o) => <OrderRow key={o.id} o={o} highlight />)}</div>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Histórico</h2>
              <div className="space-y-3">{past.map((o) => <OrderRow key={o.id} o={o} />)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function OrderRow({ o, highlight }: { o: Order; highlight?: boolean }) {
  return (
    <Link to="/pedidos/$id" params={{ id: o.id }} className="block focus-visible:outline-none">
      <Card
        className={`flex items-center gap-3 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
          highlight ? "border-primary/40" : ""
        }`}
      >
        <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {o.store?.logo_url
            ? <img src={o.store.logo_url} className="h-full w-full object-cover" alt="" loading="lazy" />
            : <div className="grid h-full w-full place-items-center text-muted-foreground"><StoreIcon className="size-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{o.store?.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {new Date(o.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="mt-1.5">
            <Badge variant={o.status === "delivered" ? "secondary" : o.status === "cancelled" ? "destructive" : "default"}>
              {orderStatusLabel[o.status] ?? o.status}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-right">
          <span className="text-sm font-bold tabular-nums">{brl(Number(o.total))}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </Card>
    </Link>
  );
}
