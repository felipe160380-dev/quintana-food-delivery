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
import { MpPaymentDialog, type MpMode } from "@/components/MpPaymentDialog";
import { EmptyState } from "@/components/ui-states";


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
  const [payDialog, setPayDialog] = useState<{ orderId: string; amount: number; mode: MpMode } | null>(null);

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
      <div className="mx-auto max-w-md px-4 py-10">
        <EmptyState
          icon={<ShoppingBag className="size-6" />}
          title="Seu carrinho está vazio"
          description="Escolha uma loja aberta e monte seu pedido em poucos toques."
          action={<Button asChild><Link to="/">Escolher uma loja</Link></Button>}
        />
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

    // O pedido inteiro (itens + adicionais) é criado numa única transação no
    // servidor, que recalcula todos os preços a partir do banco.
    const { data: orderId, error } = await supabase.rpc("create_order", {
      _store_id: state.storeId!,
      _address: addr as any,
      _payment_method: method,
      _change_for: (method === "cash_on_delivery" && changeFor ? Number(changeFor) : null) as unknown as number,
      _notes: notes,
      _items: state.items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        notes: i.notes ?? null,
        addons: (i.addons ?? [])
          .filter((a) => a.addon_id)
          .map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })),
      })) as any,
    });
    setPlacing(false);
    if (error || !orderId) { console.error(error); { const m = error?.message ?? ""; return toast.error(/[À-ÿ]/.test(m) ? m : "Não foi possível criar o pedido. Tente novamente."); } }

    if (method === "pix" || method === "card_online") {
      // Abre pagamento Mercado Pago; carrinho só é limpo após confirmação/fechamento.
      setPayDialog({ orderId, amount: total, mode: method === "pix" ? "pix" : "card" });
      return;
    }

    clear();
    toast.success("Pedido enviado!");
    nav({ to: "/pedidos/$id", params: { id: orderId }, search: { novo: true } });
  };


  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 pt-6 pad-action-bar">
      <h1 className="text-2xl font-bold tracking-tight">Finalizar pedido</h1>


      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <CardTitle className="truncate text-base">{store?.name}</CardTitle>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link to="/">Adicionar itens</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {state.items.map((i) => {
            const lineTotal = (i.unit_price + (i.addons ?? []).reduce((s, a) => s + a.price * a.quantity, 0)) * i.quantity;
            return (
              <div key={i.line_id} className="flex items-start gap-3 border-b pb-3 last:border-0 last:pb-0">
                {i.image_url && (
                  <img src={i.image_url} alt="" loading="lazy" className="size-14 shrink-0 rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-snug">{i.product_name}</div>
                  <div className="text-xs text-muted-foreground">{brl(i.unit_price)}</div>
                  {i.addons && i.addons.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {i.addons.map((a, idx) => (
                        <li key={idx}>+ {a.quantity}× {a.name} ({brl(a.price)})</li>
                      ))}
                    </ul>
                  )}
                  {i.notes && <div className="mt-1 text-xs italic text-muted-foreground">"{i.notes}"</div>}
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex items-center gap-0.5 rounded-full border p-0.5">
                      <Button
                        size="icon" variant="ghost" className="size-7 rounded-full" aria-label="Diminuir"
                        onClick={() => (i.quantity <= 1 ? remove(i.line_id!) : setQty(i.line_id!, i.quantity - 1))}
                      ><Minus className="size-3" /></Button>
                      <span className="w-5 text-center text-sm font-semibold tabular-nums">{i.quantity}</span>
                      <Button
                        size="icon" variant="ghost" className="size-7 rounded-full" aria-label="Aumentar"
                        onClick={() => setQty(i.line_id!, i.quantity + 1)}
                      ><Plus className="size-3" /></Button>
                    </div>
                    <span className="text-sm font-bold tabular-nums">{brl(lineTotal)}</span>
                  </div>
                </div>
              </div>
            );
          })}
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
          {method === "pix" && <p className="rounded-lg bg-accent/40 p-2.5 text-xs leading-relaxed">Você verá o QR Code Pix na próxima etapa e a confirmação é automática.</p>}
          {method === "card_online" && <p className="rounded-lg bg-accent/40 p-2.5 text-xs leading-relaxed">Pagamento seguro com cartão dentro do app, na próxima etapa.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
        <CardContent className="pt-0"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: sem cebola, deixar na portaria..." rows={3} /></CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1.5 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{brl(subtotal)}</span></div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taxa de entrega</span>
            <span className="tabular-nums">{deliveryFee > 0 ? brl(deliveryFee) : <span className="font-semibold text-success">Grátis</span>}</span>
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span className="tabular-nums">{brl(total)}</span></div>
        </CardContent>
      </Card>

      {/* Barra de ação fixa: sempre visível, acima da navegação inferior e da safe-area. */}
      <div className="action-bar border-t bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <Button size="lg" className="h-12 w-full text-base" onClick={placeOrder} disabled={placing || !addrId}>
            {placing ? "Enviando pedido..." : `Fazer pedido · ${brl(total)}`}
          </Button>
          {!addrId && <p className="mt-1.5 text-center text-xs text-muted-foreground">Selecione um endereço de entrega para continuar.</p>}
        </div>
      </div>



      {payDialog && (
        <MpPaymentDialog
          orderId={payDialog.orderId}
          amount={payDialog.amount}
          mode={payDialog.mode}
          onPaid={() => {
            const id = payDialog.orderId;
            setPayDialog(null);
            clear();
            toast.success("Pedido confirmado!");
            nav({ to: "/pedidos/$id", params: { id }, search: { novo: true } });
          }}
          onClose={() => {
            const id = payDialog.orderId;
            setPayDialog(null);
            clear();
            toast.message("Você pode concluir o pagamento na tela do pedido.");
            nav({ to: "/pedidos/$id", params: { id }, search: { novo: true } });
          }}
        />
      )}
    </div>
  );
}
