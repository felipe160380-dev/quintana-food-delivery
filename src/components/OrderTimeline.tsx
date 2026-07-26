import { Check, ChefHat, Bike, PackageCheck, Receipt, Store, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "pending", label: "Pedido recebido", icon: Receipt },
  { key: "accepted", label: "Loja confirmou", icon: Store },
  { key: "preparing", label: "Preparando", icon: ChefHat },
  { key: "ready", label: "Pronto / aguardando entregador", icon: PackageCheck },
  { key: "out_for_delivery", label: "Saiu para entrega", icon: Bike },
  { key: "delivered", label: "Entregue", icon: Check },
];

export function OrderTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
        <XCircle className="size-5 text-destructive" />
        <div>
          <div className="text-sm font-semibold text-destructive">Pedido cancelado</div>
          <p className="text-xs text-muted-foreground">Este pedido não será entregue.</p>
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
        return (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
                  done && "border-success bg-success text-success-foreground",
                  active && "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30",
                  !done && !active && "border-border bg-muted text-muted-foreground",
                )}
              >
                <Icon className="size-4" />
              </div>
              {i < STEPS.length - 1 && (
                <span className={cn("my-0.5 w-0.5 flex-1 rounded", done ? "bg-success" : "bg-border")} />
              )}
            </div>
            <div className={cn("pb-4 pt-1.5", i === STEPS.length - 1 && "pb-0")}>
              <div
                className={cn(
                  "text-sm leading-none",
                  active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {s.label}
              </div>
              {active && (
                <div className="mt-1 text-xs text-muted-foreground">Etapa atual do seu pedido</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
