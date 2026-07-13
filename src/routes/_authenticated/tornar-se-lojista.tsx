import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Store } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tornar-se-lojista")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (roles?.some((r) => r.role === "merchant")) nav({ to: "/lojista" });
      else setChecking(false);
    });
  }, [nav]);

  if (checking) return null;

  const activate = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase.from("user_roles").insert({ user_id: u.user.id, role: "merchant" });
    setLoading(false);
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    toast.success("Perfil de lojista ativado!");
    nav({ to: "/lojista" });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <div className="mb-2 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Store className="size-6" /></div>
          <CardTitle>Vender no Quintana Food</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ative seu perfil de lojista para cadastrar sua loja, publicar produtos com fotos e preços, e controlar
            quando ficar online recebendo pedidos.
          </p>
          <ul className="space-y-1.5 text-sm">
            <li>• Cadastre a loja com endereço, taxa e raio de entrega</li>
            <li>• Aceite Pix, cartão pelo app, dinheiro ou cartão na entrega</li>
            <li>• Fale com o cliente diretamente pelo chat do pedido</li>
          </ul>
          <Button className="w-full" disabled={loading} onClick={activate}>
            {loading ? "Ativando..." : "Ativar perfil de lojista"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
