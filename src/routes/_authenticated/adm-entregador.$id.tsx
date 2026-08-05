import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowLeft, Bike } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/adm-entregador/$id")({
  component: CourierDetail,
  head: () => ({
    meta: [
      { title: "Detalhes do entregador — Admin MiPede" },
      { name: "description", content: "Cadastro, entregas concluídas e ganhos do entregador no painel administrativo do MiPede." },
      { property: "og:title", content: "Detalhes do entregador — Admin MiPede" },
      { property: "og:description", content: "Cadastro, entregas concluídas e ganhos do entregador no painel administrativo do MiPede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function isoStart(d: string) { return d ? new Date(`${d}T00:00:00`).toISOString() : null; }
function isoEnd(d: string) { return d ? new Date(`${d}T23:59:59.999`).toISOString() : null; }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addressText(snap: any): string {
  if (!snap) return "—";
  if (typeof snap === "string") return snap;
  const parts = [snap.street, snap.number, snap.neighborhood, snap.city, snap.state].filter(Boolean);
  return parts.length ? parts.join(", ") : (snap.address_line ?? "—");
}

const VEHICLES: Record<string, string> = { bike: "Bicicleta", motorcycle: "Moto", car: "Carro", foot: "A pé" };

function CourierDetail() {
  const { id } = Route.useParams();
  const { roles, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const isAdmin = roles.includes("admin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [courier, setCourier] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deliveries, setDeliveries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) { toast.error("Acesso restrito a administradores"); nav({ to: "/" }); }
  }, [authLoading, isAdmin, nav]);

  const loadCourier = async () => {
    const { data: c } = await sb.from("couriers").select("*").eq("id", id).maybeSingle();
    setCourier(c);
    const { data: p } = await sb.from("profiles").select("id, full_name, phone, created_at").eq("id", id).maybeSingle();
    setProfile(p);
    setLoading(false);
  };
  useEffect(() => { if (isAdmin) loadCourier(); }, [id, isAdmin]);

  const loadPeriod = async () => {
    const s = isoStart(from); const e = isoEnd(to);
    let dq = sb.from("orders").select("id, total, delivery_fee, address_snapshot, delivered_at, created_at, store_id")
      .eq("courier_id", id).eq("status", "delivered").order("delivered_at", { ascending: false }).limit(300);
    if (s) dq = dq.gte("delivered_at", s);
    if (e) dq = dq.lte("delivered_at", e);
    const { data: d } = await dq;
    setDeliveries(d ?? []);

    let eq2 = sb.from("courier_wallet_entries").select("id, kind, gross, fee, net, description, created_at")
      .eq("courier_id", id).order("created_at", { ascending: false }).limit(300);
    if (s) eq2 = eq2.gte("created_at", s);
    if (e) eq2 = eq2.lte("created_at", e);
    const { data: en } = await eq2;
    setEntries(en ?? []);

    let wq = sb.from("courier_withdrawals").select("id, amount, fee, net, pix_key, status, requested_at")
      .eq("courier_id", id).order("requested_at", { ascending: false }).limit(300);
    if (s) wq = wq.gte("requested_at", s);
    if (e) wq = wq.lte("requested_at", e);
    const { data: w } = await wq;
    setWithdrawals(w ?? []);
  };
  useEffect(() => { if (isAdmin) loadPeriod(); }, [id, isAdmin, from, to]);

  const report = useMemo(() => {
    const credits = entries.filter((e) => e.kind === "order_credit").reduce((s, e) => s + Number(e.net ?? 0), 0);
    const fees = entries.filter((e) => e.kind === "withdrawal_fee").reduce((s, e) => s + Math.abs(Number(e.net ?? 0)), 0);
    const paid = withdrawals.filter((w) => w.status === "paid").reduce((s, w) => s + Number(w.net ?? 0), 0);
    return { credits, fees, paid, count: deliveries.length };
  }, [entries, withdrawals, deliveries]);

  async function toggleSuspension() {
    const next = !courier.is_suspended;
    const { error } = await sb.from("couriers").update({ is_suspended: next, ...(next ? { is_available: false } : {}) }).eq("id", id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success(next ? "Entregador suspenso" : "Entregador reativado");
    loadCourier();
  }

  if (authLoading || loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return null;
  if (!courier) return <div className="p-10 text-center text-sm text-muted-foreground">Entregador não encontrado.</div>;

  return (
    <div className="container mx-auto max-w-4xl p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/adm"><ArrowLeft className="mr-1 size-4" /> Voltar</Link></Button>
      </div>

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-center">
          {courier.photo_url ? (
            <img src={courier.photo_url} alt={`Foto de ${profile?.full_name ?? "entregador"}`} className="size-24 rounded-xl object-cover" />
          ) : (
            <div className="grid size-24 place-items-center rounded-xl bg-muted text-muted-foreground"><Bike className="size-8" /></div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{profile?.full_name ?? "Sem nome"}</h1>
            <p className="text-sm text-muted-foreground">{profile?.phone ?? "—"} · CPF {courier.document ?? "—"}</p>
            <p className="text-sm text-muted-foreground">{VEHICLES[courier.vehicle] ?? courier.vehicle ?? "—"} {courier.vehicle_plate ?? ""}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge>{courier.approval_status}</Badge>
              {courier.is_suspended && <Badge variant="destructive">Suspenso</Badge>}
              <Badge variant="secondary">{courier.is_available ? "Disponível" : "Indisponível"}</Badge>
            </div>
            {courier.approval_note && <p className="mt-2 text-xs text-destructive">Nota: {courier.approval_note}</p>}
          </div>
          {courier.approval_status === "approved" && (
            <Button variant={courier.is_suspended ? "default" : "destructive"} onClick={toggleSuspension}>
              {courier.is_suspended ? "Reativar" : "Suspender"}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Período</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="flex items-end"><Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>Limpar período</Button></div>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Entregas</div><div className="text-lg font-bold">{report.count}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Ganhos creditados</div><div className="text-lg font-bold">{brl(report.credits)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Taxas de saque</div><div className="text-lg font-bold">{brl(report.fees)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Saques pagos</div><div className="text-lg font-bold">{brl(report.paid)}</div></CardContent></Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Entregas concluídas</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {deliveries.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrega no período.</p> : deliveries.map((o) => (
            <div key={o.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs">#{o.id.slice(0, 8)}</span>
                <span className="text-xs text-muted-foreground">{o.delivered_at ? new Date(o.delivered_at).toLocaleString("pt-BR") : new Date(o.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{addressText(o.address_snapshot)}</p>
              <p className="mt-1 text-xs">Pedido {brl(Number(o.total))} · Ganho da entrega {brl(Number(o.delivery_fee ?? 0))}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Extrato da carteira</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {entries.length === 0 ? <p className="text-sm text-muted-foreground">Sem lançamentos no período.</p> : entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p>{e.description ?? e.kind}</p>
                <p className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")} · {e.kind}</p>
              </div>
              <span className={Number(e.net) < 0 ? "font-semibold text-destructive" : "font-semibold"}>{brl(Number(e.net))}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
