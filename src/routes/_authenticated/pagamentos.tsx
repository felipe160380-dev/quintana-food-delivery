import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { CreditCard, Plus, Trash2, QrCode, Star } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pagamentos")({ component: Page });

type PM = {
  id: string; user_id: string; kind: "pix" | "card"; label: string;
  last4: string | null; brand: string | null; pix_key: string | null; is_default: boolean;
};

function Page() {
  const [items, setItems] = useState<PM[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState<"pix" | "card" | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("payment_methods").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
    setItems((data ?? []) as PM[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setDefault = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("payment_methods").update({ is_default: false }).eq("user_id", u.user.id);
    await supabase.from("payment_methods").update({ is_default: true }).eq("id", id);
    toast.success("Definida como padrão");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover essa forma de pagamento?")) return;
    await supabase.from("payment_methods").delete().eq("id", id);
    load();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Formas de pagamento</h1>
        <p className="text-sm text-muted-foreground">Salve seus cartões e chaves Pix para agilizar os pedidos.</p>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => setShowAdd("card")}><CreditCard className="mr-1 size-4" /> Adicionar cartão</Button>
        <Button variant="outline" onClick={() => setShowAdd("pix")}><QrCode className="mr-1 size-4" /> Adicionar Pix</Button>
      </div>

      {loading ? (
        <Card className="h-24 animate-pulse bg-muted" />
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma forma de pagamento salva.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-3">
              <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                {p.kind === "card" ? <CreditCard className="size-5" /> : <QrCode className="size-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-medium">
                  {p.label}
                  {p.is_default && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"><Star className="size-3" /> padrão</span>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.kind === "card" ? `${p.brand ?? "Cartão"} •••• ${p.last4 ?? ""}` : p.pix_key}
                </div>
              </div>
              {!p.is_default && <Button size="sm" variant="ghost" onClick={() => setDefault(p.id)}>Tornar padrão</Button>}
              <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="size-4" /></Button>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Pix do QuintanaFood</CardTitle></CardHeader>
        <CardContent className="text-sm">
          <p>Se a loja aceita Pix e você quer pagar direto para a plataforma, use a chave:</p>
          <div className="mt-2 rounded-lg border bg-muted/40 p-3 font-mono text-xs">walkerfelipe054@gmail.com</div>
          <p className="mt-2 text-xs text-muted-foreground">Chave Pix Mercado Pago.</p>
        </CardContent>
      </Card>

      {showAdd && <AddDialog kind={showAdd} onClose={() => { setShowAdd(null); load(); }} />}
    </div>
  );
}

function AddDialog({ kind, onClose }: { kind: "pix" | "card"; onClose: () => void }) {
  const [label, setLabel] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [holder, setHolder] = useState("");
  const [number, setNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [isDefault, setDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (isDefault) await supabase.from("payment_methods").update({ is_default: false }).eq("user_id", u.user.id);
    const payload: any = {
      user_id: u.user.id, kind, label: label || (kind === "pix" ? "Pix" : holder || "Cartão"),
      is_default: isDefault,
    };
    if (kind === "pix") payload.pix_key = pixKey;
    else { payload.last4 = number.replace(/\D/g, "").slice(-4); payload.brand = brand || "Cartão"; }
    const { error } = await supabase.from("payment_methods").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Salvo!");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-card p-4 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-bold">{kind === "card" ? "Adicionar cartão" : "Adicionar Pix"}</h3>
        <Tabs value={kind}><TabsList className="hidden"><TabsTrigger value={kind}>x</TabsTrigger></TabsList>
          <TabsContent value="card" className="space-y-3">
            <div className="space-y-1.5"><Label>Titular</Label><Input value={holder} onChange={(e) => setHolder(e.target.value)} placeholder="Nome no cartão" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Número</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" placeholder="•••• •••• •••• 1234" /></div>
              <div className="space-y-1.5"><Label>Bandeira</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Visa / Master…" /></div>
            </div>
            <div className="space-y-1.5"><Label>Apelido do cartão</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Cartão principal" /></div>
            <p className="text-[11px] text-muted-foreground">Guardamos só o apelido e os 4 últimos dígitos para você reconhecer o cartão. O pagamento em si é feito na finalização do pedido.</p>
          </TabsContent>
          <TabsContent value="pix" className="space-y-3">
            <div className="space-y-1.5"><Label>Chave Pix</Label><Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" /></div>
            <div className="space-y-1.5"><Label>Apelido</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Meu Pix pessoal" /></div>
          </TabsContent>
        </Tabs>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm"><Switch checked={isDefault} onCheckedChange={setDefault} /> Tornar padrão</label>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
