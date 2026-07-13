import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { UtensilsCrossed } from "lucide-react";

type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/auth" });
  const redirectTo = () => nav({ to: search.redirect ?? "/" });

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-md place-items-center px-4 py-10">
      <div className="w-full">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <UtensilsCrossed className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Bem-vindo à Quintana Food</h1>
          <p className="text-sm text-muted-foreground">Peça a comida que você ama, do jeito que quiser pagar.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin"><SignIn onDone={redirectTo} /></TabsContent>
              <TabsContent value="signup"><SignUp onDone={redirectTo} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GoogleButton() {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
        if (r.error) { toast.error("Falha ao entrar com Google"); setLoading(false); }
      }}
    >
      {loading ? "Abrindo Google..." : "Continuar com Google"}
    </Button>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (error) return toast.error(error.message);
        toast.success("Bem-vindo!");
        onDone();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="email-in">E-mail</Label>
        <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password-in">Senha</Label>
        <Input id="password-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Entrando..." : "Entrar"}</Button>
      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="bg-card px-2">ou</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
      </div>
      <GoogleButton />
    </form>
  );
}

function SignUp({ onDone }: { onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"customer" | "merchant" | "courier">("customer");
  const [loading, setLoading] = useState(false);

  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: window.location.origin },
        });
        if (error) { setLoading(false); return toast.error(error.message); }
        if (data.user && role !== "customer") {
          const { error: roleErr } = await supabase.from("user_roles").insert({ user_id: data.user.id, role });
          if (roleErr) console.warn(roleErr);
        }
        setLoading(false);
        toast.success("Conta criada!");
        onDone();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome completo</Label>
        <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Telefone</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email-up">E-mail</Label>
          <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pw">Senha</Label>
        <Input id="pw" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label>Como você quer usar?</Label>
        <RadioGroup value={role} onValueChange={(v) => setRole(v as typeof role)} className="grid grid-cols-1 gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60">
            <RadioGroupItem value="customer" className="mt-0.5" />
            <div><div className="font-medium">Cliente</div><div className="text-xs text-muted-foreground">Fazer pedidos nas lojas</div></div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60">
            <RadioGroupItem value="merchant" className="mt-0.5" />
            <div><div className="font-medium">Lojista</div><div className="text-xs text-muted-foreground">Vender no app com sua loja e cardápio</div></div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60">
            <RadioGroupItem value="courier" className="mt-0.5" />
            <div><div className="font-medium">Entregador</div><div className="text-xs text-muted-foreground">Fazer entregas disponíveis próximas</div></div>
          </label>
        </RadioGroup>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Criando..." : "Criar conta"}</Button>
      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="bg-card px-2">ou</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
      </div>
      <GoogleButton />
    </form>
  );
}
