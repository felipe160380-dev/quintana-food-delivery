import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UtensilsCrossed, User, Store, Bike } from "lucide-react";

type Role = "customer" | "merchant" | "courier";
type Search = { redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
});

const HOME_BY_ROLE: Record<Role, string> = {
  customer: "/",
  merchant: "/lojista",
  courier: "/entregador",
};

function AuthPage() {
  const nav = useNavigate();
  const search = useSearch({ from: "/auth" });
  const goHome = (role: Role) => nav({ to: search.redirect ?? HOME_BY_ROLE[role] });

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-md place-items-center px-4 py-10">
      <div className="w-full">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <UtensilsCrossed className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Bem-vindo à QuintanaFood</h1>
          <p className="text-sm text-muted-foreground">Escolha como quer entrar no app.</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="signin"><SignIn onDone={goHome} /></TabsContent>
              <TabsContent value="signup"><SignUp onDone={goHome} /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Para mudar de perfil (cliente / lojista / entregador) saia e entre de novo escolhendo outro perfil.
        </p>
      </div>
    </div>
  );
}

function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const items: { v: Role; label: string; desc: string; icon: typeof User }[] = [
    { v: "customer", label: "Cliente", desc: "Fazer pedidos nas lojas", icon: User },
    { v: "merchant", label: "Lojista", desc: "Vender no app com minha loja", icon: Store },
    { v: "courier", label: "Entregador", desc: "Fazer entregas próximas (requer aprovação)", icon: Bike },
  ];
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as Role)} className="grid gap-2">
      {items.map(({ v, label, desc, icon: Icon }) => (
        <label key={v} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-accent/40 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60">
          <RadioGroupItem value={v} className="mt-0.5" />
          <Icon className="mt-0.5 size-5 text-primary" />
          <div><div className="font-medium">{label}</div><div className="text-xs text-muted-foreground">{desc}</div></div>
        </label>
      ))}
    </RadioGroup>
  );
}

async function ensureRoleAndRedirect(userId: string, role: Role): Promise<void> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const has = (data ?? []).some((r) => r.role === role);
  if (!has) {
    if (role === "courier") {
      throw new Error("Você ainda não é entregador. Cadastre-se em 'Criar conta' escolhendo Entregador.");
    }
    if (role === "merchant") {
      throw new Error("Você ainda não é lojista. Cadastre-se em 'Criar conta' escolhendo Lojista.");
    }
    // customer: auto-create
    await supabase.from("user_roles").insert({ user_id: userId, role: "customer" });
  }
  if (role === "courier") {
    const { data: c } = await supabase.from("couriers").select("approval_status").eq("id", userId).maybeSingle();
    if (!c || c.approval_status !== "approved") {
      throw new Error("Cadastro de entregador aguardando aprovação. Você receberá acesso assim que for aprovado.");
    }
  }
}

function GoogleButton({ role }: { role: Role }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      type="button" variant="outline" className="w-full" disabled={loading}
      onClick={async () => {
        setLoading(true);
        sessionStorage.setItem("qf.pending_role", role);
        const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
        if (r.error) { toast.error("Falha ao entrar com Google"); setLoading(false); }
      }}
    >
      {loading ? "Abrindo Google..." : "Continuar com Google"}
    </Button>
  );
}

function SignIn({ onDone }: { onDone: (r: Role) => void }) {
  const [role, setRole] = useState<Role>("customer");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.user) { setLoading(false); return toast.error(error?.message ?? "Falha no login"); }
        try {
          await ensureRoleAndRedirect(data.user.id, role);
        } catch (err: any) {
          await supabase.auth.signOut();
          setLoading(false);
          return toast.error(err.message);
        }
        setLoading(false);
        toast.success("Bem-vindo!");
        onDone(role);
      }}
    >
      <div className="space-y-2">
        <Label>Entrar como</Label>
        <RolePicker value={role} onChange={setRole} />
      </div>
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
      <GoogleButton role={role} />
    </form>
  );
}

function SignUp({ onDone }: { onDone: (r: Role) => void }) {
  const [role, setRole] = useState<Role>("customer");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [document, setDocument] = useState("");
  const [vehicle, setVehicle] = useState<"bike" | "motorcycle" | "car" | "foot">("motorcycle");
  const [plate, setPlate] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [cities, setCities] = useState<{ id: string; name: string; state: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Cidades ativas (para entregador escolher onde vai atuar)
  useState(() => {
    supabase.from("cities").select("id,name,state").eq("is_active", true).order("name").then(({ data }) => {
      const list = (data ?? []) as { id: string; name: string; state: string }[];
      setCities(list);
      if (list.length > 0) setCityId((prev) => prev || list[0].id);
    });
    return undefined;
  });



  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: window.location.origin },
        });
        if (error || !data.user) { setLoading(false); return toast.error(error?.message ?? "Erro"); }

        if (role !== "customer") {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role });
        }
        if (role === "courier") {
          await supabase.from("couriers").insert({
            id: data.user.id, document, vehicle, vehicle_plate: plate, approval_status: "pending",
          });
          // Send approval-request notification (best-effort)
          try {
            await fetch("/api/public/courier-application", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ user_id: data.user.id, full_name: fullName, email, phone, document, vehicle, plate }),
            });
          } catch {}
          setLoading(false);
          toast.success("Cadastro enviado! Aguarde aprovação do administrador.");
          await supabase.auth.signOut();
          return;
        }

        setLoading(false);
        toast.success("Conta criada!");
        onDone(role);
      }}
    >
      <div className="space-y-2">
        <Label>Criar conta como</Label>
        <RolePicker value={role} onChange={setRole} />
      </div>
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

      {role === "courier" && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Dados do entregador (serão enviados para aprovação).</p>
          <div className="space-y-1.5"><Label>CPF</Label><Input value={document} onChange={(e) => setDocument(e.target.value)} required /></div>
          <div className="space-y-1.5">
            <Label>Veículo</Label>
            <Select value={vehicle} onValueChange={(v) => setVehicle(v as typeof vehicle)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="motorcycle">Moto</SelectItem>
                <SelectItem value="bike">Bicicleta</SelectItem>
                <SelectItem value="car">Carro</SelectItem>
                <SelectItem value="foot">A pé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(vehicle === "motorcycle" || vehicle === "car") && (
            <div className="space-y-1.5"><Label>Placa</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Criando..." : "Criar conta"}</Button>
      <div className="relative py-1 text-center text-xs text-muted-foreground">
        <span className="bg-card px-2">ou</span>
        <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
      </div>
      {role !== "courier" && <GoogleButton role={role} />}
    </form>
  );
}
