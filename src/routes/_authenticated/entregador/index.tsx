import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistance } from "@/lib/geo";
import { brl, orderStatusLabel, courierStageLabel, courierStageAction, COURIER_STAGES } from "@/lib/format";
import { toast } from "sonner";
import { Bike, History, Package, Wallet } from "lucide-react";
import { EmptyState, RowSkeleton } from "@/components/ui-states";
import { DeliveryMap } from "@/components/DeliveryMap";
import { OrderChat } from "@/components/OrderChat";
import { useCourierPosition } from "@/hooks/use-order-tracking";
import { useCourierLocationShare, useCourierPresence } from "@/hooks/use-courier-location-share";

export const Route = createFileRoute("/_authenticated/entregador/")({ component: Page });

function Page() {
  const nav = useNavigate();
  const [me, setMe] = useState<any>(null);
  const [available, setAvailable] = useState(false);
  const [ready, setReady] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [offer, setOffer] = useState<any | null>(null);
  const seenOffers = useRef<Set<string>>(new Set());

  const [blocked, setBlocked] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  const load = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
    if (!roles?.some((r) => r.role === "courier")) { setBlocked("Sua conta não é uma conta de entregador. Saia e entre novamente escolhendo Entregador."); return; }
    const { data: c } = await supabase.from("couriers").select("*, city:cities(name,state)").eq("id", u.user.id).maybeSingle();
    if (!c || c.approval_status !== "approved") {
      const st = c?.approval_status ?? "pending";
      const label = st === "in_review" ? "em análise pela nossa equipe" : st === "rejected" ? "recusado" : "aguardando aprovação do administrador";
      let msg = `Seu cadastro de entregador está ${label}.`;
      if (st === "rejected" && c?.approval_note) msg += ` Motivo: ${c.approval_note}`;
      setRejected(st === "rejected");
      setBlocked(msg); return;
    }
    setMe({ user: u.user, courier: c });
    setAvailable(!!c?.is_available);

    // Ofertas elegíveis (servidor decide: cidade, pagamento, sem entrega ativa,
    // recusas e prioridade do entregador mais próximo).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: r, error: rErr } = await (supabase as any).rpc("courier_available_orders");
    if (rErr) console.error(rErr);
    setReady(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r ?? []).map((row: any) => ({
        id: row.order_id,
        status: "ready",
        delivery_fee: row.delivery_fee,
        total: row.total,
        address_snapshot: row.customer_address,
        distance_m: row.distance_m,
        is_priority: row.is_priority,
        store: {
          name: row.store_name,
          logo_url: row.store_logo_url,
          address_line: row.store_address,
          latitude: row.store_lat,
          longitude: row.store_lng,
        },
      })),
    );
    const { data: m } = await supabase.from("orders").select("*, store:stores(name,logo_url,address_line,latitude,longitude)").eq("courier_id", u.user.id).in("status", ["ready", "out_for_delivery"]).order("created_at");
    setMine(m ?? []);
    const { data: h } = await supabase
      .from("orders")
      .select("id,total,delivery_fee,delivered_at,status,store:stores(name,logo_url)")
      .eq("courier_id", u.user.id)
      .in("status", ["delivered", "cancelled"])
      .order("delivered_at", { ascending: false })
      .limit(50);
    setHistory(h ?? []);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("courier-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transmite a posição do entregador enquanto houver entregas em rota.
  useCourierLocationShare(
    me?.user?.id ?? null,
    mine.filter((o) => o.status === "out_for_delivery").map((o) => o.id),
  );

  // Mantém a localização operacional ativa enquanto estiver disponível (mesmo sem entrega).
  useCourierPresence(me?.user?.id ?? null, available || mine.length > 0);

  // Reavalia periodicamente (janela de exclusividade do mais próximo / localização recente).
  useEffect(() => {
    if (!me) return;
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.user?.id]);

  // Popup + som/vibração quando uma nova oferta elegível aparece.
  useEffect(() => {
    if (!available || mine.length > 0) { setOffer(null); return; }
    const fresh = ready.find((o) => !seenOffers.current.has(o.id));
    if (!fresh) {
      if (offer && !ready.some((o) => o.id === offer.id)) setOffer(null);
      return;
    }
    seenOffers.current.add(fresh.id);
    setOffer(fresh);
    try { navigator.vibrate?.([200, 100, 200]); } catch { /* sem suporte */ }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.value = 0.08;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
        osc.onended = () => ctx.close();
      }
    } catch { /* navegador pode bloquear áudio automático */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, available, mine.length]);




  if (blocked) return (
    <div className="mx-auto max-w-md p-10 text-center">
      <Bike className="mx-auto mb-2 size-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{blocked}</p>
      {rejected && (
        <Button
          className="mt-4"
          onClick={async () => {
            const { error } = await supabase.rpc("courier_resubmit");
            if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
            toast.success("Cadastro reenviado. Aguarde nova análise.");
            setRejected(false);
            load();
          }}
        >Reenviar cadastro para nova análise</Button>
      )}
      <Button variant="outline" className="mt-2 ml-2" onClick={() => nav({ to: "/auth" })}>Ir para login</Button>
    </div>
  );
  if (!me) return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
      <div className="h-8 w-40 animate-pulse rounded bg-muted" />
      {Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={i} />)}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Entregas</h1>
          <p className="text-sm text-muted-foreground">Fique disponível para receber pedidos prontos.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-xl border bg-card p-2">
          <Bike className="size-4 shrink-0 text-primary" />
          <span className="hidden text-sm sm:inline">{available ? "Disponível" : "Indisponível"}</span>
          <Switch checked={available} onCheckedChange={async (v) => {
            await supabase.from("couriers").update({ is_available: v, last_seen_at: new Date().toISOString() }).eq("id", me.user.id);
            setAvailable(v);
            await load();
          }} />

        </div>

      </div>

      <Tabs defaultValue="deliveries">
        <TabsList className="tabs-scroll h-auto gap-1 bg-muted/40 p-1">
          <TabsTrigger value="deliveries"><Package className="mr-1 size-4" />Entregas</TabsTrigger>
          <TabsTrigger value="history"><History className="mr-1 size-4" />Histórico</TabsTrigger>
          <TabsTrigger value="wallet"><Wallet className="mr-1 size-4" />Ganhos</TabsTrigger>
        </TabsList>

        <TabsContent value="deliveries" className="mt-4">
          {mine.length > 0 && (
            <section className="mb-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Suas entregas ativas</h2>
              <div className="space-y-2">
                {mine.map((o) => (
                  <OrderCard key={o.id} o={o} mine onUpdate={load} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pedidos prontos para retirada</h2>
            {!available ? (
              <EmptyState
                icon={<Bike className="size-6" />}
                title="Você está indisponível"
                description="Ative a disponibilidade acima para receber pedidos prontos para retirada."
              />
            ) : ready.length === 0 ? (
              <EmptyState
                icon={<Package className="size-6" />}
                title="Nenhum pedido pronto agora"
                description={`Você atende pedidos de ${(me?.courier as any)?.city?.name ?? "sua cidade"}. Assim que uma loja dessa cidade liberar um pedido, ele aparece aqui automaticamente.`}
              />
            ) : (

              <div className="space-y-2">
                {ready.map((o) => <OrderCard key={o.id} o={o} onUpdate={load} />)}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {history.length === 0 ? (
            <EmptyState icon={<History className="size-6" />} title="Nenhuma entrega finalizada" description="Suas entregas concluídas aparecem aqui." />
          ) : (
            <div className="space-y-2">
              {history.map((h) => (
                <Card key={h.id} className="flex items-center gap-3 p-3">
                  <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {h.store?.logo_url && <img src={h.store.logo_url} className="h-full w-full object-cover" alt="" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.store?.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.delivered_at ? new Date(h.delivered_at).toLocaleString("pt-BR") : "—"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold tabular-nums text-emerald-600">{brl(Number(h.delivery_fee ?? 0))}</div>
                    <Badge variant={h.status === "delivered" ? "secondary" : "outline"}>{orderStatusLabel[h.status]}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="wallet" className="mt-4">
          <CourierWalletTab courier={me.courier} />
        </TabsContent>
      </Tabs>

      {offer && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <Card className="w-full max-w-sm p-4">
            <div className="text-center text-sm font-bold uppercase tracking-wide text-primary">Nova entrega disponível</div>
            <div className="mt-3 space-y-1 text-sm">
              <div><span className="text-muted-foreground">Loja:</span> <strong>{offer.store?.name}</strong></div>
              <div><span className="text-muted-foreground">Coleta:</span> {offer.store?.address_line ?? "—"}</div>
              <div><span className="text-muted-foreground">Distância:</span> {typeof offer.distance_m === "number" ? formatDistance(offer.distance_m) : "—"}</div>
              <div className="text-base font-bold text-emerald-600">Você ganha: {brl(Number(offer.delivery_fee ?? 0))}</div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                className="flex-1"
                onClick={async () => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { error } = await (supabase as any).rpc("courier_accept_order", { _order_id: offer.id });
                  if (error) { console.error(error); toast.error(error.message ?? "Não foi possível aceitar a entrega."); }
                  else toast.success("Entrega aceita! Siga as etapas até a conclusão.");
                  setOffer(null);
                  load();
                }}
              >Aceitar entrega</Button>
              <Button
                variant="outline"
                onClick={async () => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (supabase as any).rpc("courier_decline_order", { _order_id: offer.id });
                  setOffer(null);
                  load();
                }}
              >Recusar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function OrderCard({ o, mine, onUpdate }: { o: any; mine?: boolean; onUpdate: () => void }) {
  const [code, setCode] = useState("");
  const addr = o.address_snapshot ?? {};
  const myPos = useCourierPosition(o.id, !!mine && o.status === "out_for_delivery");
  const stage: string | null = o.courier_stage ?? null;
  const stageIndex = stage ? COURIER_STAGES.indexOf(stage as (typeof COURIER_STAGES)[number]) : -1;
  const nextStage = stageIndex >= 0 && stageIndex < COURIER_STAGES.length - 1
    ? COURIER_STAGES[stageIndex + 1]
    : null;
  const [advancing, setAdvancing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const accept = async () => {
    // Aceite atômico no servidor: apenas um entregador consegue assumir o pedido.
    if (busy) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("courier_accept_order", { _order_id: o.id });
    setBusy(false);
    if (error) { console.error(error); onUpdate(); return toast.error(error.message ?? "Não foi possível aceitar a entrega."); }
    toast.success("Entrega aceita! Siga as etapas até a conclusão.");
    onUpdate();
  };

  const decline = async () => {
    if (busy) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("courier_decline_order", { _order_id: o.id });
    setBusy(false);
    if (error) { console.error(error); return toast.error("Não foi possível recusar. Tente novamente."); }
    toast("Oferta recusada. Ela seguirá para outro entregador.");
    onUpdate();
  };

  const advance = async () => {
    if (!nextStage || advancing) return;
    setAdvancing(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("courier_set_stage", { _order_id: o.id, _stage: nextStage });
    setAdvancing(false);
    if (error) { console.error(error); return toast.error(error.message ?? "Não foi possível avançar a etapa."); }
    toast.success(courierStageLabel[nextStage]);
    onUpdate();
  };

  const confirmDeliver = async () => {
    if (confirming) return;
    if (stage !== "at_customer") return toast.error("Confirme antes que você chegou no endereço do cliente");
    if (code.length !== 4) return toast.error("Informe o código de 4 dígitos do cliente");
    setConfirming(true);
    let lat: number | null = null, lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 5000 }));
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch {}
    const { error } = await supabase.rpc("confirm_delivery", { _order_id: o.id, _code: code, _lat: lat ?? 0, _lng: lng ?? 0 });
    setConfirming(false);
    if (error) { console.error(error); return toast.error(error.message ?? "Não foi possível concluir. Tente novamente."); }
    toast.success("Entrega concluída com sucesso", {
      description: `Valor recebido: ${brl(Number(o.delivery_fee ?? 0))}`,
    });
    setCode("");
    onUpdate();
  };


  return (
    <Card className="p-3 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {o.store?.logo_url && <img src={o.store.logo_url} className="h-full w-full object-cover" alt="" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate font-medium">{o.store?.name}</div>
            <Badge className="shrink-0">{orderStatusLabel[o.status]}</Badge>
          </div>
          <div className="truncate text-xs text-muted-foreground">Retirar: {o.store?.address_line ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">Entregar: {addr.street}{addr.number ? `, ${addr.number}` : ""}</div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-bold tabular-nums text-emerald-600">Você ganha: {brl(Number(o.delivery_fee ?? 0))}</span>
            <span className="text-[11px] text-muted-foreground">Pedido: {brl(Number(o.total))}</span>
          </div>
          {!mine && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {typeof o.distance_m === "number" && <span>Distância até a loja: {formatDistance(o.distance_m)}</span>}
              {o.is_priority && <Badge variant="secondary">Você é o mais próximo</Badge>}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
            <Button asChild size="sm" variant="outline"><Link to="/pedidos/$id" params={{ id: o.id }}>Abrir</Link></Button>
            {!mine && <Button size="sm" disabled={busy} onClick={accept}>{busy ? "Aguarde..." : "Aceitar entrega"}</Button>}
            {!mine && <Button size="sm" variant="ghost" disabled={busy} onClick={decline}>Recusar</Button>}
          </div>
        </div>
        <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
          <Button asChild size="sm" variant="outline"><Link to="/pedidos/$id" params={{ id: o.id }}>Abrir</Link></Button>
          {!mine && <Button size="sm" disabled={busy} onClick={accept}>{busy ? "Aguarde..." : "Aceitar entrega"}</Button>}
          {!mine && <Button size="sm" variant="ghost" disabled={busy} onClick={decline}>Recusar</Button>}
        </div>

      </div>

      {mine && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Etapa atual: {stage ? courierStageLabel[stage] : "Entrega aceita"}
            </div>
            <ol className="flex flex-wrap gap-1.5">
              {COURIER_STAGES.map((st, i) => (
                <li
                  key={st}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    i <= Math.max(stageIndex, 0)
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground"
                  }`}
                >{courierStageLabel[st]}</li>
              ))}
            </ol>
            {nextStage && (
              <Button size="sm" className="mt-2 w-full sm:w-auto" onClick={advance} disabled={advancing}>
                {advancing ? "Registrando..." : courierStageAction[nextStage]}
              </Button>
            )}
          </div>
          <DeliveryMap
            className="h-44"
            label="Rota até o cliente"
            courier={myPos ? { lat: myPos.latitude, lng: myPos.longitude } : null}
            destination={addr.latitude && addr.longitude ? { lat: Number(addr.latitude), lng: Number(addr.longitude) } : null}
            store={o.store?.latitude && o.store?.longitude ? { lat: Number(o.store.latitude), lng: Number(o.store.longitude) } : null}
          />
          <div className={`flex flex-wrap items-center gap-2 ${stage === "at_customer" ? "" : "opacity-50"}`}>
            <input
              disabled={stage !== "at_customer"}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Código"
              inputMode="numeric"
              className="w-24 rounded-md border bg-background px-3 py-2 text-center text-lg font-mono tracking-widest"
            />
            <Button size="sm" onClick={confirmDeliver} disabled={stage !== "at_customer" || confirming}>{confirming ? "Confirmando..." : "Confirmar entrega"}</Button>
            <span className="text-xs text-muted-foreground">
              {stage === "at_customer"
                ? "Peça ao cliente os 4 dígitos."
                : "Avance as etapas até chegar no cliente para liberar o código."}
            </span>
          </div>
        </div>
      )}

      {mine && (
        <div className="mt-3 border-t pt-3">
          <div className="px-1 text-xs font-semibold text-muted-foreground">Chat com o cliente</div>
          <OrderChat
            orderId={o.id}
            thread="courier"
            closed={["delivered", "cancelled"].includes(o.status)}
            emptyHint="Fale com o cliente sobre a entrega."
          />
        </div>
      )}
    </Card>
  );
}


// ============ Carteira do entregador ============
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const WITHDRAWAL_STATUS: Record<string, string> = {
  pending: "Pendente",
  processing: "Em processamento",
  paid: "Pago",
  rejected: "Recusado",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CourierWalletTab({ courier }: { courier: any }) {
  const courierId = courier.id as string;
  const [balance, setBalance] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [entries, setEntries] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [pixKey, setPixKey] = useState<string>(courier.payout_pix_key ?? "");
  const [savedPix, setSavedPix] = useState<string>(courier.payout_pix_key ?? "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPix, setSavingPix] = useState(false);

  const load = async () => {
    const { data: bal } = await sb.rpc("courier_wallet_balance", { _courier_id: courierId });
    setBalance(Number(bal ?? 0));
    const { data: e } = await sb.from("courier_wallet_entries").select("*").eq("courier_id", courierId).order("created_at", { ascending: false }).limit(100);
    setEntries(e ?? []);
    const { data: w } = await sb.from("courier_withdrawals").select("*").eq("courier_id", courierId).order("requested_at", { ascending: false });
    setWithdrawals(w ?? []);
  };

  useEffect(() => {
    load();
    const ch = sb.channel(`courier-wallet-${courierId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_wallet_entries", filter: `courier_id=eq.${courierId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "courier_withdrawals", filter: `courier_id=eq.${courierId}` }, load)
      .subscribe();
    return () => { sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierId]);

  const startWeek = useMemo(() => {
    const d = new Date(); const day = d.getDay(); d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((day + 6) % 7)); // segunda-feira
    return d;
  }, []);

  const earnings = entries.filter((e) => Number(e.net) > 0);
  const discounts = entries.filter((e) => Number(e.net) < 0);
  const sum = (list: typeof entries) => list.reduce((s, e) => s + Number(e.net), 0);
  const today = new Date().toDateString();
  const earnDay = sum(earnings.filter((e) => new Date(e.created_at).toDateString() === today));
  const earnWeek = sum(earnings.filter((e) => new Date(e.created_at) >= startWeek));
  const earnMonth = sum(earnings.filter((e) => {
    const d = new Date(e.created_at);
    return d.getMonth() === new Date().getMonth() && d.getFullYear() === new Date().getFullYear();
  }));

  const withdrawalsThisWeek = withdrawals.filter((w) => new Date(w.requested_at) >= startWeek && w.status !== "rejected");
  const hasFreeUsed = withdrawalsThisWeek.length >= 1;

  const savePix = async () => {
    const key = pixKey.trim();
    if (!key) return toast.error("Informe uma chave PIX válida");
    setSavingPix(true);
    const { error } = await sb.from("couriers").update({ payout_pix_key: key }).eq("id", courierId);
    setSavingPix(false);
    if (error) { console.error(error); return toast.error("Não foi possível salvar. Tente novamente."); }
    setSavedPix(key);
    toast.success("Chave PIX salva!");
  };

  const requestWithdrawal = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return toast.error("Informe um valor válido");
    if (value > balance) return toast.error("Valor acima do saldo disponível");
    if (!savedPix) return toast.error("Cadastre sua chave PIX antes de solicitar o saque");

    // Prévia apenas informativa: a taxa real é recalculada no servidor.
    const fee = hasFreeUsed ? Number((value * 0.06).toFixed(2)) : 0;
    const ok = confirm(
      hasFreeUsed
        ? `Você já usou o saque gratuito desta semana. Taxa administrativa de 6% (R$ ${fee.toFixed(2)}), líquido R$ ${(value - fee).toFixed(2)}. Deseja continuar?`
        : `Solicitar saque de R$ ${value.toFixed(2)} (sem taxa — saque gratuito da semana)?`,
    );
    if (!ok) return;

    setSaving(true);
    const { error } = await sb.from("courier_withdrawals").insert({
      courier_id: courierId, amount: value, pix_key: savedPix,
    });
    setSaving(false);
    if (error) { console.error(error); return toast.error("Não foi possível concluir. Tente novamente."); }
    toast.success("Saque solicitado!");
    setAmount("");
    load();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <WalletStat label="Saldo disponível" value={brl(balance)} />
        <WalletStat label="Ganhos hoje" value={brl(earnDay)} />
        <WalletStat label="Ganhos na semana" value={brl(earnWeek)} />
        <WalletStat label="Ganhos no mês" value={brl(earnMonth)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Chave PIX para recebimento</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label>Chave PIX</Label>
              <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" />
            </div>
            <Button type="button" variant="outline" onClick={savePix} disabled={savingPix}>{savingPix ? "Salvando..." : "Salvar chave"}</Button>
          </div>
          {!savedPix && <p className="mt-2 text-[11px] text-muted-foreground">Cadastre sua chave PIX para poder solicitar saques.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Solicitar saque via PIX</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={requestWithdrawal}>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-40" />
            </div>
            <div className="text-xs text-muted-foreground">
              Chave PIX: <span className="font-mono">{savedPix || "— não cadastrada —"}</span>
            </div>
            <Button type="submit" disabled={saving || balance <= 0 || !savedPix}>{saving ? "Enviando..." : "Solicitar saque"}</Button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">1 saque gratuito por semana. A partir do 2º saque: taxa administrativa de 6%.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Extrato</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="earnings">
            <TabsList className="tabs-scroll h-auto gap-1 bg-muted/40 p-1">
              <TabsTrigger value="earnings">Ganhos</TabsTrigger>
              <TabsTrigger value="discounts">Descontos</TabsTrigger>
            </TabsList>
            <TabsContent value="earnings" className="mt-3"><EntryList list={earnings} empty="Nenhum ganho registrado ainda." /></TabsContent>
            <TabsContent value="discounts" className="mt-3"><EntryList list={discounts} empty="Nenhum desconto registrado." /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de saques</CardTitle></CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum saque solicitado.</div> : (
            <div className="space-y-2">
              {withdrawals.map((w) => (
                <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{brl(Number(w.amount))} <span className="text-xs text-muted-foreground">(líquido {brl(Number(w.net))})</span></div>
                    <div className="truncate text-xs text-muted-foreground">{new Date(w.requested_at).toLocaleString("pt-BR")} • {w.pix_key}</div>
                  </div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                    {WITHDRAWAL_STATUS[w.status as string] ?? w.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function EntryList({ list, empty }: { list: any[]; empty: string }) {
  if (list.length === 0) return <div className="text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="divide-y">
      {list.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate">{e.description ?? e.kind}</div>
            <div className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString("pt-BR")}</div>
          </div>
          <div className={`shrink-0 font-mono font-semibold ${Number(e.net) >= 0 ? "text-emerald-600" : "text-destructive"}`}>
            {Number(e.net) >= 0 ? "+" : ""}{brl(Number(e.net))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WalletStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}
