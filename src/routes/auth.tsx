import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import logo from "@/assets/mipede-logo.png.asset.json";
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
          <img src={logo.url} alt="MiPede" className="mb-3 h-12 w-auto" />
          <h1 className="text-2xl font-bold tracking-tight">Bem-vindo ao MiPede</h1>
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
        if (error || !data.user) { setLoading(false); { console.error(error); return toast.error("E-mail ou senha inválidos."); } }
        try {
          await ensureRoleAndRedirect(data.user.id, role);
        } catch (err: any) {
          await supabase.auth.signOut();
          setLoading(false);
          { console.error(err); return toast.error("Não foi possível entrar. Tente novamente."); }
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
  const [accepted, setAccepted] = useState(false);
  const [cities, setCities] = useState<{ id: string; name: string; state: string }[]>([]);
  const [loading, setLoading] = useState(false);
  // Etapas do cadastro do entregador: 1 dados pessoais, 2 documentos, 3 moto
  const [step, setStep] = useState(1);
  const [cnhFile, setCnhFile] = useState<File | null>(null);
  const [crlvFile, setCrlvFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [sent, setSent] = useState(false);

  // Envia um documento para o bucket privado e devolve uma URL assinada longa.
  const uploadDoc = async (userId: string, file: File, kind: string): Promise<string | null> => {
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${kind}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("courier-docs").upload(path, file);
    if (error) { console.error(error); return null; }
    const { data } = await supabase.storage.from("courier-docs").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    return data?.signedUrl ?? null;
  };

  // Cidades ativas (para entregador escolher onde vai atuar)
  useEffect(() => {
    supabase.from("cities").select("id,name,state").eq("is_active", true).order("name").then(({ data }) => {
      const list = (data ?? []) as { id: string; name: string; state: string }[];
      setCities(list);
      setCityId((prev) => prev || list[0]?.id || "");
    });
  }, []);




  const isCourier = role === "courier";
  const showPersonal = !isCourier || step === 1;
  const showDocs = isCourier && step === 2;
  const showVehicle = isCourier && step === 3;
  const isLastStep = !isCourier || step === 3;

  if (sent) {
    return (
      <div className="space-y-3 pt-6 text-center">
        <h2 className="text-lg font-semibold">Cadastro enviado com sucesso.</h2>
        <p className="text-sm text-muted-foreground">
          Seu cadastro está <strong>em análise</strong>. Assim que o administrador aprovar, você poderá
          entrar como entregador e receber entregas.
        </p>
        <Button variant="outline" className="w-full" onClick={() => { setSent(false); setStep(1); }}>
          Voltar
        </Button>
      </div>
    );
  }

  const goNext = () => {
    if (step === 1) {
      if (!fullName.trim() || !phone.trim() || !document.trim()) return toast.error("Preencha nome, telefone e CPF.");
      if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) return toast.error("Informe um e-mail válido.");
      if (password.length < 8) return toast.error("A senha precisa ter no mínimo 8 caracteres.");
      if (!cityId) return toast.error("Escolha a cidade de atuação.");
      return setStep(2);
    }
    if (step === 2) {
      if (!cnhFile || !crlvFile || !photoFile) return toast.error("Envie a CNH, o CRLV e a foto 3x4.");
      return setStep(3);
    }
  };

  return (
    <form
      className="space-y-4 pt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!isLastStep) return goNext();
        if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
          return toast.error("Informe um e-mail válido.");
        }
        if (!accepted) {
          return toast.error("É preciso aceitar os Termos de Uso e a Política de Privacidade.");
        }
        if (isCourier && (vehicle === "motorcycle" || vehicle === "car") && !plate.trim()) {
          return toast.error("Informe a placa do veículo.");
        }
        setLoading(true);
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName, phone }, emailRedirectTo: window.location.origin },
        });
        if (error || !data.user) { setLoading(false); { console.error(error); return toast.error("Não foi possível criar a conta. Verifique os dados e tente novamente."); } }

        await supabase.from("profiles").update({ terms_accepted_at: new Date().toISOString() }).eq("id", data.user.id);

        if (role !== "customer") {
          await supabase.from("user_roles").insert({ user_id: data.user.id, role });
        }
        if (role === "courier") {
          if (!cityId) { setLoading(false); return toast.error("Escolha a cidade de atuação"); }
          const [cnhUrl, crlvUrl, photoUrl] = await Promise.all([
            cnhFile ? uploadDoc(data.user.id, cnhFile, "cnh") : Promise.resolve(null),
            crlvFile ? uploadDoc(data.user.id, crlvFile, "crlv") : Promise.resolve(null),
            photoFile ? uploadDoc(data.user.id, photoFile, "foto") : Promise.resolve(null),
          ]);
          await supabase.from("couriers").insert({
            id: data.user.id, document, vehicle, vehicle_plate: plate, approval_status: "pending",
            city_id: cityId,
            cnh_url: cnhUrl, crlv_url: crlvUrl, photo_url: photoUrl,
            vehicle_brand: brand || null, vehicle_model: model || null, vehicle_year: year || null,
          });
          if (photoUrl) {
            await supabase.from("profiles").update({ avatar_url: photoUrl }).eq("id", data.user.id);
          }
          // Send approval-request notification (best-effort)
          try {
            await fetch("/api/public/courier-application", {
              method: "POST", headers: { "content-type": "application/json" },
              body: JSON.stringify({ user_id: data.user.id, full_name: fullName, email, phone, document, vehicle, plate, city_id: cityId }),
            });
          } catch {}
          setLoading(false);
          toast.success("Cadastro enviado com sucesso. Seu cadastro está em análise.");
          await supabase.auth.signOut();
          setSent(true);
          return;
        }

        setLoading(false);
        toast.success("Conta criada!");
        onDone(role);
      }}
    >
      <div className="space-y-2">
        <Label>Criar conta como</Label>
        <RolePicker value={role} onChange={(r) => { setRole(r); setStep(1); }} />
      </div>

      {isCourier && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {[1, 2, 3].map((s) => (
            <span key={s} className={`flex-1 rounded-full border px-2 py-1 text-center ${s === step ? "border-primary bg-primary/10 font-medium text-primary" : ""}`}>
              {s === 1 ? "1. Dados" : s === 2 ? "2. Documentos" : "3. Moto"}
            </span>
          ))}
        </div>
      )}

      {showPersonal && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome completo</Label>
            <Input id="name" required={!isCourier} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 90000-0000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-up">E-mail</Label>
              <Input id="email-up" type="email" required={!isCourier} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Senha</Label>
            <Input id="pw" type="password" required={!isCourier} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">Mínimo 8 caracteres.</p>
          </div>
          {isCourier && (
            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="space-y-1.5"><Label>CPF</Label><Input value={document} onChange={(e) => setDocument(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Cidade de atuação</Label>
                <Select value={cityId} onValueChange={setCityId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} / {c.state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </>
      )}

      {showDocs && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">Envie fotos legíveis. Os documentos são privados e vistos apenas pela administração.</p>
          <FilePick label="Foto da CNH" file={cnhFile} onPick={setCnhFile} />
          <FilePick label="Foto do CRLV (documento da moto)" file={crlvFile} onPick={setCrlvFile} />
          <FilePick label="Foto 3x4 (será sua foto de perfil)" file={photoFile} onPick={setPhotoFile} />
        </div>
      )}

      {showVehicle && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
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
          <div className="space-y-1.5"><Label>Placa</Label><Input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Marca</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Modelo</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Ano</Label><Input value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))} /></div>
        </div>
      )}

      {isLastStep && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed">
          <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} className="mt-0.5" />
          <span className="text-muted-foreground">
            Li e aceito os{" "}
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Termos de Uso</a>{" "}
            e a{" "}
            <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Política de Privacidade</a>.
          </span>
        </label>
      )}

      <div className="flex gap-2">
        {isCourier && step > 1 && (
          <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>Voltar</Button>
        )}
        <Button type="submit" className="flex-1" disabled={loading || (isLastStep && !accepted)}>
          {loading ? "Enviando..." : isLastStep ? (isCourier ? "Enviar cadastro" : "Criar conta") : "Continuar"}
        </Button>
      </div>

      {!isCourier && (
        <>
          <div className="relative py-1 text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">ou</span>
            <div className="absolute inset-x-0 top-1/2 -z-10 border-t" />
          </div>
          <GoogleButton role={role} />
        </>
      )}
    </form>
  );
}

function FilePick({ label, file, onPick }: { label: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="file" accept="image/*" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
      {file && <p className="text-[11px] text-emerald-600">Selecionado: {file.name}</p>}
    </div>
  );
}
