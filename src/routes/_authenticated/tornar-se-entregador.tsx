import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bike } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tornar-se-entregador")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [checking, setChecking] = useState(true);
  const [document, setDocument] = useState("");
  const [vehicle, setVehicle] = useState<"bike" | "motorcycle" | "car" | "foot">("motorcycle");
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id);
      if (roles?.some((r) => r.role === "courier")) nav({ to: "/entregador" });
      else setChecking(false);
    });
  }, [nav]);

  if (checking) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error: r1 } = await supabase.from("user_roles").insert({ user_id: u.user.id, role: "courier" });
    if (r1 && !r1.message.includes("duplicate")) { setLoading(false); return toast.error(r1.message); }
    const { error: r2 } = await supabase.from("couriers").upsert({ id: u.user.id, document, vehicle, vehicle_plate: plate });
    setLoading(false);
    if (r2) return toast.error(r2.message);
    toast.success("Perfil de entregador ativado!");
    nav({ to: "/entregador" });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <div className="mb-2 grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><Bike className="size-6" /></div>
          <CardTitle>Ser entregador Quintana</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5"><Label>Documento (CPF)</Label><Input value={document} onChange={(e) => setDocument(e.target.value)} required /></div>
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
            <Button className="w-full" type="submit" disabled={loading}>{loading ? "Ativando..." : "Ativar perfil"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
