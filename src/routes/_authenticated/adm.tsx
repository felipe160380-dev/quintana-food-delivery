import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { adminRefundOrder } from "@/lib/admin.functions";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Store as StoreIcon, Users, Bike, ClipboardList, Wallet, MapPin, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { ExcelExport } from "@/components/ExcelExport";
import {
  brl,
  dateTimeBR,
  label as tr,
  orderNumber,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
  withdrawalStatusLabel,
} from "@/lib/format";

type AdmSearch = { tab?: string; q?: string; filtro?: string };

export const Route = createFileRoute("/_authenticated/adm")({
  validateSearch: (s: Record<string, unknown>): AdmSearch => ({
    ...(typeof s.tab === "string" ? { tab: s.tab } : {}),
    ...(typeof s.q === "string" ? { q: s.q } : {}),
    ...(typeof s.filtro === "string" ? { filtro: s.filtro } : {}),
  }),
  component: AdminPanel,
});

export type ApprovalStatus = "pending" | "in_review" | "approved" | "rejected";

type Courier = {
  id: string;
  document: string | null;
  vehicle: string | null;
  vehicle_plate: string | null;
  approval_status: ApprovalStatus;
  approval_note: string | null;
  is_suspended?: boolean | null;
  created_at: string;
  profile?: { full_name: string | null; phone: string | null } | null;
};

type StoreRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  is_online: boolean;
  city: string | null;
  city_id: string | null;
  cnpj: string | null;
  approval_status: ApprovalStatus;
  approval_note: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  status: string;
  total: number;
  payment_method: string;
  payment_status: string;
  customer_id: string;
  store_id: string;
  courier_id: string | null;
  created_at: string;
  customer_name?: string | null;
  store_name?: string | null;
  courier_name?: string | null;
};


type WithdrawalRow = {
  id: string;
  store_id: string;
  amount: number;
  fee: number;
  net: number;
  pix_key: string;
  status: string;
  requested_at: string;
  note: string | null;
};

type UserRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  roles: string[];
};

function AdminPanel() {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const isAdmin = roles.includes("admin");

  useEffect(() => {
    if (!loading && user && !isAdmin) {
      toast.error("Acesso restrito a administradores");
      navigate({ to: "/" });
    }
  }, [loading, user, isAdmin, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="container mx-auto max-w-6xl p-4 pb-24">
      <header className="flex items-center gap-3 mb-6">
        <ShieldCheck className="text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Painel Administrativo</h1>
          <p className="text-sm text-muted-foreground">MiPede — controle da plataforma</p>
        </div>
      </header>

      <Tabs
        value={search.tab ?? "dashboard"}
        onValueChange={(v) => navigate({ to: "/adm", search: v === "orders" ? { tab: v } : { tab: v } })}
      >
        <TabsList className="tabs-scroll mb-4 h-auto gap-1 p-1">
          <TabsTrigger value="dashboard">Visão</TabsTrigger>
          <TabsTrigger value="couriers"><Bike className="w-4 h-4 mr-1" />Entregadores</TabsTrigger>
          <TabsTrigger value="stores"><StoreIcon className="w-4 h-4 mr-1" />Lojas</TabsTrigger>
          <TabsTrigger value="orders"><ClipboardList className="w-4 h-4 mr-1" />Pedidos</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" />Usuários</TabsTrigger>
          <TabsTrigger value="withdrawals"><Wallet className="w-4 h-4 mr-1" />Saques</TabsTrigger>
          <TabsTrigger value="cities"><MapPin className="w-4 h-4 mr-1" />Cidades</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="couriers"><CouriersTab /></TabsContent>
        <TabsContent value="stores"><StoresTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="withdrawals"><WithdrawalsTab /></TabsContent>
        <TabsContent value="cities"><CitiesTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState({
    stores: 0, pendingStores: 0, couriers: 0, pendingCouriers: 0, orders: 0, todayOrders: 0,
    pendingWithdrawals: 0, inProgress: 0, doneToday: 0, cancelledToday: 0,
    revenueToday: 0, paidToday: 0, payPending: 0, refundedTotal: 0,
  });
  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const iso = today.toISOString();
      const [s, sp, c, cp, o, ot, w, ip, dt, ct, pt, pp, rf] = await Promise.all([
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("stores").select("id", { count: "exact", head: true }).in("approval_status", ["pending", "in_review"]),
        supabase.from("couriers").select("id", { count: "exact", head: true }),
        supabase.from("couriers").select("id", { count: "exact", head: true }).in("approval_status", ["pending", "in_review"]),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", iso),
        supabase.from("store_withdrawals").select("id", { count: "exact", head: true }).eq("status", "requested"),
        supabase.from("orders").select("id", { count: "exact", head: true }).in("status", ["accepted", "preparing", "ready", "out_for_delivery"]),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "delivered").gte("created_at", iso),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("created_at", iso),
        supabase.from("orders").select("total").eq("payment_status", "paid").gte("created_at", iso),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("payment_status", "pending"),
        supabase.from("orders").select("total").eq("payment_status", "refunded"),
      ]);
      const sum = (rows: any[] | null) => (rows ?? []).reduce((a, r) => a + Number(r.total ?? 0), 0);
      setStats({
        stores: s.count ?? 0,
        pendingStores: sp.count ?? 0,
        couriers: c.count ?? 0,
        pendingCouriers: cp.count ?? 0,
        orders: o.count ?? 0,
        todayOrders: ot.count ?? 0,
        pendingWithdrawals: w.count ?? 0,
        inProgress: ip.count ?? 0,
        doneToday: dt.count ?? 0,
        cancelledToday: ct.count ?? 0,
        revenueToday: sum(pt.data as any[]),
        paidToday: (pt.data ?? []).length,
        payPending: pp.count ?? 0,
        refundedTotal: sum(rf.data as any[]),
      });
    })();
  }, []);
  const brl = (v: number) => `R$ ${v.toFixed(2)}`;
  const kpis = [
    { label: "Pedidos hoje", value: stats.todayOrders },
    { label: "Pedidos em andamento", value: stats.inProgress },
    { label: "Concluídos hoje", value: stats.doneToday },
    { label: "Cancelados hoje", value: stats.cancelledToday, alert: stats.cancelledToday > 0 },
    { label: "Faturamento hoje", value: brl(stats.revenueToday) },
    { label: "Pagamentos aprovados hoje", value: stats.paidToday },
    { label: "Pagamentos pendentes", value: stats.payPending, alert: stats.payPending > 0 },
    { label: "Valores estornados", value: brl(stats.refundedTotal) },
    { label: "Lojas cadastradas", value: stats.stores },
    { label: "Lojas aguardando análise", value: stats.pendingStores, alert: stats.pendingStores > 0 },
    { label: "Entregadores", value: stats.couriers },
    { label: "Entregadores aguardando análise", value: stats.pendingCouriers, alert: stats.pendingCouriers > 0 },
    { label: "Pedidos totais", value: stats.orders },
    { label: "Saques a processar", value: stats.pendingWithdrawals, alert: stats.pendingWithdrawals > 0 },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {kpis.map((k) => (
        <Card key={k.label} className={k.alert ? "border-primary" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground font-normal">{k.label}</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{k.value}</p></CardContent>
        </Card>
      ))}
    </div>
  );
}

const STATUS_FILTERS: { key: ApprovalStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pendentes" },
  { key: "in_review", label: "Em análise" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Recusados" },
  { key: "all", label: "Todos" },
];

function ApprovalActions({
  status,
  onSet,
}: {
  status: ApprovalStatus;
  onSet: (next: ApprovalStatus, note?: string) => Promise<void> | void;
}) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function submitReject() {
    if (note.trim().length < 3) {
      toast.error("Informe o motivo da recusa (mínimo 3 caracteres).");
      return;
    }
    setSaving(true);
    await onSet("rejected", note.trim());
    setSaving(false);
    setRejectOpen(false);
    setNote("");
  }

  return (
    <div className="flex gap-2 flex-wrap">
      {status !== "in_review" && status !== "approved" && (
        <Button size="sm" variant="secondary" onClick={() => onSet("in_review")}>Em análise</Button>
      )}
      {status !== "approved" && (
        <Button size="sm" onClick={() => onSet("approved")}>Aprovar</Button>
      )}
      {status !== "rejected" && (
        <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>Recusar</Button>
      )}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Motivo da recusa</DialogTitle>
            <DialogDescription>Explique ao solicitante por que o cadastro foi recusado. Esta nota será registrada.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex.: documentação ilegível, dados divergentes..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            minLength={3}
            rows={4}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={saving}>Cancelar</Button>
            <Button variant="destructive" onClick={submitReject} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CouriersTab() {
  const [items, setItems] = useState<Courier[]>([]);
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    let q = supabase.from("couriers").select("id, document, vehicle, vehicle_plate, approval_status, approval_note, is_suspended, created_at").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("approval_status", filter);
    const { data } = await q;
    const rows = (data ?? []) as unknown as Courier[];
    if (rows.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", rows.map((r) => r.id));
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      rows.forEach((r) => (r.profile = map.get(r.id) ?? null));
    }
    setItems(rows);
    setLoading(false);
  }
  useEffect(() => { load(); }, [filter]);

  async function setStatus(id: string, next: ApprovalStatus, note?: string) {
    const patch: any = { approval_status: next, approval_note: next === "rejected" ? note ?? null : null };
    if (next === "approved") patch.approved_at = new Date().toISOString();
    const { error } = await supabase.from("couriers").update(patch).eq("id", id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Status atualizado");
    load();
  }

  async function toggleSuspension(c: Courier) {
    const next = !c.is_suspended;
    const patch: any = { is_suspended: next };
    if (next) patch.is_available = false;
    const { error } = await supabase.from("couriers").update(patch).eq("id", c.id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success(next ? "Entregador suspenso" : "Entregador reativado");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>{f.label}</Button>
        ))}
      </div>
      {loading && <Loader2 className="animate-spin" />}
      {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum entregador.</p>}
      <div className="space-y-2">
        {items.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="flex-1">
                <p className="font-semibold">
                  <Link to="/adm-entregador/$id" params={{ id: c.id }} className="hover:underline">
                    {c.profile?.full_name ?? "Sem nome"}
                  </Link>
                  <StatusBadge status={c.approval_status} />
                  {c.is_suspended && <Badge variant="destructive" className="ml-1">Suspenso</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.profile?.phone ?? "—"} · CPF {c.document ?? "—"} · {c.vehicle ?? "—"} {c.vehicle_plate ?? ""}
                </p>
                {c.approval_status === "rejected" && c.approval_note && (
                  <p className="text-xs text-destructive mt-1">Motivo: {c.approval_note}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <ApprovalActions status={c.approval_status} onSet={async (next, note) => { await setStatus(c.id, next, note); }} />
                <div className="flex gap-2">
                  {c.approval_status === "approved" && (
                    <Button size="sm" variant="outline" onClick={() => toggleSuspension(c)}>{c.is_suspended ? "Reativar" : "Suspender"}</Button>
                  )}
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/adm-entregador/$id" params={{ id: c.id }}>Detalhes</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

    </div>
  );
}

function StoresTab() {
  const [items, setItems] = useState<StoreRow[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<ApprovalStatus | "all">("pending");
  const [cityId, setCityId] = useState<string>("all");
  const [cities, setCities] = useState<CityRow[]>([]);
  useEffect(() => { load(); }, [filter, cityId]);
  useEffect(() => {
    supabase.from("cities").select("id,name,state,slug,is_active,created_at").order("name")
      .then(({ data }) => setCities((data ?? []) as CityRow[]));
  }, []);
  async function load() {
    let query = supabase.from("stores").select("id, name, slug, owner_id, is_online, city, city_id, cnpj, approval_status, approval_note, created_at").order("created_at", { ascending: false });
    if (filter !== "all") query = query.eq("approval_status", filter);
    if (cityId !== "all") query = query.eq("city_id", cityId);
    const { data } = await query;
    setItems((data ?? []) as StoreRow[]);
  }
  async function setStatus(id: string, next: ApprovalStatus, note?: string) {
    const patch: any = { approval_status: next, approval_note: next === "rejected" ? note ?? null : null };
    if (next === "approved") patch.approved_at = new Date().toISOString();
    if (next !== "approved") patch.is_online = false;
    const { error } = await supabase.from("stores").update(patch).eq("id", id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Status atualizado"); load();
  }
  async function toggle(s: StoreRow) {
    if (s.approval_status !== "approved") {
      toast.error("Só é possível ativar lojas aprovadas."); return;
    }
    const { error } = await supabase.from("stores").update({ is_online: !s.is_online }).eq("id", s.id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success(!s.is_online ? "Loja ativada" : "Loja desativada");
    load();
  }
  async function remove(s: StoreRow) {
    if (!confirm(`Arquivar a loja "${s.name}"? Ela sai do ar e deixa de aparecer para os clientes, mas todo o histórico (pedidos, pagamentos e avaliações) é preservado.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("archive_store", { _store_id: s.id });
    if (error) { console.error(error); return toast.error(error.message ?? "Não foi possível concluir. Tente novamente."); }
    toast.success("Loja arquivada — histórico preservado"); load();
  }
  const filtered = items.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.slug.includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <ExcelExport
        audience="admin"
        allowAllStores
        stores={items.map((s) => ({ id: s.id, name: s.name }))}
        title="Exportar Excel (loja ou plataforma)"
      />
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>{f.label}</Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Cidade:</span>
        <Button size="sm" variant={cityId === "all" ? "default" : "outline"} onClick={() => setCityId("all")}>Todas</Button>
        {cities.map((c) => (
          <Button key={c.id} size="sm" variant={cityId === c.id ? "default" : "outline"} onClick={() => setCityId(c.id)}>
            {c.name}/{c.state}
          </Button>
        ))}
      </div>
      <Input placeholder="Buscar loja..." value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div className="flex-1">
              <p className="font-semibold">
                <Link to="/adm-loja/$id" params={{ id: s.id }} className="hover:underline">{s.name}</Link>
                <StatusBadge status={s.approval_status} />{" "}
                {s.approval_status === "approved" && (
                  <Badge variant={s.is_online ? "default" : "secondary"}>{s.is_online ? "Online" : "Offline"}</Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">/{s.slug} · {s.city ?? "—"} · CNPJ {s.cnpj ?? "—"}</p>
              {s.approval_status === "rejected" && s.approval_note && (
                <p className="text-xs text-destructive mt-1">Motivo: {s.approval_note}</p>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <ApprovalActions status={s.approval_status} onSet={async (next, note) => { await setStatus(s.id, next, note); }} />
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" asChild><Link to="/adm-loja/$id" params={{ id: s.id }}>Detalhes</Link></Button>
                {s.approval_status === "approved" && (
                  <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.is_online ? "Desativar" : "Ativar"}</Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => remove(s)}>Arquivar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


const ORDER_FILTERS: { k: string; label: string; kind: "status" | "payment" }[] = [
  { k: "all", label: "Todos", kind: "status" },
  { k: "pending", label: "Pendentes", kind: "status" },
  { k: "in_progress", label: "Em andamento", kind: "status" },
  { k: "ready", label: "Prontos", kind: "status" },
  { k: "out_for_delivery", label: "Em entrega", kind: "status" },
  { k: "delivered", label: "Entregues", kind: "status" },
  { k: "cancelled", label: "Cancelados", kind: "status" },
  { k: "pay_pending", label: "Pgto pendente", kind: "payment" },
  { k: "pay_paid", label: "Pgto aprovado", kind: "payment" },
  { k: "pay_failed", label: "Pgto falhou", kind: "payment" },
  { k: "pay_refunded", label: "Reembolsados", kind: "payment" },
];

// Tradução centralizada em @/lib/format (orderStatusLabel, paymentStatusLabel, paymentMethodLabel).

function OrdersTab() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderRow[]>([]);
  const [filter, setFilter] = useState<string>(search.filtro ?? "all");
  const [q, setQ] = useState(search.q ?? "");
  const [loading, setLoading] = useState(false);
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refunding, setRefunding] = useState(false);
  const refund = useServerFn(adminRefundOrder);

  useEffect(() => { load(); }, [filter]);

  // Mantém busca/filtro na URL para voltar do detalhe sem perder o contexto.
  useEffect(() => {
    const t = setTimeout(() => {
      navigate({
        to: "/adm",
        search: { tab: "orders", ...(q ? { q } : {}), ...(filter !== "all" ? { filtro: filter } : {}) },
        replace: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [q, filter, navigate]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("id, status, total, payment_method, payment_status, customer_id, store_id, courier_id, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (filter === "in_progress") query = query.in("status", ["accepted", "preparing"] as any);
    else if (filter === "pay_pending") query = query.eq("payment_status", "pending" as any);
    else if (filter === "pay_paid") query = query.eq("payment_status", "paid" as any);
    else if (filter === "pay_failed") query = query.eq("payment_status", "failed" as any);
    else if (filter === "pay_refunded") query = query.eq("payment_status", "refunded" as any);
    else if (filter !== "all") query = query.eq("status", filter as any);

    const { data } = await query;
    const rows = (data ?? []) as unknown as OrderRow[];
    if (rows.length) {
      const personIds = Array.from(
        new Set(rows.flatMap((r) => [r.customer_id, r.courier_id]).filter(Boolean) as string[]),
      );
      const storeIds = Array.from(new Set(rows.map((r) => r.store_id)));
      const [{ data: profs }, { data: stores }] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", personIds),
        supabase.from("stores").select("id, name").in("id", storeIds),
      ]);
      const pMap = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
      const sMap = new Map((stores ?? []).map((s: any) => [s.id, s.name]));
      rows.forEach((r) => {
        r.customer_name = pMap.get(r.customer_id) ?? null;
        r.courier_name = r.courier_id ? pMap.get(r.courier_id) ?? null : null;
        r.store_name = sMap.get(r.store_id) ?? null;
      });
    }
    setItems(rows);
    setLoading(false);
  }

  async function cancel(id: string) {
    if (!confirm("Cancelar este pedido?")) return;
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Pedido cancelado"); load();
  }

  async function confirmRefund() {
    if (!refundTarget) return;
    setRefunding(true);
    try {
      const res = await refund({ data: { orderId: refundTarget.id } });
      toast.success(`Estorno concluído: R$ ${Number(res.amount).toFixed(2)}`);
      setRefundTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha no estorno");
    } finally {
      setRefunding(false);
    }
  }

  const term = q.trim().toLowerCase();
  const clean = term.replace(/^#/, "");
  const filtered = items.filter((o) =>
    !clean
    || o.id.toLowerCase().includes(clean)
    || o.id.slice(0, 8).toLowerCase().includes(clean)
    || (o.customer_name ?? "").toLowerCase().includes(clean)
    || (o.store_name ?? "").toLowerCase().includes(clean)
    || (o.courier_name ?? "").toLowerCase().includes(clean),
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar pedido por número, cliente, loja ou entregador"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="tabs-scroll flex gap-1">
        {ORDER_FILTERS.map((f) => (
          <Button key={f.k} size="sm" className="shrink-0" variant={filter === f.k ? "default" : "outline"} onClick={() => setFilter(f.k)}>
            {f.label}
          </Button>
        ))}
      </div>
      {loading && <Loader2 className="animate-spin" />}
      {!loading && filtered.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido com esses filtros.</Card>
      )}
      {filtered.map((o) => (
        <Card key={o.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-1">
              <p className="font-mono text-xs">{orderNumber(o.id)}</p>
              <p className="flex flex-wrap items-center gap-1 text-sm font-semibold">
                {brl(Number(o.total))}
                <Badge variant={o.status === "cancelled" ? "destructive" : "default"}>{tr(orderStatusLabel, o.status)}</Badge>
                <Badge variant={o.payment_status === "paid" ? "default" : o.payment_status === "refunded" ? "destructive" : "secondary"}>
                  {tr(paymentStatusLabel, o.payment_status)}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Cliente: {o.customer_name ?? "—"} · Loja: {o.store_name ?? "—"} · Entregador: {o.courier_name ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {tr(paymentMethodLabel, o.payment_method)} · {dateTimeBR(o.created_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/adm-pedido/$id"
                  params={{ id: o.id }}
                  search={{ ...(q ? { q } : {}), ...(filter !== "all" ? { filtro: filter } : {}) }}
                >
                  Ver detalhes
                </Link>
              </Button>
              {o.payment_status === "paid" && ["pix", "card_online"].includes(o.payment_method) && (
                <Button size="sm" variant="outline" onClick={() => setRefundTarget(o)}>Estornar pagamento</Button>
              )}
              {!["delivered", "cancelled"].includes(o.status) && (
                <Button size="sm" variant="destructive" onClick={() => cancel(o.id)}>Cancelar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!refundTarget} onOpenChange={(v) => !v && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar estorno total</DialogTitle>
            <DialogDescription>
              O valor será devolvido ao cliente pelo Mercado Pago. O pedido e todo o histórico são preservados.
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="text-sm space-y-1">
              <p>Pedido <span className="font-mono">{orderNumber(refundTarget.id)}</span></p>
              <p>Cliente: {refundTarget.customer_name ?? "—"}</p>
              <p className="text-lg font-bold">Valor a estornar: {brl(Number(refundTarget.total))}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)} disabled={refunding}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmRefund} disabled={refunding}>
              {refunding && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Confirmar estorno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


type AdminUser = {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  city: string | null; roles: string[]; created_at: string; deactivated_at: string | null;
  courier_status: string | null; store_count: number;
};

const USER_FILTERS = [
  { k: "all", label: "Todos" },
  { k: "customer", label: "Clientes" },
  { k: "merchant", label: "Lojistas" },
  { k: "courier", label: "Entregadores" },
  { k: "admin", label: "Admins" },
  { k: "inactive", label: "Desativados" },
] as const;

function UsersTab() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof USER_FILTERS)[number]["k"]>("all");
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("admin_list_users");
    setLoading(false);
    if (error) { console.error(error); return toast.error("Não foi possível carregar os usuários."); }
    setItems((data ?? []) as AdminUser[]);
  }
  async function toggleRole(userId: string, role: string, has: boolean) {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    }
    toast.success("Papéis atualizados"); load();
  }
  async function setActive(u: AdminUser, active: boolean) {
    if (!active && !confirm(`Desativar a conta de ${u.full_name ?? u.email}? A pessoa perde acesso operacional e as lojas ficam fora do ar.`)) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_set_user_active", { _user_id: u.id, _active: active });
    if (error) { console.error(error); return toast.error(error.message ?? "Não foi possível concluir."); }
    toast.success(active ? "Conta reativada" : "Conta desativada"); load();
  }

  const term = q.trim().toLowerCase();
  const filtered = items.filter((u) => {
    const matchQ = !term
      || (u.full_name ?? "").toLowerCase().includes(term)
      || (u.email ?? "").toLowerCase().includes(term)
      || (u.city ?? "").toLowerCase().includes(term)
      || (u.phone ?? "").includes(term);
    const matchF =
      filter === "all" ? true
      : filter === "inactive" ? !!u.deactivated_at
      : u.roles.includes(filter);
    return matchQ && matchF;
  });

  return (
    <div className="space-y-3">
      <Input placeholder="Buscar por nome, e-mail, telefone ou cidade..." value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tabs-scroll flex gap-1">
        {USER_FILTERS.map((f) => (
          <Button key={f.k} size="sm" variant={filter === f.k ? "default" : "outline"} className="shrink-0" onClick={() => setFilter(f.k)}>
            {f.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{filtered.length} usuário(s)</p>
      {loading && <Card className="p-6 text-center text-sm text-muted-foreground">Carregando...</Card>}
      {!loading && filtered.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum usuário encontrado com esses filtros.</Card>
      )}
      {filtered.map((u) => (
        <Card key={u.id} className={u.deactivated_at ? "opacity-70" : ""}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">
                <Link to="/adm-usuario/$id" params={{ id: u.id }} className="hover:underline">{u.full_name ?? "Sem nome"}</Link>
                {u.deactivated_at && <Badge variant="destructive" className="ml-2">Desativado</Badge>}
              </p>
              <p className="text-xs text-muted-foreground truncate">{u.email ?? "—"}</p>
              <p className="text-xs text-muted-foreground truncate">
                {u.phone ?? "sem telefone"} • {u.city ?? "cidade não informada"}
                {u.store_count > 0 && ` • ${u.store_count} loja(s)`}
                {u.courier_status && ` • entregador: ${u.courier_status}`}
              </p>
              <div className="flex gap-1 mt-1 flex-wrap">
                {u.roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
                {u.roles.length === 0 && <span className="text-xs text-muted-foreground">sem papéis</span>}
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["customer", "merchant", "courier", "admin"] as const).map((r) => {
                const has = u.roles.includes(r);
                return (
                  <Button key={r} size="sm" variant={has ? "default" : "outline"} onClick={() => toggleRole(u.id, r, has)}>
                    {has ? `− ${r}` : `+ ${r}`}
                  </Button>
                );
              })}
              {u.deactivated_at ? (
                <Button size="sm" variant="secondary" onClick={() => setActive(u, true)}>Reativar</Button>
              ) : (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setActive(u, false)}>Desativar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}


const WITHDRAWAL_FILTERS = [
  { k: "all", label: "Todos" },
  { k: "requested", label: "Pendentes" },
  { k: "approved", label: "Aprovados" },
  { k: "paid", label: "Pagos" },
  { k: "rejected", label: "Recusados" },
] as const;

type WithdrawalFull = WithdrawalRow & {
  approved_at: string | null;
  paid_at: string | null;
  store_name?: string | null;
  store_city?: string | null;
  owner_name?: string | null;
};

function WithdrawalsTab() {
  const [items, setItems] = useState<WithdrawalFull[]>([]);
  const [status, setStatus] = useState<string>("requested");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<WithdrawalFull | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, [status]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("store_withdrawals")
      .select("id, store_id, amount, fee, net, pix_key, status, requested_at, note, approved_at, paid_at")
      .order("requested_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data } = await query;
    const rows = (data ?? []) as unknown as WithdrawalFull[];
    if (rows.length) {
      const storeIds = Array.from(new Set(rows.map((r) => r.store_id)));
      const { data: stores } = await supabase.from("stores").select("id, name, city, owner_id").in("id", storeIds);
      const ownerIds = Array.from(new Set((stores ?? []).map((s: any) => s.owner_id)));
      const { data: owners } = await supabase.from("profiles").select("id, full_name").in("id", ownerIds);
      const oMap = new Map((owners ?? []).map((o: any) => [o.id, o.full_name]));
      const sMap = new Map((stores ?? []).map((s: any) => [s.id, s]));
      rows.forEach((r) => {
        const st: any = sMap.get(r.store_id);
        r.store_name = st?.name ?? null;
        r.store_city = st?.city ?? null;
        r.owner_name = st ? oMap.get(st.owner_id) ?? null : null;
      });
    }
    setItems(rows);
    setLoading(false);
  }

  async function run(rpc: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc(rpc, args);
    setBusy(false);
    if (error) { console.error(error); return toast.error(error.message ?? "Não foi possível concluir."); }
    toast.success(ok);
    setDetail(null);
    setRejectOpen(false);
    setReason("");
    load();
  }

  async function approve(w: WithdrawalFull) {
    if (!confirm(`Autorizar saque de ${brl(Number(w.amount))} para ${w.store_name ?? "a loja"}?`)) return;
    await run("admin_approve_withdrawal", { _id: w.id }, "Saque autorizado");
  }

  async function markPaid(w: WithdrawalFull) {
    if (!confirm(`Confirmar que o repasse de ${brl(Number(w.net))} para ${w.store_name ?? "a loja"} já foi realizado?`)) return;
    await run("admin_mark_withdrawal_paid", { _id: w.id }, "Saque marcado como pago");
  }

  const term = q.trim().toLowerCase();
  const filtered = items.filter((w) =>
    !term
    || (w.store_name ?? "").toLowerCase().includes(term)
    || (w.owner_name ?? "").toLowerCase().includes(term),
  );

  return (
    <div className="space-y-3">
      <div className="tabs-scroll flex gap-1">
        {WITHDRAWAL_FILTERS.map((f) => (
          <Button key={f.k} size="sm" className="shrink-0" variant={status === f.k ? "default" : "outline"} onClick={() => setStatus(f.k)}>
            {f.label}
          </Button>
        ))}
      </div>
      <Input placeholder="Buscar por loja ou lojista" value={q} onChange={(e) => setQ(e.target.value)} />
      {loading && <Loader2 className="animate-spin" />}
      {!loading && filtered.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma solicitação com esses filtros.</Card>
      )}
      {filtered.map((w) => (
        <Card key={w.id}>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="font-semibold">
                {brl(Number(w.amount))}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  (líquido {brl(Number(w.net))} · taxa {brl(Number(w.fee))})
                </span>
              </p>
              <p className="text-sm">{w.store_name ?? "—"} <span className="text-xs text-muted-foreground">· {w.owner_name ?? "—"}</span></p>
              <p className="text-xs text-muted-foreground">
                {dateTimeBR(w.requested_at)} · <Badge variant={w.status === "rejected" ? "destructive" : w.status === "paid" ? "default" : "secondary"}>{tr(withdrawalStatusLabel, w.status)}</Badge>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setDetail(w)}>Ver detalhes</Button>
              {w.status === "requested" && <Button size="sm" onClick={() => approve(w)} disabled={busy}>Autorizar saque</Button>}
              {w.status === "approved" && <Button size="sm" onClick={() => markPaid(w)} disabled={busy}>Marcar como pago</Button>}
              {(w.status === "requested" || w.status === "approved") && (
                <Button size="sm" variant="destructive" onClick={() => { setDetail(w); setRejectOpen(true); }} disabled={busy}>Recusar</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!detail && !rejectOpen} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitação de saque</DialogTitle>
            <DialogDescription>Dados necessários para a operação financeira.</DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-1 text-sm">
              <p>Loja: <strong>{detail.store_name ?? "—"}</strong> {detail.store_city ? `· ${detail.store_city}` : ""}</p>
              <p>Lojista: {detail.owner_name ?? "—"}</p>
              <p>Valor solicitado: <strong>{brl(Number(detail.amount))}</strong></p>
              <p>Taxa: {brl(Number(detail.fee))} · Líquido a pagar: <strong>{brl(Number(detail.net))}</strong></p>
              <p>Chave PIX: <span className="font-mono">{detail.pix_key}</span></p>
              <p>Solicitado em: {dateTimeBR(detail.requested_at)}</p>
              <p>Situação: {tr(withdrawalStatusLabel, detail.status)}</p>
              <p>Aprovado em: {detail.approved_at ? dateTimeBR(detail.approved_at) : "—"}</p>
              <p>Pago em: {detail.paid_at ? dateTimeBR(detail.paid_at) : "—"}</p>
              {detail.status === "rejected" && <p className="text-destructive">Motivo da recusa: {detail.note ?? "—"}</p>}
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            {detail?.status === "requested" && <Button onClick={() => approve(detail)} disabled={busy}>Autorizar saque</Button>}
            {detail?.status === "approved" && <Button onClick={() => markPaid(detail)} disabled={busy}>Marcar como pago</Button>}
            <Button variant="outline" onClick={() => setDetail(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={(v) => { if (!v) { setRejectOpen(false); setReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar saque</DialogTitle>
            <DialogDescription>
              O valor reservado volta para a carteira da loja. Informe o motivo — ele fica registrado e visível para o lojista.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} placeholder="Motivo da recusa" value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectOpen(false); setReason(""); }} disabled={busy}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                if (reason.trim().length < 3) return toast.error("Informe o motivo da recusa.");
                if (detail) void run("admin_reject_withdrawal", { _id: detail.id, _reason: reason.trim() }, "Saque recusado");
              }}
            >
              {busy && <Loader2 className="mr-1 size-4 animate-spin" />} Confirmar recusa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: string; label: string }> = {
    pending: { variant: "secondary", label: "Pendente" },
    in_review: { variant: "outline", label: "Em análise" },
    approved: { variant: "default", label: "Aprovado" },
    rejected: { variant: "destructive", label: "Recusado" },
  };
  const it = map[status] ?? { variant: "secondary", label: status };
  return <Badge variant={it.variant as any} className="ml-1">{it.label}</Badge>;
}

// ============ Cities ============
type CityRow = { id: string; name: string; state: string; slug: string; is_active: boolean; created_at: string };

function slugifyCity(v: string) {
  return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function CitiesTab() {
  const [rows, setRows] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [state, setState] = useState("SP");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("cities").select("id,name,state,slug,is_active,created_at").order("name");
    setRows((data ?? []) as CityRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !state.trim()) return;
    setSaving(true);
    const slug = slugifyCity(`${name}-${state}`);
    const { error } = await supabase.from("cities").insert({ name: name.trim(), state: state.trim().toUpperCase(), slug });
    setSaving(false);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Cidade cadastrada");
    setName(""); setState("SP"); load();
  };

  const toggle = async (row: CityRow) => {
    const { error } = await supabase.from("cities").update({ is_active: !row.is_active }).eq("id", row.id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    load();
  };

  const remove = async (row: CityRow) => {
    if (!confirm(`Remover a cidade ${row.name}? Só é possível se não houver lojas, entregadores ou pedidos vinculados.`)) return;
    const { error } = await supabase.from("cities").delete().eq("id", row.id);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Cidade removida");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Nova cidade</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <Input placeholder="Nome (ex: São Paulo)" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input placeholder="UF" value={state} onChange={(e) => setState(e.target.value)} maxLength={2} required />
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Adicionar"}</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma cidade cadastrada.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-3 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{r.name} <span className="text-xs text-muted-foreground">/ {r.state}</span></div>
                  <div className="text-xs text-muted-foreground">slug: {r.slug}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{r.is_active ? "Ativa" : "Inativa"}</span>
                  <Switch checked={r.is_active} onCheckedChange={() => toggle(r)} />
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
