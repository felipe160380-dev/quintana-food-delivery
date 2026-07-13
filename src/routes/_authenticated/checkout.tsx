import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { brl, paymentMethodLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Minus, Plus, ShoppingBag, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/checkout")({ component: Page });

type Addr = { id: string; label: string; street: string; number: string | null; neighborhood: string | null; city: string | null; state: string | null; latitude: number | null; longitude: number | null; is_default: boolean };
type Method = "pix" | "card_online" | "cash_on_delivery" | "card_on_delivery";

function Page() {
  const nav = useNavigate();
  const { state, subtotal, setQty, remove, clear } = useCart();
  const [store, setStore] = useState<any>(null);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [addrId, setAddrId] = useState<string>("");
  const [method, setMethod] = useState<Method>("pix");
  const [notes, setNotes] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (!state.storeId) return;
    supabase.from("stores").select("*").eq("id", state.storeId).maybeSingle().then(({ data }) => setStore(data));
    supabase.from("addresses").select("id,label,street,number,neighborhood,city,state,latitude,longitude,is_default").order("is_default", { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as Addr[];
        setAddrs(list);
        setAddrId(list.find((a) => a.is_default)?.id ?? list[0]?.id ?? "");
      });
  }, [state.storeId]);

  if (!state.storeId || state.items.length === 0) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShoppingBag className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 font-medium">Seu carrinho está vazio</p>
        <Button asChild className="mt-4"><Link to="/">Escolher uma loja</Link></Button>
      </div>
    );
  }

  const deliveryFee = Number(store?.delivery_fee ?? 0);
  const total = subtotal + deliveryFee;
  const availableMethods: Method[] = [];
  if (store?.accepts_pix) availableMethods.push("pix");
  if (store?.accepts_card_online) availableMethods.push("card_online");
  if (store?.accepts_cash) availableMethods.push("cash_on_delivery");
  if (store?.accepts_card_on_delivery) availableMethods.push("card_on_delivery");

  const placeOrder = async () => {
    const addr = addrs.find((a) => a.id === addrId);
    if (!addr) return toast.error("Selecione um endereço de entrega");
    if (subtotal < Number(store?.min_order ?? 0)) return toast.error(`Pedido mínimo ${brl(Number(store.min_order))}`);
    setPlacing(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setPlacing(false); return; }
    const { data: order, error } = await supabase.from("orders").insert({
      customer_id: u.user.id, store_id: state.storeId!,
      address_snapshot: addr,
      subtotal, delivery_fee: deliveryFee, total,
      payment_method: method,
      change_for: method === "cash_on_delivery" && changeFor ? Number(changeFor) : null,
      notes,
    }).select("id").single();
    if (error) { setPlacing(false); return toast.error(error.message); }

    const items = state.items.map((i) => ({
      order_id: order!.id, product_id: i.product_id, product_name: i.product_name,
      unit_price: i.unit_price, quantity: i.quantity,
    }));
    const { error: itErr } = await supabase.from("order_items").insert(items);
    setPlacing(false);
    if (itErr) return toast.error(itErr.message);

    clear();
    toast.success("Pedido enviado!");
    nav({ to: "/pedidos/$id", params: { id: order!.id } });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Finalizar pedido</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">{store?.name}</CardTitle></CardHeader>
        <CardContent className="space-y-2 pt-0">
          {state.items.map((i) => (
            <div key={i.product_id} className="flex items-center gap-3">
              <div className="flex-1"><div className="font-medium">{i.product_name}</div><div className="text-xs text-muted-foreground">{brl(i.unit_price)}</div></div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" className="size-7" onClick={() => (i.quantity <= 1 ? remove(i.product_id) : setQty(i.product_id, i.quantity - 1))}><Minus className="size-3" /></Button>
                <span className="w-6 text-center text-sm">{i.quantity}</span>
                <Button size="icon" variant="outline" className="size-7" onClick={() => setQty(i.product_id, i.quantity + 1)}><Plus className="size-3" /></Button>
              </div>
              <div className="w-16 text-right font-medium">{brl(i.unit_price * i.quantity)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Endereço de entrega</CardTitle><Button variant="ghost" size="sm" asChild><Link to="/enderecos"><MapPin className="mr-1 size-4" /> Gerenciar</Link></Button></CardHeader>
        <CardContent className="pt-0">
          {addrs.length === 0 ? (
            <div className="rounded-lg bg-muted p-3 text-sm">Você ainda não tem endereços. <Link to="/enderecos" className="text-primary underline">Cadastrar agora</Link></div>
          ) : (
            <RadioGroup value={addrId} onValueChange={setAddrId} className="space-y-2">
              {addrs.map((a) => (
                <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary">
                  <RadioGroupItem value={a.id} className="mt-1" />
                  <div className="flex-1 text-sm">
                    <div className="font-medium">{a.label}</div>
                    <div>{a.street}{a.number ? `, ${a.number}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{[a.neighborhood, a.city, a.state].filter(Boolean).join(", ")}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Forma de pagamento</CardTitle></CardHeader>
        <CardContent className="space-y-3 pt-0">
          <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {availableMethods.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary">
                <RadioGroupItem value={m} />
                <span className="text-sm font-medium">{paymentMethodLabel[m]}</span>
              </label>
            ))}
          </RadioGroup>
          {method === "cash_on_delivery" && (
            <div className="space-y-1.5">
              <Label>Troco para</Label>
              <Input type="number" placeholder="Ex: 100" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} />
            </div>
          )}
          {method === "pix" && <p className="rounded-md bg-accent/40 p-2 text-xs">O QR Code Pix será enviado pela loja no chat do pedido. (Integração Mercado Pago em breve.)</p>}
          {method === "card_online" && <p className="rounded-md bg-accent/40 p-2 text-xs">Pagamento com cartão pelo app requer configuração do Mercado Pago. Enquanto isso, escolha Pix ou pagamento na entrega.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
        <CardContent className="pt-0"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: sem cebola, deixar na portaria..." /></CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 pt-6 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
          <div className="flex justify-between"><span>Taxa de entrega</span><span>{deliveryFee > 0 ? brl(deliveryFee) : "Grátis"}</span></div>
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{brl(total)}</span></div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" onClick={placeOrder} disabled={placing || !addrId}>
        {placing ? "Enviando..." : `Fazer pedido — ${brl(total)}`}
      </Button>
    </div>
  );
}
