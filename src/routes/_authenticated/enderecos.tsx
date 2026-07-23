import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LocationPicker, type PickedLocation } from "@/components/LocationPicker";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Trash2, MapPin, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/enderecos")({ component: Page });

type Address = {
  id: string; label: string; street: string; number: string | null; complement: string | null;
  neighborhood: string | null; city: string | null; state: string | null;
  latitude: number | null; longitude: number | null; is_default: boolean;
};

function Page() {
  const [items, setItems] = useState<Address[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("addresses").select("*").order("is_default", { ascending: false });
    setItems((data ?? []) as Address[]);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meus endereços</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="mr-1 size-4" /> Novo</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Adicionar endereço</DialogTitle></DialogHeader>
            <AddressForm onSaved={() => { setOpen(false); load(); }} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-2">
        {items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">Sem endereços cadastrados ainda.</Card>
        ) : items.map((a) => (
          <Card key={a.id} className="flex items-start gap-3 p-3">
            <MapPin className="mt-1 size-4 text-primary" />
            <div className="flex-1">
              <div className="font-medium">{a.label} {a.is_default && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">Padrão</span>}</div>
              <div className="text-sm">{a.street}{a.number ? `, ${a.number}` : ""}{a.complement ? ` — ${a.complement}` : ""}</div>
              <div className="text-xs text-muted-foreground">{[a.neighborhood, a.city, a.state].filter(Boolean).join(", ")}</div>
            </div>
            <div className="flex flex-col gap-1">
              {!a.is_default && (
                <Button variant="ghost" size="sm" onClick={async () => {
                  const { data: u } = await supabase.auth.getUser();
                  if (!u.user) return;
                  await supabase.from("addresses").update({ is_default: false }).eq("user_id", u.user.id);
                  await supabase.from("addresses").update({ is_default: true }).eq("id", a.id);
                  load();
                }}>Tornar padrão</Button>
              )}
              <Button variant="ghost" size="sm" onClick={async () => {
                await supabase.from("addresses").delete().eq("id", a.id); load();
              }}><Trash2 className="size-4 text-destructive" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function AddressForm({ onSaved }: { onSaved: () => void }) {
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [label, setLabel] = useState("Casa");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [saving, setSaving] = useState(false);

  const handleLoc = (l: PickedLocation) => {
    setLoc(l);
    // Se o Google trouxe o número da rua, pré-preenche (usuário pode editar).
    if (l.street_number) setNumber(l.street_number);
  };


  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!loc) return toast.error("Escolha um endereço no mapa");
      setSaving(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { count } = await supabase.from("addresses").select("*", { count: "exact", head: true }).eq("user_id", u.user.id);
      const { error } = await supabase.from("addresses").insert({
        user_id: u.user.id, label,
        street: loc.address_line, number, complement,
        neighborhood: loc.neighborhood, city: loc.city, state: loc.state, postal_code: loc.postal_code,
        latitude: loc.latitude, longitude: loc.longitude,
        is_default: (count ?? 0) === 0,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Endereço salvo");
      onSaved();
    }}>
      <div className="space-y-1.5"><Label>Apelido</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <LocationPicker value={loc} onChange={setLoc} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Número</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Complemento</Label><Input value={complement} onChange={(e) => setComplement(e.target.value)} /></div>
      </div>
      <Button className="w-full" type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar endereço"}</Button>
    </form>
  );
}
