import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";

type Msg = { id: string; body: string; sender_id: string; created_at: string; thread?: string };

export function OrderChat({
  orderId,
  thread,
  closed,
  emptyHint,
  className,
}: {
  orderId: string;
  thread: "store" | "courier";
  closed: boolean;
  emptyHint: string;
  className?: string;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMe(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    let active = true;
    supabase
      .from("messages")
      .select("*")
      .eq("order_id", orderId)
      .eq("thread", thread)
      .order("created_at")
      .then(({ data }) => { if (active) setMessages((data ?? []) as Msg[]); });

    const ch = supabase
      .channel(`order-chat:${orderId}:${thread}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `order_id=eq.${orderId}` }, (p) => {
        const m = p.new as Msg;
        if ((m.thread ?? "store") !== thread) return;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [orderId, thread]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!me || messages.length === 0) return;
    if (!messages.some((m) => m.sender_id !== me)) return;
    supabase.rpc("mark_conversation_read", { _order_id: orderId, _thread: thread }).then(({ error }) => {
      if (error) console.error(error);
    });
  }, [orderId, thread, me, messages.length]);

  const send = async () => {
    if (!text.trim() || !me) return;
    const { error } = await supabase.from("messages").insert({ order_id: orderId, sender_id: me, body: text.trim(), thread });
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    setText("");
  };

  return (
    <div className={className}>
      <div ref={listRef} className="max-h-80 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-8 text-center">
            <MessageCircle className="size-6 text-muted-foreground" />
            <div className="text-sm font-medium">Nenhuma mensagem ainda</div>
            <p className="text-xs text-muted-foreground">{emptyHint}</p>
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
        {closed ? (
          <div className="w-full py-2 text-center text-xs text-muted-foreground">
            Chat encerrado — este pedido já foi finalizado.
          </div>
        ) : (
          <>
            <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escreva uma mensagem..." />
            <Button onClick={send} size="icon" aria-label="Enviar mensagem"><Send className="size-4" /></Button>
          </>
        )}
      </div>
    </div>
  );
}
