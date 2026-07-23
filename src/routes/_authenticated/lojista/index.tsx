import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUpload } from "@/components/ImageUpload";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, orderStatusLabel, slugify } from "@/lib/format";
import { toast } from "sonner";
import {
  Store as StoreIcon, Plus, Trash2, Package, ClipboardList, LayoutDashboard,
  Wallet, Star, BarChart3, Bell, Reply,
} from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/lojista/")({ component: Page });

const WEEK = [
  { k: "mon", label: "Seg" }, { k: "tue", label: "Ter" }, { k: "wed", label: "Qua" },
  { k: "thu", label: "Qui" }, { k: "fri", label: "Sex" }, { k: "sat", label: "Sáb" }, { k: "sun", label: "Dom" },
];
const WEEK_KEYS_JS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function todayHours(hours: Record<string, { open: string; close: string; closed?: boolean }> | null | undefined) {
  if (!hours) return null;
  const k = WEEK_KEYS_JS[new Date().getDay()];
  return hours[k] ?? null;
}

function Page() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [store, setStore] = useState<any>(null);
  const [isMerchant, setIsMerchant] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const merchant = roles?.some((r) => r.role === "merchant");
    setIsMerchant(!!merchant);
    if (!merchant) { setLoading(false); return; }
    const { data: s } = await sb.from("stores").select("*").eq("owner_id", u.user.id).maybeSingle();
    setStore(s);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!store?.id) return;
    const refresh = async () => {
      const { count: n } = await sb.from("store_notifications").select("id", { count: "exact", head: true })
        .eq("store_id", store.id).is("read_at", null);
      setUnread(n ?? 0);
      const { count: p } = await sb.from("orders").select("id", { count: "exact", head: true })
        .eq("store_id", store.id).eq("status", "pending");
      setPendingCount(p ?? 0);
    };
    refresh();
    const ch = sb.channel(`store-live:${store.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_notifications", filter: `store_id=eq.${store.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${store.id}` }, refresh)
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [store?.id]);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;
  if (!isMerchant) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <p className="text-sm text-muted-foreground">Sua conta não é uma conta de lojista. Saia e entre novamente escolhendo "Lojista" para acessar este painel.</p>
        <Button className="mt-4" onClick={() => nav({ to: "/auth" })}>Ir para login</Button>
      </div>
    );
  }
  if (!store) return <StoreCreate onCreated={load} />;

  const th = todayHours(store.hours);

  const approvalLabel: Record<string, string> = { pending: "Pendente", in_review: "Em análise", approved: "Aprovada", rejected: "Recusada" };
  const approvalVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = { pending: "secondary", in_review: "outline", approved: "default", rejected: "destructive" };
  const isApproved = store.approval_status === "approved";

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-6">
      {!isApproved && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${store.approval_status === "rejected" ? "border-destructive/50 bg-destructive/5" : "border-primary/40 bg-primary/5"}`}>
          <p className="font-medium">
            Status do cadastro: {approvalLabel[store.approval_status] ?? store.approval_status}
          </p>
          {store.approval_status === "rejected" && store.approval_note && (
            <p className="mt-1 text-destructive">Motivo da recusa: {store.approval_note}</p>
          )}
          {store.approval_status !== "rejected" && (
            <p className="mt-1 text-muted-foreground">Sua loja só ficará visível aos clientes após a aprovação pelo administrador.</p>
          )}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={approvalVariant[store.approval_status] ?? "secondary"}>{approvalLabel[store.approval_status] ?? store.approval_status}</Badge>
            {isApproved && <Badge variant={store.is_online ? "default" : "secondary"}>{store.is_online ? "Online" : "Offline"}</Badge>}
            <Link to="/loja/$slug" params={{ slug: store.slug }} className="text-primary hover:underline">Ver como cliente →</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <span className="text-sm">{store.is_online ? "No ar" : "Fora do ar"}</span>
          <Switch
            checked={store.is_online}
            disabled={!isApproved}
            onCheckedChange={async (v) => {
              const { error } = await sb.from("stores").update({ is_online: v }).eq("id", store.id);
              if (error) return toast.error(error.message);
              toast.success(v ? "Loja no ar!" : "Loja pausada");
              load();
            }}
          />
        </div>
      </div>


      <Tabs defaultValue="dashboard">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-muted/40 p-1">
          <TabsTrigger value="dashboard"><LayoutDashboard className="mr-1 size-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="orders" className="relative">
            <ClipboardList className="mr-1 size-4" />Pedidos
            {pendingCount > 0 && <span className="ml-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="menu"><Package className="mr-1 size-4" />Cardápio</TabsTrigger>
          <TabsTrigger value="store"><StoreIcon className="mr-1 size-4" />Minha loja</TabsTrigger>
          <TabsTrigger value="finance"><Wallet className="mr-1 size-4" />Financeiro</TabsTrigger>
          <TabsTrigger value="reviews"><Star className="mr-1 size-4" />Avaliações</TabsTrigger>
          <TabsTrigger value="reports"><BarChart3 className="mr-1 size-4" />Relatórios</TabsTrigger>
          <TabsTrigger value="notifs" className="relative">
            <Bell className="mr-1 size-4" />Notif.
            {unread > 0 && <span className="ml-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{unread}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4"><DashboardTab store={store} /></TabsContent>
        <TabsContent value="orders" className="mt-4"><OrdersTab storeId={store.id} /></TabsContent>
        <TabsContent value="menu" className="mt-4"><MenuTab storeId={store.id} /></TabsContent>
        <TabsContent value="store" className="mt-4"><StoreEdit store={store} onSaved={load} /></TabsContent>
        <TabsContent value="finance" className="mt-4"><FinanceTab store={store} /></TabsContent>
        <TabsContent value="reviews" className="mt-4"><ReviewsTab storeId={store.id} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab storeId={store.id} /></TabsContent>
        <TabsContent value="notifs" className="mt-4"><NotificationsTab storeId={store.id} /></TabsContent>
      </Tabs>

      <div className="fixed inset-x-0 bottom-14 z-30 border-t bg-card/95 px-4 py-2 text-xs backdrop-blur sm:bottom-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="flex items-center gap-1">
            <span className={`size-2 rounded-full ${store.is_online ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {store.is_online ? "Loja no ar" : "Loja fora do ar"}
          </span>
          <span className="text-muted-foreground">
            {th?.closed || !th ? "Fechado hoje" : `Hoje: ${th.open} – ${th.close}`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ============ Create Store ============
function StoreCreate({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [cities, setCities] = useState<{ id: string; name: string; state: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sb.from("cities").select("id,name,state").eq("is_active", true).order("name").then(({ data }: { data: { id: string; name: string; state: string }[] | null }) => {
      const list = (data ?? []) as { id: string; name: string; state: string }[];
      setCities(list);
      setCityId((prev) => prev || list[0]?.id || "");
    });
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader><CardTitle>Criar sua loja</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            if (!cityId) return toast.error("Selecione a cidade da loja");
            setSaving(true);
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) return;
            const base = slugify(name);
            const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
            const { error } = await sb.from("stores").insert({ owner_id: u.user.id, name, slug, cnpj, city_id: cityId });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success("Loja criada! Complete os dados para ficar online.");
            onCreated();
          }}>
            <div className="space-y-1.5"><Label>Nome da loja</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <div className="space-y-1.5"><Label>CNPJ</Label><Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" required /></div>
            <div className="space-y-1.5">
              <Label>Cidade de atuação</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger>
                <SelectContent>
                  {cities.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name} / {c.state}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar loja"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Dashboard ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DashboardTab({ store }: { store: any }) {
  const [stats, setStats] = useState({ today: 0, inProgress: 0, done: 0, revenueDay: 0, revenueMonth: 0, avgRating: 0, ratingCount: 0, balance: 0 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pending, setPending] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const startDay = new Date(); startDay.setHours(0, 0, 0, 0);
      const startMonth = new Date(startDay.getFullYear(), startDay.getMonth(), 1);
      const { data: orders } = await sb.from("orders").select("id,status,total,subtotal,created_at,customer_id,payment_method").eq("store_id", store.id);
      const arr = orders ?? [];
      const today = arr.filter((o: any) => new Date(o.created_at) >= startDay);
      const done = today.filter((o: any) => o.status === "delivered");
      const inProgress = arr.filter((o: any) => !["delivered", "cancelled"].includes(o.status));
      const revenueDay = done.reduce((s: number, o: any) => s + Number(o.subtotal), 0);
      const revenueMonth = arr.filter((o: any) => o.status === "delivered" && new Date(o.created_at) >= startMonth)
        .reduce((s: number, o: any) => s + Number(o.subtotal), 0);
      const { data: rev } = await sb.from("store_reviews").select("rating").eq("store_id", store.id);
      const ratings = rev ?? [];
      const avg = ratings.length ? ratings.reduce((s: number, r: any) => s + r.rating, 0) / ratings.length : 0;
      const { data: bal } = await sb.rpc("store_wallet_balance", { _store_id: store.id });
      setStats({ today: today.length, inProgress: inProgress.length, done: done.length, revenueDay, revenueMonth, avgRating: avg, ratingCount: ratings.length, balance: Number(bal ?? 0) });
      setPending(arr.filter((o: any) => o.status === "pending"));
    };
    load();
  }, [store.id]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pedidos do dia" value={stats.today} />
        <StatCard label="Em andamento" value={stats.inProgress} />
        <StatCard label="Concluídos hoje" value={stats.done} />
        <StatCard label="Faturamento hoje" value={brl(stats.revenueDay)} />
        <StatCard label="Faturamento do mês" value={brl(stats.revenueMonth)} />
        <StatCard label="Saldo carteira" value={brl(stats.balance)} />
        <StatCard label="Avaliação média" value={stats.avgRating ? `${stats.avgRating.toFixed(1)}★` : "—"} sub={`${stats.ratingCount} avaliações`} />
        <StatCard label="Status" value={store.is_online ? "No ar" : "Fora"} />
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">⚠️ Pedidos aguardando confirmação</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {pending.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg border p-2">
                <div>
                  <div className="font-medium">#{o.id.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground">{brl(Number(o.total))} • {new Date(o.created_at).toLocaleTimeString("pt-BR")}</div>
                </div>
                <Button size="sm" asChild><Link to="/pedidos/$id" params={{ id: o.id }}>Abrir</Link></Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card><CardContent className="pt-6">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

// ============ Store Edit ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StoreEdit({ store, onSaved }: { store: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: store.name, description: store.description ?? "", category: store.category ?? "",
    cnpj: store.cnpj ?? "", whatsapp: store.whatsapp ?? "",
    logo_url: store.logo_url as string | null, cover_url: store.cover_url as string | null,
    phone: store.phone ?? "",
    delivery_fee: String(store.delivery_fee ?? 0),
    min_order: String(store.min_order ?? 0),
    delivery_radius_km: String(store.delivery_radius_km ?? 5),
    prep_time_min: String(store.prep_time_min ?? 30),
    accepts_pix: store.accepts_pix, accepts_card_online: store.accepts_card_online,
    accepts_cash: store.accepts_cash, accepts_card_on_delivery: store.accepts_card_on_delivery,
    payout_pix_key: store.payout_pix_key ?? "",
  });
  const [hours, setHours] = useState<Record<string, { open: string; close: string; closed?: boolean }>>(() => {
    const h = store.hours ?? {};
    const out: Record<string, { open: string; close: string; closed?: boolean }> = {};
    WEEK.forEach(({ k }) => { out[k] = h[k] ?? { open: "18:00", close: "23:00", closed: false }; });
    return out;
  });
  const [loc, setLoc] = useState<PickedLocation | null>(
    store.latitude ? { address_line: store.address_line ?? "", latitude: store.latitude, longitude: store.longitude, city: store.city, state: store.state, postal_code: store.postal_code } : null
  );
  const [saving, setSaving] = useState(false);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setSaving(true);
      const patch = {
        name: form.name, description: form.description, category: form.category,
        cnpj: form.cnpj, whatsapp: form.whatsapp,
        logo_url: form.logo_url, cover_url: form.cover_url, phone: form.phone,
        delivery_fee: Number(form.delivery_fee), min_order: Number(form.min_order),
        delivery_radius_km: Number(form.delivery_radius_km), prep_time_min: Number(form.prep_time_min),
        accepts_pix: form.accepts_pix, accepts_card_online: form.accepts_card_online,
        accepts_cash: form.accepts_cash, accepts_card_on_delivery: form.accepts_card_on_delivery,
        payout_pix_key: form.payout_pix_key, hours,
        ...(loc && { address_line: loc.address_line, city: loc.city, state: loc.state, postal_code: loc.postal_code, latitude: loc.latitude, longitude: loc.longitude }),
      };
      const { error } = await sb.from("stores").update(patch).eq("id", store.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Dados salvos");
      onSaved();
    }}>
      <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
        <ImageUpload bucket="store-assets" label="Logo" aspect="aspect-square" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
        <ImageUpload bucket="store-assets" label="Capa" value={form.cover_url} onChange={(v) => setForm({ ...form, cover_url: v })} />
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Dados da loja</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0000-00" /></div>
        <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Lanches, Pizza..." /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="(11) 90000-0000" /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Endereço da loja</CardTitle></CardHeader><CardContent><LocationPicker value={loc} onChange={setLoc} /></CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Entrega</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-4">
        <div className="space-y-1.5"><Label>Taxa entrega (R$)</Label><Input type="number" step="0.01" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Pedido mín. (R$)</Label><Input type="number" step="0.01" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Raio (km)</Label><Input type="number" step="0.5" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Preparo (min)</Label><Input type="number" value={form.prep_time_min} onChange={(e) => setForm({ ...form, prep_time_min: e.target.value })} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Horário de funcionamento</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {WEEK.map(({ k, label }) => (
          <div key={k} className="flex flex-wrap items-center gap-3 rounded-lg border p-2">
            <div className="w-14 font-medium">{label}</div>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!hours[k].closed} onCheckedChange={(v) => setHours({ ...hours, [k]: { ...hours[k], closed: !v } })} />
              {hours[k].closed ? "Fechado" : "Aberto"}
            </label>
            {!hours[k].closed && (
              <>
                <Input type="time" value={hours[k].open} onChange={(e) => setHours({ ...hours, [k]: { ...hours[k], open: e.target.value } })} className="w-32" />
                <span>até</span>
                <Input type="time" value={hours[k].close} onChange={(e) => setHours({ ...hours, [k]: { ...hours[k], close: e.target.value } })} className="w-32" />
              </>
            )}
          </div>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Formas de pagamento aceitas</CardTitle></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {[
          ["accepts_pix", "Pix (pelo app)"],
          ["accepts_card_online", "Cartão pelo app"],
          ["accepts_cash", "Dinheiro na entrega"],
          ["accepts_card_on_delivery", "Cartão na entrega"],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">{l}</span>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Switch checked={(form as any)[k]} onCheckedChange={(v) => setForm({ ...form, [k]: v })} />
          </label>
        ))}
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Recebimento (PIX para saques)</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1.5"><Label>Chave PIX</Label>
          <Input value={form.payout_pix_key} onChange={(e) => setForm({ ...form, payout_pix_key: e.target.value })} placeholder="CPF, CNPJ, e-mail, telefone ou aleatória" />
          <p className="text-[11px] text-muted-foreground">Chave usada para receber os saques da sua carteira.</p>
        </div>
      </CardContent></Card>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Salvando..." : "Salvar alterações"}</Button>
    </form>
  );
}

// ============ Menu ============
function MenuTab({ storeId }: { storeId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const load = async () => {
    const { data } = await sb.from("products").select("*").eq("store_id", storeId).order("category").order("sort_order");
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [storeId]);
  const filtered = items.filter((p) => filter === "all" || (filter === "active" ? !p.is_paused && p.is_available : p.is_paused));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {(["all", "active", "paused"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "Todos" : f === "active" ? "Ativos" : "Pausados"}
            </Button>
          ))}
        </div>
        <Button onClick={() => setEditing({ store_id: storeId, name: "", price: "", is_available: true })}><Plus className="mr-1 size-4" /> Novo produto</Button>
      </div>
      {filtered.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sem produtos.</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((p) => (
            <Card key={p.id} className="flex gap-3 p-3">
              {p.image_url ? <img src={p.image_url} className="size-16 rounded object-cover" alt="" /> : <div className="grid size-16 place-items-center rounded bg-muted text-muted-foreground"><Package className="size-5" /></div>}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-medium">{p.name}</div>
                  {p.is_paused && <Badge variant="secondary" className="text-[10px]">Pausado</Badge>}
                  {p.stock != null && p.stock <= (p.low_stock_threshold ?? 0) && <Badge variant="destructive" className="text-[10px]">Estoque baixo</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">{p.category ?? "Sem categoria"}</div>
                <div className="mt-1 text-sm">
                  {p.promo_price ? (
                    <><span className="mr-1 text-muted-foreground line-through">{brl(Number(p.price))}</span><span className="font-semibold text-primary">{brl(Number(p.promo_price))}</span></>
                  ) : <span className="font-semibold text-primary">{brl(Number(p.price))}</span>}
                  {p.stock != null && <span className="ml-2 text-xs text-muted-foreground">Est: {p.stock}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch checked={!p.is_paused} onCheckedChange={async (v) => { await sb.from("products").update({ is_paused: !v }).eq("id", p.id); load(); }} />
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Editar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && <ProductDialog product={editing} onClose={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ProductDialog({ product, onClose }: { product: any; onClose: () => void }) {
  const [f, setF] = useState({
    name: product.name ?? "", description: product.description ?? "", price: String(product.price ?? ""),
    promo_price: product.promo_price != null ? String(product.promo_price) : "",
    stock: product.stock != null ? String(product.stock) : "",
    low_stock_threshold: String(product.low_stock_threshold ?? 0),
    category: product.category ?? "", image_url: product.image_url ?? null,
    is_available: product.is_available ?? true, is_paused: product.is_paused ?? false,
  });
  const [saving, setSaving] = useState(false);
  const isNew = !product.id;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/40 sm:items-center" onClick={onClose}>
      <div className="my-4 w-full max-w-lg rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">{isNew ? "Novo produto" : "Editar produto"}</h3>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const payload = {
            store_id: product.store_id, name: f.name, description: f.description,
            price: Number(f.price),
            promo_price: f.promo_price ? Number(f.promo_price) : null,
            stock: f.stock ? Number(f.stock) : null,
            low_stock_threshold: Number(f.low_stock_threshold || 0),
            category: f.category, image_url: f.image_url,
            is_available: f.is_available, is_paused: f.is_paused,
          };
          const { error } = isNew
            ? await sb.from("products").insert(payload)
            : await sb.from("products").update(payload).eq("id", product.id);
          setSaving(false);
          if (error) return toast.error(error.message);
          onClose();
        }}>
          <ImageUpload bucket="product-assets" value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Preço "de" (R$)</Label><Input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Preço promocional (opcional)</Label><Input type="number" step="0.01" value={f.promo_price} onChange={(e) => setF({ ...f, promo_price: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Categoria</Label><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Ex: Hambúrgueres" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Estoque</Label><Input type="number" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })} placeholder="Ilimitado" /></div>
              <div className="space-y-1.5"><Label>Alerta ≤</Label><Input type="number" value={f.low_stock_threshold} onChange={(e) => setF({ ...f, low_stock_threshold: e.target.value })} /></div>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border p-2 text-sm">
            <span>Pausar produto (fica invisível para o cliente)</span>
            <Switch checked={f.is_paused} onCheckedChange={(v) => setF({ ...f, is_paused: v })} />
          </label>
          <div className="flex justify-between gap-2 pt-2">
            {!isNew && <Button type="button" variant="outline" onClick={async () => { if (confirm("Remover produto?")) { await sb.from("products").delete().eq("id", product.id); onClose(); } }}><Trash2 className="mr-1 size-4" /> Remover</Button>}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </form>
        {!isNew && <AddonsEditor productId={product.id} />}
      </div>
    </div>
  );
}

function AddonsEditor({ productId }: { productId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [maxQty, setMaxQty] = useState("1");
  const load = async () => {
    const { data } = await sb.from("product_addons").select("*").eq("product_id", productId).order("sort_order");
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [productId]);

  return (
    <div className="mt-4 space-y-2 border-t pt-3">
      <div className="text-sm font-semibold">Adicionais / Grupos</div>
      <div className="space-y-1">
        {items.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
            <div className="flex-1">
              {a.name} <span className="text-xs text-muted-foreground">— {brl(Number(a.price))}</span>
              <span className="ml-2 text-[10px] text-muted-foreground">{a.is_required ? "Obrigatório" : "Opcional"} • máx {a.max_qty}</span>
            </div>
            <Button size="icon" variant="ghost" onClick={async () => { await sb.from("product_addons").delete().eq("id", a.id); load(); }}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Input placeholder="Nome (ex: Bacon)" value={name} onChange={(e) => setName(e.target.value)} className="col-span-2" />
        <Input placeholder="Preço" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Input placeholder="Máx" type="number" value={maxQty} onChange={(e) => setMaxQty(e.target.value)} />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs"><Switch checked={isRequired} onCheckedChange={setIsRequired} /> Obrigatório</label>
        <Button size="sm" type="button" onClick={async () => {
          if (!name) return;
          await sb.from("product_addons").insert({ product_id: productId, name, price: Number(price || 0), is_required: isRequired, max_qty: Number(maxQty || 1) });
          setName(""); setPrice(""); setMaxQty("1"); setIsRequired(false); load();
        }}><Plus className="mr-1 size-4" /> Adicionar</Button>
      </div>
    </div>
  );
}

// ============ Orders ============
const nextStatus: Record<string, string | null> = {
  pending: "accepted", accepted: "preparing", preparing: "ready", ready: "out_for_delivery", out_for_delivery: "delivered",
};
function OrdersTab({ storeId }: { storeId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);
  const [tab, setTab] = useState<"active" | "history">("active");
  const load = async () => {
    const { data } = await sb.from("orders").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setOrders(data ?? []);
  };
  useEffect(() => {
    load();
    const ch = sb.channel(`store-orders:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [storeId]);

  const groups: Record<string, typeof orders> = { pending: [], accepted: [], preparing: [], ready: [], out_for_delivery: [], delivered: [], cancelled: [] };
  orders.forEach((o) => { (groups[o.status] ??= []).push(o); });
  const active = ["pending", "accepted", "preparing", "ready", "out_for_delivery"];
  const historyGroups = ["delivered", "cancelled"];

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <Button size="sm" variant={tab === "active" ? "default" : "outline"} onClick={() => setTab("active")}>Ativos</Button>
        <Button size="sm" variant={tab === "history" ? "default" : "outline"} onClick={() => setTab("history")}>Histórico</Button>
      </div>
      {(tab === "active" ? active : historyGroups).map((st) => (
        <div key={st}>
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{orderStatusLabel[st]} ({groups[st].length})</div>
          {groups[st].length === 0 ? <div className="mb-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">—</div> : (
            <div className="mb-3 space-y-2">
              {groups[st].map((o) => {
                const next = nextStatus[o.status];
                return (
                  <Card key={o.id} className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-medium">#{o.id.slice(0, 8)}</div>
                          <Badge>{orderStatusLabel[o.status]}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                        <div className="mt-1 text-sm">{brl(Number(o.total))} • {o.payment_method}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Button asChild size="sm" variant="outline"><Link to="/pedidos/$id" params={{ id: o.id }}>Abrir</Link></Button>
                        {next && !["cancelled", "delivered"].includes(o.status) && (
                          <Button size="sm" onClick={async () => {
                            const { error } = await sb.from("orders").update({ status: next }).eq("id", o.id);
                            if (error) return toast.error(error.message);
                            toast.success("Status atualizado");
                          }}>Marcar {orderStatusLabel[next]}</Button>
                        )}
                        {o.status === "pending" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                            if (!confirm("Recusar pedido?")) return;
                            await sb.from("orders").update({ status: "cancelled" }).eq("id", o.id);
                          }}>Recusar</Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============ Finance ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function FinanceTab({ store }: { store: any }) {
  const [balance, setBalance] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data: bal } = await sb.rpc("store_wallet_balance", { _store_id: store.id });
    setBalance(Number(bal ?? 0));
    const { data: e } = await sb.from("store_wallet_entries").select("*").eq("store_id", store.id).order("created_at", { ascending: false }).limit(50);
    setEntries(e ?? []);
    const { data: w } = await sb.from("store_withdrawals").select("*").eq("store_id", store.id).order("requested_at", { ascending: false });
    setWithdrawals(w ?? []);
  };
  useEffect(() => { load(); }, [store.id]);

  const startWeek = useMemo(() => {
    const d = new Date(); const day = d.getDay(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((day + 6) % 7)); // Monday
    return d;
  }, []);
  const withdrawalsThisWeek = withdrawals.filter((w) => new Date(w.requested_at) >= startWeek && w.status !== "rejected");
  const hasFreeUsed = withdrawalsThisWeek.length >= 1;

  const revenueDay = entries.filter((e) => e.kind === "order_credit" && new Date(e.created_at).toDateString() === new Date().toDateString()).reduce((s, e) => s + Number(e.net), 0);
  const revenueMonth = entries.filter((e) => e.kind === "order_credit" && new Date(e.created_at).getMonth() === new Date().getMonth()).reduce((s, e) => s + Number(e.net), 0);

  const requestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (value > balance) return toast.error("Valor acima do saldo disponível");
    if (!store.payout_pix_key) return toast.error("Cadastre uma chave PIX em Minha Loja → Recebimento");
    if (!store.is_online) return toast.error("Sua loja precisa estar ativa para solicitar saque");

    const fee = hasFreeUsed ? Number((value * 0.06).toFixed(2)) : 0;
    if (hasFreeUsed) {
      const ok = confirm(`Você já usou o saque gratuito desta semana. Será aplicada taxa administrativa de 6% (R$ ${fee.toFixed(2)}). Deseja continuar?`);
      if (!ok) return;
    }
    setSaving(true);
    const net = value - fee;
    const { data: w, error } = await sb.from("store_withdrawals").insert({
      store_id: store.id, amount: value, fee, net, pix_key: store.payout_pix_key, status: "pending",
    }).select("id").single();
    if (!error) {
      // Debita da carteira imediatamente (reserva do valor)
      await sb.from("store_wallet_entries").insert({
        store_id: store.id, kind: "withdrawal", gross: -value, fee, net: -value,
        description: `Solicitação de saque #${w.id.slice(0, 8)}`,
      });
      if (fee > 0) {
        await sb.from("store_wallet_entries").insert({
          store_id: store.id, kind: "withdrawal_fee", gross: 0, fee, net: 0,
          description: "Taxa administrativa (2º+ saque na semana)",
        });
      }
    }
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Saque solicitado!");
    setAmount("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo disponível" value={brl(balance)} />
        <StatCard label="Faturamento hoje" value={brl(revenueDay)} />
        <StatCard label="Faturamento do mês" value={brl(revenueMonth)} />
        <StatCard label="Saques na semana" value={withdrawalsThisWeek.length} sub={hasFreeUsed ? "Gratuito usado" : "1 gratuito disponível"} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Solicitar saque via PIX</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={requestWithdrawal}>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" />
            </div>
            <div className="text-xs text-muted-foreground">
              Chave PIX: <span className="font-mono">{store.payout_pix_key ?? "— não cadastrada —"}</span>
            </div>
            <Button type="submit" disabled={saving || balance <= 0}>{saving ? "Enviando..." : "Solicitar saque"}</Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">1 saque gratuito por semana. A partir do 2º saque: taxa administrativa de 6%.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de saques</CardTitle></CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum saque solicitado.</div> : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div>
                    <div className="font-medium">{brl(Number(w.amount))} <span className="text-xs text-muted-foreground">(líquido {brl(Number(w.net))})</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(w.requested_at).toLocaleString("pt-BR")} • {w.pix_key}</div>
                  </div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>{
                    { pending: "Em análise", processing: "Em processamento", paid: "Pago", rejected: "Rejeitado" }[w.status as string] ?? w.status
                  }</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Extrato</CardTitle></CardHeader>
        <CardContent>
          {entries.length === 0 ? <div className="text-sm text-muted-foreground">Sem movimentações.</div> : (
            <div className="divide-y">
              {entries.map((e) => (
                <div key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <div>{e.description ?? e.kind}</div>
                    <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
                  </div>
                  <div className={`font-mono font-semibold ${Number(e.net) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                    {Number(e.net) >= 0 ? "+" : ""}{brl(Number(e.net))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============ Reviews ============
function ReviewsTab({ storeId }: { storeId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reviews, setReviews] = useState<any[]>([]);
  const load = async () => {
    const { data } = await sb.from("store_reviews").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setReviews(data ?? []);
  };
  useEffect(() => { load(); }, [storeId]);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-3">
      <Card><CardContent className="flex items-center justify-between pt-6">
        <div>
          <div className="text-sm text-muted-foreground">Nota média</div>
          <div className="text-3xl font-bold">{avg ? avg.toFixed(1) : "—"}★</div>
        </div>
        <div className="text-sm text-muted-foreground">{reviews.length} avaliações</div>
      </CardContent></Card>
      {reviews.length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma avaliação ainda.</Card> : reviews.map((r) => (
        <Card key={r.id} className="p-3">
          <div className="flex items-center gap-2 text-sm">
            <div className="font-medium">{"★".repeat(r.rating)}<span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span></div>
            <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
          </div>
          {r.comment && <div className="mt-1 text-sm">{r.comment}</div>}
          {r.reply ? (
            <div className="mt-2 rounded-md bg-muted/40 p-2 text-xs"><strong>Resposta:</strong> {r.reply}</div>
          ) : (
            <ReplyForm review={r} onSaved={load} />
          )}
        </Card>
      ))}
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ReplyForm({ review, onSaved }: { review: any; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form className="mt-2 flex gap-2" onSubmit={async (e) => {
      e.preventDefault();
      if (!text.trim()) return;
      setSaving(true);
      const { error } = await sb.from("store_reviews").update({ reply: text, replied_at: new Date().toISOString() }).eq("id", review.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      onSaved();
    }}>
      <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Responder ao cliente..." />
      <Button size="sm" type="submit" disabled={saving}><Reply className="mr-1 size-4" />Responder</Button>
    </form>
  );
}

// ============ Reports ============
function ReportsTab({ storeId }: { storeId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<{ orders: any[]; items: any[] }>({ orders: [], items: [] });
  useEffect(() => {
    (async () => {
      const { data: orders } = await sb.from("orders").select("id,status,total,subtotal,created_at,customer_id").eq("store_id", storeId);
      const { data: items } = await sb.from("order_items").select("product_name, quantity, unit_price, order_id, orders!inner(store_id, status)").eq("orders.store_id", storeId).eq("orders.status", "delivered");
      setData({ orders: orders ?? [], items: items ?? [] });
    })();
  }, [storeId]);

  const delivered = data.orders.filter((o) => o.status === "delivered");
  const now = new Date();
  const byDay: Record<string, number> = {};
  const byHour: Record<number, number> = {};
  delivered.forEach((o) => {
    const d = new Date(o.created_at);
    const k = d.toLocaleDateString("pt-BR");
    byDay[k] = (byDay[k] ?? 0) + Number(o.subtotal);
    byHour[d.getHours()] = (byHour[d.getHours()] ?? 0) + 1;
  });

  const productAgg: Record<string, { qty: number; revenue: number }> = {};
  data.items.forEach((i) => {
    const p = productAgg[i.product_name] ??= { qty: 0, revenue: 0 };
    p.qty += i.quantity; p.revenue += i.quantity * Number(i.unit_price);
  });
  const topProducts = Object.entries(productAgg).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  const worstProducts = Object.entries(productAgg).sort((a, b) => a[1].qty - b[1].qty).slice(0, 5);
  const ticket = delivered.length ? delivered.reduce((s, o) => s + Number(o.total), 0) / delivered.length : 0;
  const bestHour = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];

  const customerAgg: Record<string, number> = {};
  delivered.forEach((o) => { customerAgg[o.customer_id] = (customerAgg[o.customer_id] ?? 0) + 1; });
  const topCustomers = Object.entries(customerAgg).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total de pedidos" value={data.orders.length} />
        <StatCard label="Ticket médio" value={brl(ticket)} />
        <StatCard label="Horário de pico" value={bestHour ? `${bestHour[0]}h` : "—"} sub={bestHour ? `${bestHour[1]} pedidos` : ""} />
      </div>

      <Card><CardHeader><CardTitle className="text-base">Vendas por dia (últimos 30)</CardTitle></CardHeader>
      <CardContent><div className="space-y-1 text-sm">
        {Object.entries(byDay).slice(-30).reverse().map(([k, v]) => (
          <div key={k} className="flex justify-between border-b py-1"><span>{k}</span><span className="font-mono">{brl(v)}</span></div>
        ))}
        {Object.keys(byDay).length === 0 && <div className="text-muted-foreground">Sem dados.</div>}
      </div></CardContent></Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-base">Mais vendidos</CardTitle></CardHeader>
        <CardContent>{topProducts.length === 0 ? <div className="text-sm text-muted-foreground">Sem dados.</div> : topProducts.map(([n, v]) => (
          <div key={n} className="flex justify-between border-b py-1 text-sm"><span>{n}</span><span>{v.qty}× • {brl(v.revenue)}</span></div>
        ))}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Menos vendidos</CardTitle></CardHeader>
        <CardContent>{worstProducts.length === 0 ? <div className="text-sm text-muted-foreground">Sem dados.</div> : worstProducts.map(([n, v]) => (
          <div key={n} className="flex justify-between border-b py-1 text-sm"><span>{n}</span><span>{v.qty}×</span></div>
        ))}</CardContent></Card>
      </div>

      <Card><CardHeader><CardTitle className="text-base">Clientes mais frequentes</CardTitle></CardHeader>
      <CardContent>{topCustomers.length === 0 ? <div className="text-sm text-muted-foreground">Sem dados.</div> : topCustomers.map(([id, n]) => (
        <div key={id} className="flex justify-between border-b py-1 text-sm"><span className="font-mono text-xs">{id.slice(0, 8)}…</span><span>{n} pedidos</span></div>
      ))}</CardContent></Card>

      <div className="text-[10px] text-muted-foreground">Gerado em {now.toLocaleString("pt-BR")}</div>
    </div>
  );
}

// ============ Notifications ============
function NotificationsTab({ storeId }: { storeId: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [items, setItems] = useState<any[]>([]);
  const load = async () => {
    const { data } = await sb.from("store_notifications").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100);
    setItems(data ?? []);
  };
  useEffect(() => {
    load();
    const ch = sb.channel(`store-notifs:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_notifications", filter: `store_id=eq.${storeId}` }, load).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [storeId]);

  const markAllRead = async () => {
    await sb.from("store_notifications").update({ read_at: new Date().toISOString() }).eq("store_id", storeId).is("read_at", null);
    load();
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={markAllRead}>Marcar todas como lidas</Button></div>
      {items.length === 0 ? <Card className="p-6 text-center text-sm text-muted-foreground">Sem notificações.</Card> : items.map((n) => (
        <Card key={n.id} className={`p-3 ${n.read_at ? "opacity-70" : ""}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{n.title}</div>
              {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
              <div className="mt-1 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString("pt-BR")}</div>
            </div>
            {n.order_id && <Button size="sm" variant="ghost" asChild><Link to="/pedidos/$id" params={{ id: n.order_id }}>Abrir</Link></Button>}
          </div>
        </Card>
      ))}
    </div>
  );
}
