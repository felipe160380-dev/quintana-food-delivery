import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, orderStatusLabel, paymentMethodLabel } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Send, MapPin } from "lucide-react";
import { toast } from "sonner";
import { ReviewBox } from "@/components/ReviewBox";

export const Route = createFileRoute("/_authenticated/pedidos/$id")({ component: Page });

type Msg = { id: string; body: string; sender_id: string; created_at: string };

function Page() {
  const { id } = Route.useParams();
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
      const { data: o } = await supabase.from("orders").select("*, store:stores(name,logo_url,phone)").eq("id", id).maybeSingle();
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

  const send = async () => {
    if (!text.trim() || !me) return;
    const { error } = await supabase.from("messages").insert({ order_id: id, sender_id: me, body: text.trim() });
    if (error) return toast.error(error.message);
    setText("");
  };

  if (!order) return <div className="p-10 text-center text-muted-foreground">Carregando...</div>;

  const addr = order.address_snapshot ?? {};

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Button variant="ghost" size="sm" asChild><Link to="/pedidos"><ArrowLeft className="mr-1 size-4" /> Meus pedidos</Link></Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">{order.store?.name}</CardTitle>
            <div className="text-xs text-muted-foreground">Pedido #{id.slice(0, 8)}</div>
          </div>
          <Badge>{orderStatusLabel[order.status] ?? order.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground"><MapPin className="size-3" /> Entrega em</div>
            <div>{addr.street}{addr.number ? `, ${addr.number}` : ""} — {[addr.neighborhood, addr.city].filter(Boolean).join(", ")}</div>
          </div>
          <div className="space-y-1">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between"><span>{i.quantity}× {i.product_name}</span><span>{brl(Number(i.unit_price) * i.quantity)}</span></div>
            ))}
          </div>
          <div className="border-t pt-2 text-xs text-muted-foreground">Pagamento: <span className="font-medium text-foreground">{paymentMethodLabel[order.payment_method]}</span></div>
          <div className="flex justify-between text-base font-bold"><span>Total</span><span>{brl(Number(order.total))}</span></div>
          {order.notes && <div className="rounded bg-muted p-2 text-xs"><b>Obs:</b> {order.notes}</div>}
        </CardContent>
      </Card>
      {order.status === "delivered" && me && (
        <ReviewBox orderId={order.id} storeId={order.store_id} customerId={me} />
      )}


      <Card>
        <CardHeader><CardTitle className="text-base">Chat com a loja</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Envie uma mensagem para a loja se precisar de ajuda.</div>
            ) : messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender_id === me ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.sender_id === me ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
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
