import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { brl, orderStatusLabel } from "@/lib/format";
import { toast } from "sonner";
import { Bike, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/entregador/")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [available, setAvailable] = useState(false);
  const [ready, setReady] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);

  const [blocked, setBlocked] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!roles?.some((r) => r.role === "courier")) { setBlocked("Sua conta não é uma conta de entregador. Saia e entre novamente escolhendo Entregador."); return; }
    const { data: c } = await supabase.from("couriers").select("*").eq("id", u.user.id).maybeSingle();
    if (!c || c.approval_status !== "approved") {
      const st = c?.approval_status ?? "pending";
      const label = st === "in_review" ? "em análise pela nossa equipe" : st === "rejected" ? "recusado" : "aguardando aprovação do administrador";
      let msg = `Seu cadastro de entregador está ${label}.`;
      if (st === "rejected" && c?.approval_note) msg += ` Motivo: ${c.approval_note}`;
      setRejected(st === "rejected");
      setBlocked(msg); return;
    }
    setMe({ user: u.user, courier: c });
    setAvailable(!!c?.is_available);

    const { data: r } = await supabase.from("orders").select("*, store:stores(name,logo_url,address_line,latitude,longitude)").eq("status", "ready").is("courier_id", null).order("created_at");
    setReady(r ?? []);
    const { data: m } = await supabase.from("orders").select("*, store:stores(name,logo_url)").eq("courier_id", u.user.id).in("status", ["ready", "out_for_delivery"]).order("created_at");
    setMine(m ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("courier-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (blocked) return (
    <div className="mx-auto max-w-md p-10 text-center">
      <Bike className="mx-auto mb-2 size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{blocked}</p>
      {rejected && (
        <Button
          className="mt-4"
          onClick={async () => {
            const { error } = await supabase.rpc("courier_resubmit");
            if (error) return toast.error(error.message);
            toast.success("Cadastro reenviado. Aguarde nova análise.");
            setRejected(false);
            load();
          }}
        >Reenviar cadastro para nova análise</Button>
      )}
      <Button variant="outline" className="mt-2 ml-2" onClick={() => nav({ to: "/auth" })}>Ir para login</Button>
    </div>
  );
  if (!me) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Entregas</h1>
          <p className="text-sm text-muted-foreground">Fique disponível para receber pedidos prontos.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <Bike className="size-4 text-primary" />
          <span className="text-sm">{available ? "Disponível" : "Indisponível"}</span>
          <Switch checked={available} onCheckedChange={async (v) => {
            await supabase.from("couriers").update({ is_available: v, last_seen_at: new Date().toISOString() }).eq("id", me.user.id);
            setAvailable(v);
          }} />
        </div>
      </div>

      {mine.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suas entregas ativas</h2>
          <div className="space-y-2">
            {mine.map((o) => (
              <OrderCard key={o.id} o={o} mine onUpdate={load} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pedidos prontos para retirada</h2>
        {!available ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Ative a disponibilidade para ver pedidos prontos.</Card>
        ) : ready.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground"><Package className="mx-auto mb-2 size-6" /> Nenhum pedido pronto no momento.</Card>
        ) : (
          <div className="space-y-2">
            {ready.map((o) => <OrderCard key={o.id} o={o} onUpdate={load} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderCard({ o, mine, onUpdate }: { o: any; mine?: boolean; onUpdate: () => void }) {
  const [code, setCode] = useState("");
  const addr = o.address_snapshot ?? {};
  const accept = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("orders").update({ courier_id: u.user.id, status: "out_for_delivery" }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Entrega aceita!");
    onUpdate();
  };
  const confirmDeliver = async () => {
    if (code.length !== 4) return toast.error("Informe o código de 4 dígitos do cliente");
    let lat: number | null = null, lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 }));
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch {}
    const { error } = await supabase.rpc("confirm_delivery", { _order_id: o.id, _code: code, _lat: lat ?? 0, _lng: lng ?? 0 });
    if (error) return toast.error(error.message);
    toast.success("Entrega confirmada!");
    setCode("");
    onUpdate();
  };

  return (
    <Card className="p-3">
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {o.store?.logo_url && <img src={o.store.logo_url} className="h-full w-full object-cover" alt="" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2"><div className="font-medium">{o.store?.name}</div><Badge>{orderStatusLabel[o.status]}</Badge></div>
          <div className="text-xs text-muted-foreground">Retirar: {o.store?.address_line ?? "—"}</div>
          <div className="text-xs text-muted-foreground">Entregar: {addr.street}{addr.number ? `, ${addr.number}` : ""}</div>
          <div className="mt-1 text-sm font-semibold">{brl(Number(o.total))}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button asChild size="sm" variant="outline"><Link to="/pedidos/$id" params={{ id: o.id }}>Abrir</Link></Button>
          {!mine && <Button size="sm" onClick={accept}>Aceitar</Button>}
        </div>
      </div>
      {mine && o.status === "out_for_delivery" && (
        <div className="mt-3 flex items-center gap-2 border-t pt-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="Código"
            inputMode="numeric"
            className="w-24 rounded-md border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest"
          />
          <Button size="sm" onClick={confirmDeliver}>Confirmar entrega</Button>
          <span className="text-xs text-muted-foreground">Peça ao cliente os 4 dígitos.</span>
        </div>
      )}
    </Card>
  );
}
