import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { Loader2, ShieldCheck, Store as StoreIcon, Users, Bike, ClipboardList, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/adm")({
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
  customer_id: string;
  store_id: string;
  created_at: string;
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
          <p className="text-sm text-muted-foreground">QuintanaFood — controle da plataforma</p>
        </div>
      </header>

      <Tabs defaultValue="dashboard">
        <TabsList className="grid grid-cols-3 md:grid-cols-6 mb-4">
          <TabsTrigger value="dashboard">Visão</TabsTrigger>
          <TabsTrigger value="couriers"><Bike className="w-4 h-4 mr-1" />Entregadores</TabsTrigger>
          <TabsTrigger value="stores"><StoreIcon className="w-4 h-4 mr-1" />Lojas</TabsTrigger>
          <TabsTrigger value="orders"><ClipboardList className="w-4 h-4 mr-1" />Pedidos</TabsTrigger>
          <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" />Usuários</TabsTrigger>
          <TabsTrigger value="withdrawals"><Wallet className="w-4 h-4 mr-1" />Saques</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="couriers"><CouriersTab /></TabsContent>
        <TabsContent value="stores"><StoresTab /></TabsContent>
        <TabsContent value="orders"><OrdersTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="withdrawals"><WithdrawalsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState({ stores: 0, couriers: 0, pendingCouriers: 0, orders: 0, todayOrders: 0, pendingWithdrawals: 0 });
  useEffect(() => {
    (async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const [s, sp, c, cp, o, ot, w] = await Promise.all([
        supabase.from("stores").select("id", { count: "exact", head: true }),
        supabase.from("stores").select("id", { count: "exact", head: true }).in("approval_status", ["pending", "in_review"]),
        supabase.from("couriers").select("id", { count: "exact", head: true }),
        supabase.from("couriers").select("id", { count: "exact", head: true }).in("approval_status", ["pending", "in_review"]),
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", today.toISOString()),
        supabase.from("store_withdrawals").select("id", { count: "exact", head: true }).eq("status", "requested"),
      ]);
      setStats({
        stores: s.count ?? 0,
        pendingStores: sp.count ?? 0,
        couriers: c.count ?? 0,
        pendingCouriers: cp.count ?? 0,
        orders: o.count ?? 0,
        todayOrders: ot.count ?? 0,
        pendingWithdrawals: w.count ?? 0,
      });
    })();
  }, []);
  const kpis = [
    { label: "Lojas cadastradas", value: stats.stores },
    { label: "Lojas aguardando análise", value: stats.pendingStores, alert: stats.pendingStores > 0 },
    { label: "Entregadores", value: stats.couriers },
    { label: "Entregadores aguardando análise", value: stats.pendingCouriers, alert: stats.pendingCouriers > 0 },
    { label: "Pedidos totais", value: stats.orders },
    { label: "Pedidos hoje", value: stats.todayOrders },
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

function CouriersTab() {
  const [items, setItems] = useState<Courier[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    let q = supabase.from("couriers").select("id, document, vehicle, vehicle_plate, approval_status, created_at").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("approval_status", filter);
    const { data } = await q;
    const rows = (data ?? []) as Courier[];
    if (rows.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").in("id", rows.map((r) => r.id));
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      rows.forEach((r) => (r.profile = map.get(r.id) ?? null));
    }
    setItems(rows);
    setLoading(false);
  }
  useEffect(() => { load(); }, [filter]);

  async function act(id: string, approval_status: "approved" | "rejected") {
    const { error } = await supabase.from("couriers").update({ approval_status, approved_at: new Date().toISOString() }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(approval_status === "approved" ? "Entregador aprovado" : "Entregador rejeitado");
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f === "pending" ? "Pendentes" : f === "approved" ? "Aprovados" : f === "rejected" ? "Rejeitados" : "Todos"}
          </Button>
        ))}
      </div>
      {loading && <Loader2 className="animate-spin" />}
      {!loading && items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum entregador.</p>}
      <div className="space-y-2">
        {items.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <p className="font-semibold">{c.profile?.full_name ?? "Sem nome"}</p>
                <p className="text-xs text-muted-foreground">
                  {c.profile?.phone ?? "—"} · CPF {c.document ?? "—"} · {c.vehicle ?? "—"} {c.vehicle_plate ?? ""}
                </p>
                <StatusBadge status={c.approval_status} />
              </div>
              {c.approval_status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => act(c.id, "approved")}>Aprovar</Button>
                  <Button size="sm" variant="destructive" onClick={() => act(c.id, "rejected")}>Rejeitar</Button>
                </div>
              )}
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
  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("stores").select("id, name, slug, owner_id, is_online, city, cnpj, created_at").order("created_at", { ascending: false });
    setItems((data ?? []) as StoreRow[]);
  }
  async function toggle(s: StoreRow) {
    const { error } = await supabase.from("stores").update({ is_online: !s.is_online }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success(!s.is_online ? "Loja ativada" : "Loja desativada");
    load();
  }
  async function remove(s: StoreRow) {
    if (!confirm(`Excluir loja "${s.name}"? Esta ação é irreversível.`)) return;
    const { error } = await supabase.from("stores").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Loja excluída"); load();
  }
  const filtered = items.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.slug.includes(q.toLowerCase()));
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar loja..." value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.map((s) => (
        <Card key={s.id}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="font-semibold">{s.name} <Badge variant={s.is_online ? "default" : "secondary"}>{s.is_online ? "Online" : "Offline"}</Badge></p>
              <p className="text-xs text-muted-foreground">/{s.slug} · {s.city ?? "—"} · CNPJ {s.cnpj ?? "—"}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.is_online ? "Desativar" : "Ativar"}</Button>
              <Button size="sm" variant="destructive" onClick={() => remove(s)}>Excluir</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function OrdersTab() {
  const [items, setItems] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState<string>("all");
  useEffect(() => { load(); }, [status]);
  async function load() {
    let q = supabase.from("orders").select("id, status, total, payment_method, customer_id, store_id, created_at").order("created_at", { ascending: false }).limit(100);
    if (status !== "all") q = q.eq("status", status as any);
    const { data } = await q;
    setItems((data ?? []) as OrderRow[]);
  }
  async function cancel(id: string) {
    if (!confirm("Cancelar este pedido?")) return;
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pedido cancelado"); load();
  }
  const statuses = ["all", "pending", "confirmed", "preparing", "ready", "on_the_way", "delivered", "cancelled"];
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {statuses.map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>
        ))}
      </div>
      {items.map((o) => (
        <Card key={o.id}>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs">#{o.id.slice(0, 8)}</p>
              <p className="text-sm">R$ {Number(o.total).toFixed(2)} · {o.payment_method} · <Badge>{o.status}</Badge></p>
              <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
            </div>
            {!["delivered", "cancelled"].includes(o.status) && (
              <Button size="sm" variant="destructive" onClick={() => cancel(o.id)}>Cancelar</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => { load(); }, []);
  async function load() {
    const { data: profs } = await supabase.from("profiles").select("id, full_name, phone").limit(200);
    const { data: rolesData } = await supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role); roleMap.set(r.user_id, arr);
    });
    setItems((profs ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] })));
  }
  async function toggleRole(userId: string, role: string, has: boolean) {
    if (has) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
      if (error) return toast.error(error.message);
    }
    toast.success("Papéis atualizados"); load();
  }
  const filtered = items.filter((u) => !q || (u.full_name ?? "").toLowerCase().includes(q.toLowerCase()) || (u.phone ?? "").includes(q));
  return (
    <div className="space-y-3">
      <Input placeholder="Buscar usuário..." value={q} onChange={(e) => setQ(e.target.value)} />
      {filtered.map((u) => (
        <Card key={u.id}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="font-semibold">{u.full_name ?? "Sem nome"}</p>
              <p className="text-xs text-muted-foreground">{u.phone ?? "—"}</p>
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
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function WithdrawalsTab() {
  const [items, setItems] = useState<WithdrawalRow[]>([]);
  const [status, setStatus] = useState<string>("requested");
  useEffect(() => { load(); }, [status]);
  async function load() {
    let q = supabase.from("store_withdrawals").select("id, store_id, amount, fee, net, pix_key, status, requested_at, note").order("requested_at", { ascending: false });
    if (status !== "all") q = q.eq("status", status);
    const { data } = await q;
    setItems((data ?? []) as WithdrawalRow[]);
  }
  async function setStatusOf(id: string, newStatus: string) {
    const patch: any = { status: newStatus };
    if (newStatus === "paid" || newStatus === "rejected") patch.processed_at = new Date().toISOString();
    const { error } = await supabase.from("store_withdrawals").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Saque atualizado"); load();
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {["requested", "paid", "rejected", "all"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>{s}</Button>
        ))}
      </div>
      {items.map((w) => (
        <Card key={w.id}>
          <CardContent className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="font-semibold">R$ {Number(w.net).toFixed(2)} <span className="text-xs text-muted-foreground">(bruto {Number(w.amount).toFixed(2)}, taxa {Number(w.fee).toFixed(2)})</span></p>
              <p className="text-xs text-muted-foreground">PIX: {w.pix_key}</p>
              <p className="text-xs">{new Date(w.requested_at).toLocaleString("pt-BR")} · <Badge>{w.status}</Badge></p>
            </div>
            {w.status === "requested" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setStatusOf(w.id, "paid")}>Marcar pago</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatusOf(w.id, "rejected")}>Rejeitar</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
  const label = status === "approved" ? "Aprovado" : status === "rejected" ? "Rejeitado" : "Pendente";
  return <Badge variant={variant as any} className="ml-1">{label}</Badge>;
}
