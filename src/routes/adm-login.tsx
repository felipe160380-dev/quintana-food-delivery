import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/adm-login")({ component: AdmLogin });

function AdmLogin() {
  const nav = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-sm place-items-center px-4 py-10">
      <Card className="w-full">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="text-primary" />
            <h1 className="text-lg font-bold">Área restrita</h1>
          </div>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setLoading(true);
              try {
                const r = await fetch("/api/public/admin-ensure", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ username, password }),
                });
                const j = await r.json();
                if (!r.ok || !j.ok) throw new Error("Credenciais inválidas");
                const { data, error } = await supabase.auth.signInWithPassword({ email: j.email, password });
                if (error || !data.user) throw new Error(error?.message ?? "Falha no login");
                toast.success("Bem-vindo, administrador");
                nav({ to: "/adm" });
              } catch (err: any) {
                toast.error(err.message ?? "Falha");
              } finally {
                setLoading(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <Label>Usuário</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
