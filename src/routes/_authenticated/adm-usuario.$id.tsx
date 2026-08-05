import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export const Route = createFileRoute("/_authenticated/adm-usuario/$id")({
  component: UserDetail,
  head: () => ({
    meta: [
      { title: "Detalhes do usuário — Admin MiPede" },
      { name: "description", content: "Perfil, papéis e histórico de pedidos do usuário no painel administrativo do MiPede." },
      { property: "og:title", content: "Detalhes do usuário — Admin MiPede" },
      { property: "og:description", content: "Perfil, papéis e histórico de pedidos do usuário no painel administrativo do MiPede." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function UserDetail() {
  const { id } = Route.useParams();
  const { roles, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const isAdmin = roles.includes("admin");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !isAdmin) { toast.error("Acesso restrito a administradores"); nav({ to: "/" }); }
  }, [authLoading, isAdmin, nav]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: p } = await sb.from("profiles").select("id, full_name, phone, avatar_url, created_at").eq("id", id).maybeSingle();
      setProfile(p);
      const { data: r } = await sb.from("user_roles").select("role").eq("user_id", id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUserRoles((r ?? []).map((x: any) => x.role));
      const { data: o } = await sb.from("orders").select("id, status, total, payment_method, created_at")
        .eq("customer_id", id).order("created_at", { ascending: false }).limit(100);
      setOrders(o ?? []);
      setLoading(false);
    })();
  }, [id, isAdmin]);

  if (authLoading || loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;
  if (!isAdmin) return null;
  if (!profile) return <div className="p-10 text-center text-sm text-muted-foreground">Usuário não encontrado.</div>;

  return (
    <div className="container mx-auto max-w-3xl p-4 pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link to="/adm"><ArrowLeft className="mr-1 size-4" /> Voltar</Link></Button>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Perfil</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-lg font-bold">{profile.full_name ?? "Sem nome"}</p>
          <p className="text-muted-foreground">Telefone: {profile.phone ?? "—"}</p>
          <p className="text-muted-foreground">Cadastro: {new Date(profile.created_at).toLocaleString("pt-BR")}</p>
          <p className="text-xs text-muted-foreground">ID: <span className="font-mono">{profile.id}</span></p>
          <div className="flex flex-wrap gap-1 pt-1">
            {userRoles.length === 0 ? <span className="text-xs text-muted-foreground">sem papéis</span> : userRoles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            O e-mail de acesso não é exibido aqui por segurança — ele fica somente no sistema de autenticação.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pedidos realizados</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {orders.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum pedido.</p> : orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
              <div>
                <p className="font-mono text-xs">#{o.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")} · {o.payment_method}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>
                <span className="font-semibold">{brl(Number(o.total))}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
