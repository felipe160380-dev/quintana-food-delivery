import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/adm-loja/$id")({
  component: StoreDetail,
  head: () => ({
    meta: [
      { title: "Detalhes da loja — Admin MiPede" },
      { name: "description", content: "Cadastro, taxa, pedidos e saques da loja no painel administrativo do MiPede." },
      { property: "og:title", content: "Detalhes da loja — Admin MiPede" },
      { property: "og:description", content: "Cadastro, taxa, pedidos e saques da loja no painel administrativo do MiPede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ORDER_STATUSES = ["all", "pending", "accepted", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"];
const WITHDRAWAL_STATUSES = ["all", "requested", "paid", "rejected"];

function isoStart(d: string) { return d ? new Date(`${d}T00:00:00`).toISOString() : null; }
function isoEnd(d: string) { return d ? new Date(`${d}T23:59:59.999`).toISOString() : null; }

function StoreDetail() {
  const { id } = Route.useParams();
  const { roles, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const isAdmin = roles.includes("admin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [store, setStore] = useState<any>(null);
  const [cities, setCities] = useState<{ id: string; name: string; state: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [form, setForm] = useState<any>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [orderStatus, setOrderStatus] = useState("all");
  const [wStatus, setWStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) { toast.error("Acesso restrito a administradores"); nav({ to: "/" }); }
  }, [authLoading, isAdmin, nav]);

  const loadStore = async () => {
    const { data } = await sb.from("stores").select("*").eq("id", id).maybeSingle();
    setStore(data);
    if (data) {
      setForm({
        name: data.name ?? "", description: data.description ?? "", category: data.category ?? "",
        city_id: data.city_id ?? "", cnpj: data.cnpj ?? "", phone: data.phone ?? "", whatsapp: data.whatsapp ?? "",
        address_line: data.address_line ?? "", platform_fee_pct: String(data.platform_fee_pct ?? 10),
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadStore();
    sb.from("cities").select("id,name,state").order("name").then(({ data }: { data: never[] | null }) => setCities((data ?? []) as never[]));
  }, [id, isAdmin]);

  const loadOrders = async () => {
    let q = sb.from("orders").select("id, status, total, subtotal, payment_method, payment_status, created_at")
      .eq("store_id", id).order("created_at", { ascending: false }).limit(300);
    if (orderStatus !== "all") q = q.eq("status", orderStatus);
    const s = isoStart(from); const e = isoEnd(to);
    if (s) q = q.gte("created_at", s);
    if (e) q = q.lte("created_at", e);
    const { data } = await q;
    setOrders(data ?? []);
  };

  const loadWithdrawals = async () => {
    let q = sb.from("store_withdrawals").select("id, amount, fee, net, pix_key, status, requested_at, processed_at, note")
      .eq("store_id", id).order("requested_at", { ascending: false }).limit(300);
    if (wStatus !== "all") q = q.eq("status", wStatus);
    const s = isoStart(from); const e = isoEnd(to);
    if (s) q = q.gte("requested_at", s);
    if (e) q = q.lte("requested_at", e);
    const { data } = await q;
    setWithdrawals(data ?? []);
  };

  useEffect(() => { if (isAdmin) loadOrders(); }, [id, isAdmin, orderStatus, from, to]);
  useEffect(() => { if (isAdmin) loadWithdrawals(); }, [id, isAdmin, wStatus, from, to]);

  const report = useMemo(() => {
    const valid = orders.filter((o) => o.status !== "cancelled");
    const total = valid.reduce((s, o) => s + Number(o.total ?? 0), 0);
    return { total, count: valid.length, avg: valid.length ? total / valid.length : 0, cancelled: orders.length - valid.length };
  }, [orders]);

  async function save() {
    const pct = Number(form.platform_fee_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return toast.error("A taxa da plataforma deve ficar entre 0 e 100.");
    const digits = String(form.cnpj ?? "").replace(/\D/g, "");
    if (digits && digits.length !== 14) return toast.error("CNPJ deve ter exatamente 14 dígitos numéricos.");
    setSaving(true);
    const { error } = await sb.from("stores").update({
      name: form.name, description: form.description, category: form.category,
      city_id: form.city_id || null, cnpj: form.cnpj || null, phone: form.phone || null,
      whatsapp: form.whatsapp || null, address_line: form.address_line || null,
      platform_fee_pct: pct,
    }).eq("id", id);
    setSaving(false);
    if (error) { console.error(error); return toast.error("Não foi possível salvar. Tente novamente."); }
    toast.success("Dados da loja atualizados");
    loadStore();
  }

  if (authLoading || loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return null;
  if (!store) return <div className="p-10 text-center text-sm text-muted-foreground">Loja não encontrada.</div>;
  if (!form) return null;

  return (
    <div className="container mx-auto max-w-4xl p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/adm"><ArrowLeft className="mr-1 size-4" /> Voltar</Link></Button>
      </div>
      <h1 className="text-xl font-bold">{store.name}</h1>
      <p className="mb-4 text-xs text-muted-foreground">/{store.slug} · {store.approval_status} · {store.is_online ? "Online" : "Offline"}</p>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Cadastro da loja</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Select value={form.city_id} onValueChange={(v) => setForm({ ...form, city_id: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{cities.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} / {c.state}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
          <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Endereço</Label><Input value={form.address_line} onChange={(e) => setForm({ ...form, address_line: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
            <Label>Taxa da plataforma desta loja (%)</Label>
            <Input type="number" min={0} max={100} step="0.1" value={form.platform_fee_pct} onChange={(e) => setForm({ ...form, platform_fee_pct: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Percentual cobrado sobre cada pedido desta loja especificamente — pode ser diferente da taxa aplicada às outras lojas. Aceita valores de 0 a 100.
            </p>
          </div>
          <div className="sm:col-span-2">
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar alterações"}</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Período do relatório</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="flex items-end"><Button variant="outline" onClick={() => { setFrom(""); setTo(""); }}>Limpar período</Button></div>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total vendido</div><div className="text-lg font-bold">{brl(report.total)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Pedidos</div><div className="text-lg font-bold">{report.count}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Ticket médio</div><div className="text-lg font-bold">{brl(report.avg)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Cancelados</div><div className="text-lg font-bold">{report.cancelled}</div></CardContent></Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Pedidos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {ORDER_STATUSES.map((s) => (
              <Button key={s} size="sm" variant={orderStatus === s ? "default" : "outline"} onClick={() => setOrderStatus(s)}>{s === "all" ? "Todos" : s}</Button>
            ))}
          </div>
          {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido no período.</p> : orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-mono text-xs">#{o.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")} · {o.payment_method} · {o.payment_status}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>
                <span className="font-semibold">{brl(Number(o.total))}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Saques</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {WITHDRAWAL_STATUSES.map((s) => (
              <Button key={s} size="sm" variant={wStatus === s ? "default" : "outline"} onClick={() => setWStatus(s)}>{s === "all" ? "Todos" : s}</Button>
            ))}
          </div>
          {withdrawals.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum saque no período.</p> : withdrawals.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-semibold">{brl(Number(w.net))} <span className="text-xs font-normal text-muted-foreground">(bruto {brl(Number(w.amount))}, taxa {brl(Number(w.fee))})</span></p>
                <p className="text-xs text-muted-foreground">PIX: {w.pix_key} · {new Date(w.requested_at).toLocaleString("pt-BR")}</p>
              </div>
              <Badge>{w.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
