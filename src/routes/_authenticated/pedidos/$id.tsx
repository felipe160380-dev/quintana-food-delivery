import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, orderStatusLabel, paymentMethodLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, MapPin, CheckCircle2, Timer, Home, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { ReviewBox } from "@/components/ReviewBox";
import { OrderTimeline } from "@/components/OrderTimeline";
import { DeliveryMap } from "@/components/DeliveryMap";
import { useCourierPosition, useOrderEvents } from "@/hooks/use-order-tracking";

export const Route = createFileRoute("/_authenticated/pedidos/$id")({
  validateSearch: (search: Record<string, unknown>): { novo?: boolean } =>
    search.novo === true || search.novo === "1" ? { novo: true } : {},

  component: Page,
});


type Msg = { id: string; body: string; sender_id: string; created_at: string };

function Page() {
  const { id } = Route.useParams();
  const { novo } = Route.useSearch();

  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    const load = async () => {
      const { data: o } = await supabase.from("orders").select("*, store:stores(name,logo_url,phone,latitude,longitude,prep_time_min)").eq("id", id).maybeSingle();
      setOrder(o);
      const { data: it } = await supabase.from("order_items").select("*, addons:order_item_addons(*)").eq("order_id", id);
      setItems(it ?? []);
      const { data: msgs } = await supabase.from("messages").select("*").eq("order_id", id).order("created_at");
      setMessages((msgs ?? []) as Msg[]);
    };
    load();

    const ch = supabase.channel(`order:${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${id}` }, (p) => {
        setMessages((prev) => [...prev, p.new as Msg]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${id}` }, (p) => {
        setOrder((prev: any) => ({ ...prev, ...(p.new as any) }));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!me || messages.length === 0) return;
    if (!messages.some((m) => m.sender_id !== me)) return;
    supabase.rpc("mark_conversation_read", { _order_id: id }).then(({ error }) => {
      if (error) console.error(error);
    });
  }, [id, me, messages.length]);

  const events = useOrderEvents(id);
  const courierPos = useCourierPosition(id, order?.status === "out_for_delivery");


  const send = async () => {
    if (!text.trim() || !me) return;
    const { error } = await supabase.from("messages").insert({ order_id: id, sender_id: me, body: text.trim() });
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    setText("");
  };

  if (!order) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <Card className="space-y-3 p-4">
          <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
        </Card>
      </div>
    );
  }

  const addr = order.address_snapshot ?? {};
  const isCustomer = !!me && order.customer_id === me;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/pedidos"><ArrowLeft className="mr-1 size-4" /> Meus pedidos</Link>
      </Button>

      {novo && (
        <Card className="animate-fade-in border-success/40 bg-success/5 p-5 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-success text-success-foreground">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-3 text-lg font-bold">Pedido realizado!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A loja já recebeu seu pedido e vai confirmar em instantes.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Pedido</div>
              <div className="text-sm font-semibold">#{id.slice(0, 8)}</div>
            </div>
            <div className="rounded-xl border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Valor</div>
              <div className="text-sm font-semibold tabular-nums">{brl(Number(order.total))}</div>
            </div>
            <div className="rounded-xl border bg-card p-2">
              <div className="text-[10px] uppercase text-muted-foreground">Estimativa</div>
              <div className="inline-flex items-center gap-1 text-sm font-semibold">
                <Timer className="size-3.5" /> ~{order.store?.prep_time_min ?? 30} min
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => document.getElementById("acompanhamento")?.scrollIntoView({ behavior: "smooth" })}>
              Acompanhar pedido
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <Link to="/"><Home className="mr-1.5 size-4" /> Voltar para a Home</Link>
            </Button>
          </div>
        </Card>
      )}

      <Card id="acompanhamento">
        <CardHeader><CardTitle className="text-base">Acompanhamento</CardTitle></CardHeader>
        <CardContent className="space-y-4 pt-0">
          {order.status === "out_for_delivery" && (
            <DeliveryMap
              label="Entrega em andamento"
              courier={courierPos ? { lat: courierPos.latitude, lng: courierPos.longitude } : null}
              destination={addr.latitude && addr.longitude ? { lat: Number(addr.latitude), lng: Number(addr.longitude) } : null}
              store={order.store?.latitude && order.store?.longitude ? { lat: Number(order.store.latitude), lng: Number(order.store.longitude) } : null}
            />
          )}
          <OrderTimeline status={order.status} events={events} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{order.store?.name}</CardTitle>
            <div className="text-xs text-muted-foreground">Pedido #{id.slice(0, 8)}</div>
          </div>
          <Badge variant={order.status === "cancelled" ? "destructive" : "default"}>
            {orderStatusLabel[order.status] ?? order.status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">

          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground"><MapPin className="size-3" /> Entrega em</div>
            <div>{addr.street}{addr.number ? `, ${addr.number}` : ""} — {[addr.neighborhood, addr.city].filter(Boolean).join(", ")}</div>
          </div>
          <div className="space-y-2">
            {items.map((i) => {
              const addSum = (i.addons ?? []).reduce((s: number, a: any) => s + Number(a.price) * a.quantity, 0);
              return (
                <div key={i.id}>
                  <div className="flex justify-between gap-3"><span className="min-w-0 break-words">{i.quantity}× {i.product_name}</span><span className="shrink-0 tabular-nums">{brl((Number(i.unit_price) + addSum) * i.quantity)}</span></div>
                  {(i.addons ?? []).length > 0 && (
                    <ul className="ml-4 mt-0.5 text-xs text-muted-foreground">
                      {(i.addons ?? []).map((a: any) => <li key={a.id}>+ {a.quantity}× {a.name} ({brl(Number(a.price))})</li>)}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t pt-2 text-xs text-muted-foreground">Pagamento: <span className="font-medium text-foreground">{paymentMethodLabel[order.payment_method]}</span></div>
          {["pix", "card_online"].includes(order.payment_method) && order.payment_status !== "paid" && order.status !== "cancelled" && (
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 text-xs leading-relaxed">
              Aguardando confirmação do pagamento. A loja recebe o pedido assim que o pagamento for aprovado.
            </div>
          )}

          <div className="flex justify-between text-base font-bold"><span>Total</span><span className="tabular-nums">{brl(Number(order.total))}</span></div>
          {order.status === "out_for_delivery" && order.delivery_code && isCustomer && (
            <div className="rounded-xl border-2 border-primary bg-primary/5 p-3 text-center">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Código de entrega</div>
              <div className="my-1 font-mono text-3xl tracking-widest text-primary">{order.delivery_code}</div>
              <div className="text-xs text-muted-foreground">Informe estes 4 dígitos ao entregador na chegada.</div>
            </div>
          )}
          {order.notes && <div className="rounded-lg bg-muted p-2.5 text-xs leading-relaxed"><b>Obs:</b> {order.notes}</div>}
        </CardContent>
      </Card>
      {order.status === "delivered" && isCustomer && (
        <>
          <ReviewBox orderId={order.id} storeId={order.store_id} customerId={me!} />
          <CourierRating orderId={order.id} initial={order.courier_rating} />
        </>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Chat com a loja</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <MessageCircle className="size-6 text-muted-foreground" />
                <div className="text-sm font-medium">Nenhuma mensagem ainda</div>
                <p className="text-xs text-muted-foreground">Fale com a loja se precisar de ajuda com o pedido.</p>
              </div>
            ) : messages.map((m) => (

              <div key={m.id} className={`flex ${m.sender_id === me ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] break-words rounded-2xl px-3 py-1.5 text-sm ${m.sender_id === me ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <div>{m.body}</div>
                  <div className={`mt-0.5 text-[10px] ${m.sender_id === me ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 border-t p-2">
            {["delivered", "cancelled"].includes(order.status) ? (
              <div className="w-full py-2 text-center text-xs text-muted-foreground">
                Chat encerrado — este pedido já foi finalizado.
              </div>
            ) : (
              <>
                <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva uma mensagem..." />
                <Button onClick={send} size="icon"><Send className="size-4" /></Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CourierRating({ orderId, initial }: { orderId: string; initial: number | null }) {
  const [rating, setRating] = useState<number>(initial ?? 0);
  const [comment, setComment] = useState("");
  const [saved, setSaved] = useState(!!initial);
  if (saved) return <Card className="p-4 text-center text-sm text-muted-foreground">✅ Você avaliou o entregador.</Card>;
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold">Avalie o entregador</div>
      <div className="mb-2 flex gap-1">
        {[1,2,3,4,5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className={`text-2xl ${n <= rating ? "text-primary" : "text-muted-foreground"}`}>★</button>
        ))}
      </div>
      <Input placeholder="Comentário (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button
        className="mt-2 w-full"
        disabled={rating < 1}
        onClick={async () => {
          const { error } = await supabase.rpc("rate_courier", { _order_id: orderId, _rating: rating, _comment: comment || "" });
          if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
          toast.success("Obrigado pela avaliação!");
          setSaved(true);
        }}
      >Enviar avaliação</Button>
    </Card>
  );
}
