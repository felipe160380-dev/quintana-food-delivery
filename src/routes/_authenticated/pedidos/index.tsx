import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { brl, orderStatusLabel } from "@/lib/format";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pedidos/")({ component: Page });

type Order = { id: string; total: number; status: string; created_at: string; store: { name: string; logo_url: string | null } | null };

function Page() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: rows } = await supabase.from("orders")
        .select("id,total,status,created_at, store:stores(name,logo_url)")
        .eq("customer_id", data.user.id)
        .order("created_at", { ascending: false });
      setOrders((rows ?? []) as any);
    });
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Meus pedidos</h1>
      {orders.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <ClipboardList className="mx-auto mb-2 size-8" />
          Você ainda não fez pedidos.
        </Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} to="/pedidos/$id" params={{ id: o.id }}>
              <Card className="flex items-center gap-3 p-3 hover:shadow">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {o.store?.logo_url && <img src={o.store.logo_url} className="h-full w-full object-cover" alt="" />}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{o.store?.name}</div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                </div>
                <div className="text-right">
                  <Badge variant={o.status === "delivered" ? "secondary" : o.status === "cancelled" ? "destructive" : "default"}>
                    {orderStatusLabel[o.status] ?? o.status}
                  </Badge>
                  <div className="mt-1 text-sm font-semibold">{brl(Number(o.total))}</div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
