import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/conversas")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Conversas — QuintanaFood" },
      { name: "description", content: "Veja o histórico de conversas com as lojas dos seus pedidos no QuintanaFood." },
      { property: "og:title", content: "Conversas — QuintanaFood" },
      { property: "og:description", content: "Histórico de conversas com as lojas dos seus pedidos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Conversation = {
  order_id: string;
  store_id: string;
  store_name: string;
  store_logo_url: string | null;
  order_total: number;
  order_created_at: string;
  order_status: string;
  last_message_body: string;
  last_message_at: string;
  last_message_sender_id: string;
  unread_count: number;
};

const CLOSED = ["delivered", "cancelled"];

function Page() {
  const [rows, setRows] = useState<Conversation[] | null>(null);

  const load = async () => {
    const { data, error } = await supabase.rpc("list_customer_conversations");
    if (error) { console.error(error); setRows([]); return; }
    setRows((data ?? []) as unknown as Conversation[]);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("conversations-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const recentes = (rows ?? []).filter((c) => !CLOSED.includes(c.order_status));
  const finalizadas = (rows ?? []).filter((c) => CLOSED.includes(c.order_status));

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-bold">Conversas</h1>

      <Tabs defaultValue="recentes">
        <TabsList className="w-full">
          <TabsTrigger value="recentes" className="flex-1">Recentes</TabsTrigger>
          <TabsTrigger value="finalizadas" className="flex-1">Finalizadas</TabsTrigger>
        </TabsList>

        <TabsContent value="recentes" className="mt-3">
          <List rows={recentes} loading={rows === null} empty="Nenhuma conversa em andamento." />
        </TabsContent>
        <TabsContent value="finalizadas" className="mt-3">
          <List rows={finalizadas} loading={rows === null} empty="Nenhuma conversa finalizada." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function List({ rows, loading, empty }: { rows: Conversation[]; loading: boolean; empty: string }) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-1.5 py-10 text-center">
        <MessageCircle className="size-6 text-muted-foreground" />
        <div className="text-sm font-medium">{empty}</div>
        <p className="text-xs text-muted-foreground">Suas conversas com as lojas aparecem aqui.</p>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((c) => (
        <Link key={c.order_id} to="/pedidos/$id" params={{ id: c.order_id }} className="block">
          <Card className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3 transition-colors hover:bg-accent/50">
            <Avatar className="size-11">
              {c.store_logo_url && <AvatarImage src={c.store_logo_url} alt={c.store_name} />}
              <AvatarFallback className="text-xs">{c.store_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{c.store_name}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(c.order_created_at).toLocaleDateString("pt-BR")} · {brl(Number(c.order_total))}
              </div>
              <div className={`truncate text-xs ${c.unread_count > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {c.last_message_body}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] text-muted-foreground">
                {new Date(c.last_message_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {c.unread_count > 0 && (
                <Badge className="size-5 justify-center rounded-full p-0 text-[10px] tabular-nums">{c.unread_count}</Badge>
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
