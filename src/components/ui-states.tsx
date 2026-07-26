import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Estado vazio padronizado (mesma tipografia/espaçamento em todo o app). */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      {icon && (
        <div className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold">{title}</div>
      {description && (
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

/** Skeleton de card de loja/pedido. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="h-28 w-full animate-pulse bg-muted" />
      <div className="flex gap-3 p-3">
        <div className="-mt-8 size-14 shrink-0 animate-pulse rounded-2xl border-4 border-background bg-muted" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </Card>
  );
}

export function RowSkeleton() {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className="size-12 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
    </Card>
  );
}
