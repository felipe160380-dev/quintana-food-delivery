import { Check, ChefHat, Bike, PackageCheck, Receipt, Store, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrderEvent } from "@/hooks/use-order-tracking";

const STEPS = [
  { key: "pending", event: "created", label: "Pedido recebido", hint: "Enviamos seu pedido para a loja", icon: Receipt },
  { key: "accepted", event: "status_accepted", label: "Loja confirmou", hint: "A loja aceitou seu pedido", icon: Store },
  { key: "preparing", event: "status_preparing", label: "Preparando", hint: "Seu pedido está sendo preparado", icon: ChefHat },
  { key: "ready", event: "status_ready", label: "Pronto para retirada", hint: "Aguardando um entregador", icon: PackageCheck },
  { key: "out_for_delivery", event: "status_out_for_delivery", label: "Saiu para entrega", hint: "O entregador está a caminho", icon: Bike },
  { key: "delivered", event: "status_delivered", label: "Entregue", hint: "Bom apetite!", icon: Check },
];

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

export function OrderTimeline({ status, events = [] }: { status: string; events?: OrderEvent[] }) {
  const at = (kind: string) => events.find((e) => e.kind === kind)?.created_at;

  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
        <XCircle className="size-5 text-destructive" />
        <div>
          <div className="text-sm font-semibold text-destructive">Pedido cancelado</div>
          <p className="text-xs text-muted-foreground">
            Este pedido não será entregue{time(at("status_cancelled")) ? ` — ${time(at("status_cancelled"))}` : ""}.
          </p>
        </div>
      </div>
    );
  }

  const current = Math.max(0, STEPS.findIndex((s) => s.key === status));

  return (
    <ol className="relative space-y-0">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const Icon = s.icon;
        const stamp = time(at(s.event));
        return (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  active && "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30",
                  active && status !== "delivered" && "animate-pulse",
                  !done && !active && "border-border bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </div>
              {i < STEPS.length - 1 && (
                <span className={cn("my-0.5 w-0.5 flex-1 rounded", done ? "bg-success" : "bg-border")} />
              )}
            </div>
            <div className={cn("min-w-0 flex-1 pb-4 pt-1.5", i === STEPS.length - 1 && "pb-0")}>
              <div className="flex items-baseline justify-between gap-2">
                <div
                  className={cn(
                    "text-sm leading-none",
                    active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </div>
                {stamp && <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{stamp}</span>}
              </div>
              {(active || done) && <div className="mt-1 text-xs text-muted-foreground">{s.hint}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
