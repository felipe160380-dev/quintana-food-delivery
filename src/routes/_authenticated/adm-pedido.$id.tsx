import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminOrderDetail } from "@/lib/reports.functions";
import type { AdminOrderDetail } from "@/lib/reports.types";
import {
  brl,
  courierStageLabel,
  dateTimeBR,
  label,
  orderNumber,
  orderStatusLabel,
  paymentMethodLabel,
  paymentStatusLabel,
} from "@/lib/format";

type Search = { q?: string; filtro?: string };

export const Route = createFileRoute("/_authenticated/adm-pedido/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s.q === "string" ? { q: s.q } : {}),
    ...(typeof s.filtro === "string" ? { filtro: s.filtro } : {}),
  }),
  component: Page,
});

const EVENT_LABEL: Record<string, string> = {
  created: "Pedido criado",
  payment_confirmed: "Pagamento confirmado",
  status_accepted: "Aceito pela loja",
  status_preparing: "Em preparo",
  status_ready: "Pronto",
  courier_assigned: "Entregador aceitou",
  status_out_for_delivery: "Pedido coletado — a caminho do cliente",
  status_delivered: "Entregue",
  status_cancelled: "Pedido cancelado",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v ?? "—"}</span>
    </div>
  );
}

function Page() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const load = useServerFn(adminOrderDetail);
  const [data, setData] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load({ data: { orderId: id } })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Falha ao carregar o pedido"));
  }, [id, load]);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/adm" search={{ tab: "orders", ...(search.q ? { q: search.q } : {}), ...(search.filtro ? { filtro: search.filtro } : {}) }}>
        <ArrowLeft className="mr-1 size-4" /> Voltar aos pedidos
      </Link>
    </Button>
  );

  if (error) {
    return <div className="mx-auto max-w-3xl space-y-3 p-4">{back}<Card className="p-6 text-sm text-destructive">{error}</Card></div>;
  }
  if (!data) {
    return <div className="mx-auto max-w-3xl p-4">{back}<div className="flex justify-center py-10"><Loader2 className="animate-spin" /></div></div>;
  }

  const o = data.order;
  const a = o.address as Record<string, string | number | boolean | null>;
  const str = (k: string) => (a?.[k] != null && a[k] !== "" ? String(a[k]) : null);
  const refunded = data.payment.find((p) => p.status === "refunded");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      {back}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
            Pedido {orderNumber(o.id)}
            <Badge variant={o.status === "cancelled" ? "destructive" : "default"}>{label(orderStatusLabel, o.status)}</Badge>
            <Badge variant={o.payment_status === "paid" ? "default" : o.payment_status === "refunded" ? "destructive" : "secondary"}>
              {label(paymentStatusLabel, o.payment_status)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Row k="ID completo" v={<span className="font-mono text-xs">{o.id}</span>} />
          <Row k="Data e hora" v={dateTimeBR(o.created_at)} />
          <Row k="Forma de pagamento" v={label(paymentMethodLabel, o.payment_method)} />
          {o.change_for != null && <Row k="Troco para" v={brl(o.change_for)} />}
          <Row k="Subtotal" v={brl(o.subtotal)} />
          <Row k="Desconto" v={brl(o.discount)} />
          <Row k="Taxa de entrega" v={brl(o.delivery_fee)} />
          <Row k="Total" v={<span className="text-base font-bold">{brl(o.total)}</span>} />
          <Row k="Observações" v={o.notes ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Itens do pedido</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {data.items.map((it) => (
            <div key={it.id} className="rounded-md border p-3 text-sm">
              <div className="flex justify-between gap-3 font-medium">
                <span>{it.quantity}x {it.product_name}</span>
                <span>{brl(it.subtotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Preço registrado: {brl(it.unit_price)}</p>
              {it.addons.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {it.addons.map((ad, i) => (
                    <li key={i}>+ {ad.quantity > 1 ? `${ad.quantity}x ` : ""}{ad.name} — {brl(ad.price * ad.quantity)}</li>
                  ))}
                </ul>
              )}
              {it.notes && <p className="mt-1 text-xs">Obs.: {it.notes}</p>}
            </div>
          ))}
          {data.items.length === 0 && <p className="text-sm text-muted-foreground">Sem itens registrados.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
        <CardContent>
          <Row k="Nome" v={data.customer.name ?? "—"} />
          <Row k="Telefone" v={data.customer.phone ?? "—"} />
          <Row k="E-mail" v={data.customer.email ?? "—"} />
          <div className="mt-2 border-t pt-2">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Endereço utilizado no pedido</p>
            <Row k="Rua" v={str("street") ?? "—"} />
            <Row k="Número" v={str("number") ?? "—"} />
            <Row k="Complemento" v={str("complement") ?? "—"} />
            <Row k="Bairro" v={str("neighborhood") ?? "—"} />
            <Row k="Cidade / UF" v={`${str("city") ?? "—"} / ${str("state") ?? "—"}`} />
            <Row k="CEP" v={str("postal_code") ?? "—"} />
            {str("reference") && <Row k="Referência" v={str("reference")} />}
          </div>
        </CardContent>
      </Card>

      {data.store && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Loja</CardTitle></CardHeader>
          <CardContent>
            <Row k="Nome" v={data.store.name} />
            <Row k="Responsável" v={data.store.owner_name ?? "—"} />
            <Row k="Telefone" v={data.store.phone ?? "—"} />
            <Row k="WhatsApp" v={data.store.whatsapp ?? "—"} />
            <Row k="Endereço" v={data.store.address_line ?? "—"} />
            <Row k="Cidade / UF" v={`${data.store.city ?? "—"} / ${data.store.state ?? "—"}`} />
          </CardContent>
        </Card>
      )}

      {data.courier && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Entregador</CardTitle></CardHeader>
          <CardContent>
            <Row k="Nome" v={data.courier.name ?? "—"} />
            <Row k="Telefone" v={data.courier.phone ?? "—"} />
            <Row k="Veículo" v={data.courier.vehicle ?? "—"} />
            <Row k="Marca" v={data.courier.vehicle_brand ?? "—"} />
            <Row k="Modelo" v={data.courier.vehicle_model ?? "—"} />
            <Row k="Placa" v={data.courier.vehicle_plate ?? "—"} />
            <Row k="Etapa atual" v={data.courier.stage ? label(courierStageLabel, data.courier.stage) : "—"} />
            <Row k="Status do pedido" v={label(orderStatusLabel, o.status)} />
            <Row k="Entrega concluída em" v={o.delivered_at ? dateTimeBR(o.delivered_at) : "—"} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico da entrega</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.events.length === 0 && <p className="text-sm text-muted-foreground">Sem histórico registrado.</p>}
          {data.events.map((e, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span>{EVENT_LABEL[e.kind] ?? e.kind}</span>
              <span className="text-muted-foreground">{dateTimeBR(e.created_at)}</span>
            </div>
          ))}
          {data.courier?.stage && (
            <p className="pt-1 text-xs text-muted-foreground">Etapa atual do entregador: {label(courierStageLabel, data.courier.stage)}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Pagamento</CardTitle></CardHeader>
        <CardContent>
          <Row k="Forma" v={label(paymentMethodLabel, o.payment_method)} />
          <Row k="Situação" v={label(paymentStatusLabel, o.payment_status)} />
          {data.payment.length === 0 && <p className="text-sm text-muted-foreground">Pagamento sem registro online (pago na entrega).</p>}
          {data.payment.map((p, i) => (
            <div key={i} className="mt-2 border-t pt-2">
              <Row k="Tipo" v={p.payment_type ?? p.payment_method ?? "—"} />
              <Row k="Status" v={label(paymentStatusLabel, p.status)} />
              <Row k="Valor" v={brl(p.amount)} />
              <Row k="Identificador" v={<span className="font-mono text-xs">{p.external_id ?? "—"}</span>} />
              <Row k="Pago em" v={p.paid_at ? dateTimeBR(p.paid_at) : "—"} />
            </div>
          ))}
          {refunded && <Row k="Estornado" v={`${brl(refunded.amount)} — ${dateTimeBR(refunded.paid_at ?? refunded.created_at)}`} />}
        </CardContent>
      </Card>
    </div>
  );
}
