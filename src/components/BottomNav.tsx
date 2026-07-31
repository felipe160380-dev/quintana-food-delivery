import { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import { Home, ClipboardList, MapPin, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/hooks/use-auth";
import { primaryRole } from "@/lib/profile";
import { Badge } from "@/components/ui/badge";

type Item = { to: string; label: string; icon: typeof Home; badge?: boolean };

const CUSTOMER: Item[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/enderecos", label: "Endereços", icon: MapPin },
  { to: "/checkout", label: "Carrinho", icon: ShoppingBag, badge: true },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { count } = useCart();
  const { roles } = useAuth();
  const role = primaryRole(roles);

  if (pathname.startsWith("/auth") || pathname.startsWith("/adm-login")) return null;

  // Perfis operacionais usam a navegação do próprio painel (evita duplicidade).
  if (role !== "customer") return null;

  return (
    <>
      {/* Espaçador: garante que nenhum conteúdo fique atrás da barra fixa. */}
      <div className="h-nav safe-bottom sm:hidden" aria-hidden />
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur sm:hidden">
        <ul className="mx-auto grid max-w-6xl grid-cols-4">
          {CUSTOMER.map((it) => {
            const active = it.to === "/" ? pathname === "/" : pathname.startsWith(it.to);
            const Icon = it.icon;
            return (
              <li key={it.label}>
                <Link
                  to={it.to}
                  className={`relative flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors ${
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className={`size-5 shrink-0 transition-transform ${active ? "scale-110" : ""}`} />
                  <span className="max-w-full truncate">{it.label}</span>
                  {it.badge && count > 0 && (
                    <Badge className="absolute right-3 top-1 size-4 min-w-4 rounded-full p-0 text-[9px] tabular-nums">
                      {count > 9 ? "9+" : count}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="safe-bottom" />
      </nav>
    </>
  );
}
