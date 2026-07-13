import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "@/components/ImageUpload";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { brl, orderStatusLabel, slugify } from "@/lib/format";
import { toast } from "sonner";
import { Store as StoreIcon, Plus, Trash2, Package, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lojista/")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<any>(null);
  const [isMerchant, setIsMerchant] = useState(false);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    const merchant = roles?.some((r) => r.role === "merchant");
    setIsMerchant(!!merchant);
    if (!merchant) { setLoading(false); return; }
    const { data: s } = await supabase.from("stores").select("*").eq("owner_id", u.user.id).maybeSingle();
    setStore(s);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;
  if (!isMerchant) {
    nav({ to: "/tornar-se-lojista" });
    return null;
  }
  if (!store) return <StoreCreate onCreated={load} />;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{store.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={store.is_online ? "default" : "secondary"}>{store.is_online ? "Online" : "Offline"}</Badge>
            <Link to="/loja/$slug" params={{ slug: store.slug }} className="text-primary hover:underline">Ver como cliente →</Link>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
          <span className="text-sm">{store.is_online ? "No ar" : "Fora do ar"}</span>
          <Switch
            checked={store.is_online}
            onCheckedChange={async (v) => {
              const { error } = await supabase.from("stores").update({ is_online: v }).eq("id", store.id);
              if (error) return toast.error(error.message);
              toast.success(v ? "Loja no ar!" : "Loja pausada");
              load();
            }}
          />
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders"><MessageSquare className="mr-1 size-4" /> Pedidos</TabsTrigger>
          <TabsTrigger value="menu"><Package className="mr-1 size-4" /> Cardápio</TabsTrigger>
          <TabsTrigger value="store"><StoreIcon className="mr-1 size-4" /> Minha loja</TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-4"><OrdersTab storeId={store.id} /></TabsContent>
        <TabsContent value="menu" className="mt-4"><MenuTab storeId={store.id} /></TabsContent>
        <TabsContent value="store" className="mt-4"><StoreEdit store={store} onSaved={load} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StoreCreate({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Card>
        <CardHeader><CardTitle>Criar sua loja</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const { data: u } = await supabase.auth.getUser();
            if (!u.user) return;
            const base = slugify(name);
            const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
            const { error } = await supabase.from("stores").insert({ owner_id: u.user.id, name, slug });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success("Loja criada! Complete os dados para ficar online.");
            onCreated();
          }}>
            <div className="space-y-1.5"><Label>Nome da loja</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
            <Button className="w-full" type="submit" disabled={saving}>{saving ? "Criando..." : "Criar loja"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function StoreEdit({ store, onSaved }: { store: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: store.name, description: store.description ?? "", category: store.category ?? "",
    logo_url: store.logo_url as string | null, cover_url: store.cover_url as string | null,
    phone: store.phone ?? "",
    delivery_fee: String(store.delivery_fee ?? 0),
    min_order: String(store.min_order ?? 0),
    delivery_radius_km: String(store.delivery_radius_km ?? 5),
    prep_time_min: String(store.prep_time_min ?? 30),
    accepts_pix: store.accepts_pix, accepts_card_online: store.accepts_card_online,
    accepts_cash: store.accepts_cash, accepts_card_on_delivery: store.accepts_card_on_delivery,
  });
  const [loc, setLoc] = useState<PickedLocation | null>(
    store.latitude ? { address_line: store.address_line ?? "", latitude: store.latitude, longitude: store.longitude, city: store.city, state: store.state, postal_code: store.postal_code } : null
  );
  const [saving, setSaving] = useState(false);

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setSaving(true);
      const patch: any = {
        name: form.name, description: form.description, category: form.category,
        logo_url: form.logo_url, cover_url: form.cover_url, phone: form.phone,
        delivery_fee: Number(form.delivery_fee), min_order: Number(form.min_order),
        delivery_radius_km: Number(form.delivery_radius_km), prep_time_min: Number(form.prep_time_min),
        accepts_pix: form.accepts_pix, accepts_card_online: form.accepts_card_online,
        accepts_cash: form.accepts_cash, accepts_card_on_delivery: form.accepts_card_on_delivery,
      };
      if (loc) Object.assign(patch, {
        address_line: loc.address_line, city: loc.city, state: loc.state, postal_code: loc.postal_code,
        latitude: loc.latitude, longitude: loc.longitude,
      });
      const { error } = await supabase.from("stores").update(patch).eq("id", store.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Dados salvos");
      onSaved();
    }}>
      <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
        <ImageUpload bucket="store-assets" label="Logo" aspect="aspect-square" value={form.logo_url} onChange={(v) => setForm({ ...form, logo_url: v })} />
        <ImageUpload bucket="store-assets" label="Capa" value={form.cover_url} onChange={(v) => setForm({ ...form, cover_url: v })} />
      </CardContent></Card>

      <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2"><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ex: Lanches, Pizza..." /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Localização da loja</CardTitle></CardHeader><CardContent><LocationPicker value={loc} onChange={setLoc} /></CardContent></Card>

      <Card><CardContent className="grid gap-4 pt-6 sm:grid-cols-4">
        <div className="space-y-1.5"><Label>Taxa entrega (R$)</Label><Input type="number" step="0.01" value={form.delivery_fee} onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Pedido mín. (R$)</Label><Input type="number" step="0.01" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Raio (km)</Label><Input type="number" step="0.5" value={form.delivery_radius_km} onChange={(e) => setForm({ ...form, delivery_radius_km: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Preparo (min)</Label><Input type="number" value={form.prep_time_min} onChange={(e) => setForm({ ...form, prep_time_min: e.target.value })} /></div>
      </CardContent></Card>

      <Card><CardHeader><CardTitle className="text-base">Formas de pagamento aceitas</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">
        {[
          ["accepts_pix", "Pix (pelo app)"],
          ["accepts_card_online", "Cartão pelo app"],
          ["accepts_cash", "Dinheiro na entrega"],
          ["accepts_card_on_delivery", "Cartão na entrega"],
        ].map(([k, l]) => (
          <label key={k} className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">{l}</span>
            <Switch checked={(form as any)[k]} onCheckedChange={(v) => setForm({ ...form, [k]: v })} />
          </label>
        ))}
      </CardContent></Card>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Salvando..." : "Salvar alterações"}</Button>
    </form>
  );
}

function MenuTab({ storeId }: { storeId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").eq("store_id", storeId).order("category").order("sort_order");
    setItems(data ?? []);
  };
  useEffect(() => { load(); }, [storeId]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({ store_id: storeId, name: "", price: "", is_available: true })}><Plus className="mr-1 size-4" /> Novo produto</Button>
      </div>
      {items.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">Sem produtos ainda.</Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((p) => (
            <Card key={p.id} className="flex gap-3 p-3">
              {p.image_url ? <img src={p.image_url} className="size-16 rounded object-cover" alt="" /> : <div className="grid size-16 place-items-center rounded bg-muted text-muted-foreground"><Package className="size-5" /></div>}
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.category ?? "Sem categoria"}</div>
                <div className="mt-1 text-sm font-semibold text-primary">{brl(Number(p.price))}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch checked={p.is_available} onCheckedChange={async (v) => { await supabase.from("products").update({ is_available: v }).eq("id", p.id); load(); }} />
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

function ProductDialog({ product, onClose }: { product: any; onClose: () => void }) {
  const [f, setF] = useState({
    name: product.name ?? "", description: product.description ?? "", price: String(product.price ?? ""),
    category: product.category ?? "", image_url: product.image_url ?? null, is_available: product.is_available ?? true,
  });
  const [saving, setSaving] = useState(false);
  const isNew = !product.id;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">{isNew ? "Novo produto" : "Editar produto"}</h3>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const payload: any = {
            store_id: product.store_id, name: f.name, description: f.description,
            price: Number(f.price), category: f.category, image_url: f.image_url, is_available: f.is_available,
          };
          const { error } = isNew
            ? await supabase.from("products").insert(payload)
            : await supabase.from("products").update(payload).eq("id", product.id);
          setSaving(false);
          if (error) return toast.error(error.message);
          onClose();
        }}>
          <ImageUpload bucket="product-assets" value={f.image_url} onChange={(v) => setF({ ...f, image_url: v })} />
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label>Descrição</Label><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Preço (R$)</Label><Input type="number" step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required /></div>
            <div className="space-y-1.5"><Label>Categoria</Label><Input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="Ex: Hambúrgueres" /></div>
          </div>
          <div className="flex justify-between gap-2 pt-2">
            {!isNew && <Button type="button" variant="outline" onClick={async () => { if (confirm("Remover produto?")) { await supabase.from("products").delete().eq("id", product.id); onClose(); } }}><Trash2 className="mr-1 size-4" /> Remover</Button>}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

const nextStatus: Record<string, string | null> = {
  pending: "accepted", accepted: "preparing", preparing: "ready", ready: "out_for_delivery", out_for_delivery: "delivered",
};

function OrdersTab({ storeId }: { storeId: string }) {
  const [orders, setOrders] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase.from("orders").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setOrders(data ?? []);
  };
  useEffect(() => {
    load();
    const ch = supabase.channel(`store-orders:${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `store_id=eq.${storeId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [storeId]);

  if (orders.length === 0) return <Card className="p-6 text-center text-sm text-muted-foreground">Nenhum pedido ainda.</Card>;

  return (
    <div className="space-y-2">
      {orders.map((o) => {
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
                    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
                    if (error) return toast.error(error.message);
                    toast.success("Status atualizado");
                  }}>Marcar como {orderStatusLabel[next]}</Button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
